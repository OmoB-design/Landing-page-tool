"""The layout check for editable pages in Shopify (B4.3, D122; BUILD_SPEC §12.6 step 4).

Splitting a page into Shopify sections gives each section its own copy of the elements around it,
which breaks what depends on sharing them: columns side by side (an article and its sticky product
card), sticky bars that pin across sections, margins between sections. This checks the page as
Shopify would serve it (`shopify_render`) against the page as built, in Chromium, at desktop,
tablet and phone, and fixes the split until they match:

1. Every element is marked (`data-parity`) and both pages are measured: every element's box, and
   the sticky ones again while the page is scrolled a third and two thirds of the way.
2. From the original: wrappers several sections share that only group things (no box of their own
   at any width) become **transparent** (their copies take no box, `display: contents`); shared
   containers holding sections **side by side** are **kept together** as one Shopify section.
3. Up to three tries: build, render, compare (4 px, or 1 % of the width); on a difference, the
   nearest shared container around the first part that differs is kept together too.
4. Still different: **coarse** — the outermost shared containers kept together (fewer, larger
   sections; everything still editable).

Elements are matched between the marked page and the clean one by their place in the page
(`path`), so the files uploaded are built from the clean page, without markers.
"""

import tempfile
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from bs4 import BeautifulSoup
from bs4.element import Tag
from playwright.sync_api import Page, sync_playwright

from app.engines import editor_map as em
from app.engines import shopify_render, shopify_theme
from app.engines.html import parse, serialize
from app.fetch.browser import _ONE_BROWSER
from app.models.editor_map import EditorMap, LayoutCheck

VIEWPORTS: tuple[tuple[str, int, int], ...] = (
    ("desktop", 1280, 900),
    ("tablet", 768, 1024),
    ("phone", 390, 844),
)
TRIES = 4
SCROLLS = (0.33, 0.66)
LOAD_TIMEOUT = 30_000
Box = tuple[int, int, int, int]
Path_ = tuple[int, ...]

_MEASURE = """
(ask) => {
  const boxes = {}, counts = {}, sticky = [];
  for (const el of document.querySelectorAll('[data-parity]')) {
    const id = el.getAttribute('data-parity');
    counts[id] = (counts[id] || 0) + 1;
    const r = el.getBoundingClientRect();
    boxes[id] = [Math.round(r.left + scrollX), Math.round(r.top + scrollY),
                 Math.round(r.width), Math.round(r.height)];
    const position = getComputedStyle(el).position;
    if (position === 'sticky' || position === 'fixed') sticky.push(id);
  }
  const styles = {};
  for (const id of ask) {
    const el = document.querySelector('[data-parity="' + id + '"]');
    if (!el) continue;
    const s = getComputedStyle(el);
    styles[id] = [s.display, s.position, s.paddingTop, s.paddingRight, s.paddingBottom,
                  s.paddingLeft, s.marginTop, s.marginRight, s.marginBottom, s.marginLeft,
                  s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth,
                  s.backgroundColor, s.backgroundImage, s.overflowX, s.overflowY, s.transform,
                  s.filter, s.opacity, s.boxShadow].join('|');
  }
  const body = getComputedStyle(document.body);
  return {height: document.documentElement.scrollHeight, boxes, counts, sticky, styles,
          body: [body.backgroundColor, body.backgroundImage]};
}
"""
_PINNED = """
(ids) => {
  const out = {};
  for (const id of ids) {
    const el = document.querySelector('[data-parity="' + id + '"]');
    if (!el) continue;
    const r = el.getBoundingClientRect();
    out[id] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  }
  return out;
}
"""
_SETTLE = """
async () => {
  for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
  const pending = [...document.images].filter((img) => !img.complete).map((img) =>
    new Promise((done) => { img.onload = img.onerror = done; }));
  await Promise.race([Promise.all(pending), new Promise((done) => setTimeout(done, 8000))]);
  await document.fonts.ready;
}
"""


@dataclass
class Shot:
    width: int
    height: int
    boxes: dict[str, Box]
    counts: dict[str, int]
    sticky: list[str]
    styles: dict[str, str]
    body: list[str]
    pinned: dict[float, dict[str, Box]] = field(default_factory=dict)


@dataclass
class LayoutResult:
    files: shopify_theme.ThemeFiles
    mode: Literal["sections", "grouped", "coarse"]
    matched: bool
    tries: int
    kept_together: list[str]
    differences: list[str]
    widths: dict[str, bool]
    # How it got there, try by try (for the record and for debugging a template).
    log: list[str] = field(default_factory=list)


# ── Marking and matching ──────────────────────────────────────────────────────


def _path(tag: Tag) -> Path_:
    """Where the element is in the page: its index among its parent's elements, from the body."""
    steps: list[int] = []
    node: Tag | None = tag
    while node is not None and node.name not in ("body", "html", "[document]"):
        parent = node.parent
        if not isinstance(parent, Tag):
            break
        siblings = [c for c in parent.children if isinstance(c, Tag)]
        steps.append(next(i for i, c in enumerate(siblings) if c is node))
        node = parent
    return tuple(reversed(steps))


def _marked(html: str) -> tuple[str, BeautifulSoup, dict[str, Tag]]:
    """The page with every element marked, without its scripts (Shopify's copy has none, so the
    original is compared as it looks without them too)."""
    soup = parse(html)
    for script in soup.find_all(["script", "noscript"]):
        script.decompose()
    body = soup.body or soup
    by_id: dict[str, Tag] = {}
    for index, tag in enumerate(body.find_all(True)):
        if isinstance(tag, Tag):
            tag[shopify_theme.PARITY] = str(index)
            by_id[str(index)] = tag
    return serialize(soup), soup, by_id


def _picker(paths: set[Path_]) -> Callable[[Tag], bool]:
    cache: dict[int, bool] = {}

    def pick(tag: Tag) -> bool:
        key = id(tag)
        if key not in cache:
            cache[key] = _path(tag) in paths
        return cache[key]

    return pick


# ── Measuring ─────────────────────────────────────────────────────────────────


def _shoot(
    page: Page, file: Path, width: int, height: int, ask: list[str], sticky: list[str]
) -> Shot:
    page.set_viewport_size({"width": width, "height": height})
    page.goto(file.as_uri(), wait_until="load", timeout=LOAD_TIMEOUT)
    page.evaluate(_SETTLE)
    page.wait_for_timeout(150)
    data: dict[str, Any] = page.evaluate(_MEASURE, ask)
    shot = Shot(
        width=width,
        height=int(data["height"]),
        boxes={k: (v[0], v[1], v[2], v[3]) for k, v in data["boxes"].items()},
        counts=data["counts"],
        sticky=list(data["sticky"]),
        styles=data["styles"],
        body=list(data["body"]),
    )
    watch = sticky or shot.sticky
    for share in SCROLLS:
        y = round(share * max(0, shot.height - height))
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(80)
        pinned: dict[str, list[int]] = page.evaluate(_PINNED, watch)
        shot.pinned[share] = {k: (v[0], v[1], v[2], v[3]) for k, v in pinned.items()}
    return shot


def _differences(original: Shot, shopify: Shot) -> list[tuple[int, str, int]]:
    """(the original's y, element, how far off) for each element out of place, top first."""
    tolerance = max(4, round(original.width * 0.01))
    found: list[tuple[int, str, int]] = []
    for key, box in original.boxes.items():
        if original.counts.get(key) != 1 or shopify.counts.get(key) != 1:
            continue  # copies of shared parents: there's no one box to compare
        other = shopify.boxes.get(key)
        if other is None or (box[2] == 0 and box[3] == 0 and other[2] == 0 and other[3] == 0):
            continue
        off = max(abs(a - b) for a, b in zip(box, other, strict=True))
        if off > tolerance:
            found.append((box[1], key, off))
    for share, boxes in original.pinned.items():
        for key, box in boxes.items():
            other = shopify.pinned.get(share, {}).get(key)
            if other is None:
                continue
            off = max(abs(a - b) for a, b in zip(box, other, strict=True))
            if off > tolerance:
                found.append((original.boxes.get(key, (0, 0, 0, 0))[1], key, off))
    return sorted(found)


def _pure(style: str | None) -> bool:
    """A wrapper with no box of its own: no spacing, edge, fill, position or layout of its own."""
    if not style:
        return False
    parts = style.split("|")
    display, position = parts[0], parts[1]
    spacing = parts[2:14]
    background, image, overflow_x, overflow_y = parts[14:18]
    transform, filters, opacity, shadow = parts[18:22]
    return (
        display in ("block", "contents")
        and position == "static"
        and all(v in ("0px", "0") for v in spacing)
        and background in ("rgba(0, 0, 0, 0)", "transparent")
        and image == "none"
        and overflow_x == "visible"
        and overflow_y == "visible"
        and transform == "none"
        and filters == "none"
        and opacity == "1"
        and shadow == "none"
    )


# ── The check ─────────────────────────────────────────────────────────────────


def check(
    html: str,
    editor_map: EditorMap,
    *,
    slug: str,
    version: int,
    shop_files: dict[str, str] | None = None,
) -> LayoutResult:
    """Theme files for the page whose Shopify render matches the page as built, as far as it
    can; the result says how it was split and whether it matched."""
    marked_html, _, by_id = _marked(html)
    log: list[str] = []
    base = em.walk(parse(marked_html), editor_map)
    if not base.sections:
        raise shopify_theme.ThemeTooBigError(
            "The page has no sections marked, so it can't be made editable."
        )
    # Each part (a section, or loose parts gathered) and the shared containers around them.
    unit_roots: list[list[str]] = [
        [str(r.get(shopify_theme.PARITY)) for r in w.roots] for w in base.sections
    ]
    unit_names = [w.plan.name for w in base.sections]
    unit_of: dict[str, int] = {}
    for index, walked in enumerate(base.sections):
        for root in walked.roots:
            for tag in [root, *root.find_all(True)]:
                if isinstance(tag, Tag) and tag.get(shopify_theme.PARITY):
                    unit_of[str(tag[shopify_theme.PARITY])] = index
    above: dict[int, list[str]] = {}  # each part's containers, nearest first
    holding: dict[str, set[int]] = {}
    for index, roots in enumerate(unit_roots):
        chain: list[str] = []
        for root_id in roots:
            node = by_id[root_id].parent
            while isinstance(node, Tag) and node.name not in ("body", "html", "[document]"):
                key = str(node.get(shopify_theme.PARITY) or "")
                if key and key not in chain:
                    chain.append(key)
                    holding.setdefault(key, set()).add(index)
                node = node.parent
        above[index] = chain
    shared = {key for key, units in holding.items() if len(units) >= 2}
    paths = {key: _path(by_id[key]) for key in shared}

    def outermost(keys: set[str]) -> set[str]:
        return {k for k in keys if not any(other in keys for other in _ancestors(by_id[k]))}

    with tempfile.TemporaryDirectory(prefix="lp-parity-") as folder, _ONE_BROWSER:
        work = Path(folder)
        (work / "original.html").write_text(marked_html, encoding="utf-8")
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            try:
                page = browser.new_page()
                originals = {
                    name: _shoot(page, work / "original.html", w, h, sorted(shared), [])
                    for name, w, h in VIEWPORTS
                }
                # Transparent: shared wrappers with no box of their own at any width, as wide as
                # their parent.
                transparent = {
                    key
                    for key in shared
                    if all(
                        _pure(shot.styles.get(key)) and _as_wide(shot, key, by_id)
                        for shot in originals.values()
                    )
                }
                together = _side_by_side(originals, unit_roots, above, shared)
                body_css = _body_css(originals["desktop"])

                def attempt(
                    keep: set[str],
                ) -> tuple[shopify_theme.ThemeFiles, dict[str, list[tuple[int, str, int]]]]:
                    files = shopify_theme.build(
                        marked_html, editor_map, slug=slug, version=version,
                        together=_picker({paths[k] for k in keep}),
                        transparent=_picker({paths[k] for k in transparent - keep}),
                        extra_css=body_css, keep_markers=True,
                    )  # fmt: skip
                    (work / "shopify.html").write_text(
                        shopify_render.render(files), encoding="utf-8"
                    )
                    found = {}
                    for name, w, h in VIEWPORTS:
                        shot = _shoot(page, work / "shopify.html", w, h, [], originals[name].sticky)
                        found[name] = _differences(originals[name], shot)
                    return files, found

                log.append(
                    f"start: {len(transparent)} wrappers transparent, side by side: "
                    + (", ".join(_describe(by_id[k]) for k in together) or "none")
                )
                tries, mode = 0, "sections"
                found: dict[str, list[tuple[int, str, int]]] = {}
                cleared: set[str] = set()  # containers already tried as transparent
                for _ in range(TRIES):
                    tries += 1
                    _, found = attempt(together)
                    if not any(found.values()):
                        break
                    culprit = _culprit(found, unit_of)
                    chain = [
                        k for k in (above.get(culprit, []) if culprit is not None else [])
                        if k in shared and k not in together
                        and not any(a in together for a in _ancestors(by_id[k]))
                    ]  # fmt: skip
                    if not chain:
                        break
                    first = [
                        f"{w} {_describe(by_id[k])} {off}px"
                        for w, items in found.items()
                        for _, k, off in items[:2]
                    ]
                    summary = f"try {tries}: {sum(len(v) for v in found.values())} differences "
                    summary += f"({'; '.join(first)})"
                    # First the nearest container around it that still has a box of its own,
                    # without one: the sections stay apart if its own styling doesn't matter.
                    clear = next(
                        (k for k in chain if k not in transparent and k not in cleared), None
                    )
                    if clear is not None:
                        cleared.add(clear)
                        transparent = transparent | {clear}
                        log.append(f"{summary}; made {_describe(by_id[clear])} transparent")
                        continue
                    nearest = chain[0]
                    log.append(f"{summary}; kept together {_describe(by_id[nearest])}")
                    transparent = transparent - cleared
                    together = together | {nearest}
                matched = not any(found.values())
                if not matched:
                    mode = "coarse"
                    together = outermost(shared)
                    _, found = attempt(together)
                    matched = not any(found.values())
                elif together:
                    mode = "grouped"
            finally:
                browser.close()

    final = shopify_theme.build(
        html, editor_map, slug=slug, version=version, shop_files=shop_files,
        together=_picker({paths[k] for k in together}),
        transparent=_picker({paths[k] for k in transparent - together}),
        extra_css=body_css,
    )  # fmt: skip
    kept = sorted({unit_names[i] for k in together for i in holding.get(k, set())})
    differences = []
    for name, items in found.items():
        for _, key, off in items[:2]:
            part = unit_of.get(key)
            label = f"“{unit_names[part]}”" if part is not None else "a part outside the sections"
            differences.append(f"{name.capitalize()}: {label} is off by {off} px.")
    return LayoutResult(
        files=final,
        mode=mode,  # type: ignore[arg-type]
        matched=matched,
        tries=tries,
        kept_together=kept,
        differences=differences[:6],
        widths={name: not items for name, items in found.items()},
        log=log,
    )


def _describe(tag: Tag) -> str:
    value: Any = tag.get("class") or []
    classes = ".".join(value[:2]) if isinstance(value, list) else str(value)
    return f"{tag.name}{'.' + classes if classes else ''}"


def _ancestors(tag: Tag) -> list[str]:
    out = []
    for parent in tag.parents:
        if isinstance(parent, Tag) and parent.get(shopify_theme.PARITY):
            out.append(str(parent[shopify_theme.PARITY]))
    return out


def _as_wide(shot: Shot, key: str, by_id: dict[str, Tag]) -> bool:
    box = shot.boxes.get(key)
    parent = by_id[key].parent
    parent_key = str(parent.get(shopify_theme.PARITY) or "") if isinstance(parent, Tag) else ""
    if box is None:
        return False
    if not parent_key:  # straight under the body
        return box[0] == 0 and abs(box[2] - shot.width) <= 1
    outer = shot.boxes.get(parent_key)
    return outer is not None and abs(outer[0] - box[0]) <= 1 and abs(outer[2] - box[2]) <= 1


def _side_by_side(
    shots: dict[str, Shot],
    roots: list[list[str]],
    above: dict[int, list[str]],
    shared: set[str],
) -> set[str]:
    """Shared containers holding parts that sit side by side at some width (columns)."""
    keep: set[str] = set()
    for shot in shots.values():
        spans: list[tuple[int, Box]] = []
        for index, ids in enumerate(roots):
            for key in ids:
                box = shot.boxes.get(key)
                if box and box[2] > 0 and box[3] > 0:
                    spans.append((index, box))
        for i, (a, box_a) in enumerate(spans):
            for b, box_b in spans[i + 1 :]:
                if a == b:
                    continue
                overlap_y = min(box_a[1] + box_a[3], box_b[1] + box_b[3]) - max(box_a[1], box_b[1])
                overlap_x = min(box_a[0] + box_a[2], box_b[0] + box_b[2]) - max(box_a[0], box_b[0])
                if overlap_y > 8 and overlap_x <= 8:
                    common = next((k for k in above.get(a, []) if k in above.get(b, [])), None)
                    if common in shared:
                        keep.add(common)
    return keep


def _culprit(found: dict[str, list[tuple[int, str, int]]], unit_of: dict[str, int]) -> int | None:
    """The part holding the topmost element out of place (desktop first)."""
    for name, _, _ in VIEWPORTS:
        for _, key, _ in found.get(name, []):
            if key in unit_of:
                return unit_of[key]
    return None


def _body_css(shot: Shot) -> str:
    """The body's fill, which a class on the original's body may give (the copies don't have it)."""
    color, image = [*shot.body, "", ""][:2]
    rules = []
    if color and color not in ("rgba(0, 0, 0, 0)", "transparent"):
        rules.append(f"background-color: {color};")
    if image and image != "none" and "url(" not in image:
        rules.append(f"background-image: {image};")
    return f"body {{ {' '.join(rules)} }}" if rules else ""


def summary(result: LayoutResult, *, version: int) -> LayoutCheck:
    """What the template editor's card keeps of a check: the outcome, not the files."""
    return LayoutCheck(
        version=version,
        checked_at=datetime.now(UTC),
        matched=result.matched,
        mode=result.mode,
        sections=result.files.sections,
        kept_together=result.kept_together,
        widths=result.widths,
        differences=result.differences[:6],
    )
