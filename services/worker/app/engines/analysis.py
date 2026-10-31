"""Analysing a cloned page (BUILD_SPEC §8.4 "Analyze", B2.2). Pure: HTML in, a digest for the
model out; then the model's answer applied back to the page.

1. `digest`: the page's colours, images, links, headings, the first 4,000 characters of text
   and its candidate blocks. Blocks come from the content down: wrappers holding everything are
   stepped through, any block holding more than a quarter of the words is opened up, and a long
   flat article is cut into runs that start at its headings. Headers, footers and navigation
   stay whole (the build strips them).
2. The model (in the job) names the source's colours, brand words, logos, buy links and
   variant pickers, picks the blocks that are sections with a role and name, and drafts rules.
3. `apply`: the chosen blocks get `data-lp-section` and `data-lp-role`; a run of siblings is
   wrapped in a `div[data-lp-wrap]` first. `untag` undoes both, so a page can be analysed again.
4. `length_caps`: each heading and short button's budget, about 12 % over its current length,
   matched the way the copy pass names its lines (`tag.class1.class2`, `h2@<role>`).
"""

import math
import re
from dataclasses import dataclass, field
from itertools import pairwise
from typing import Any

from bs4 import BeautifulSoup
from bs4.element import Tag

from app.engines.colors import is_neutral, parse_color, to_hex
from app.engines.html import parse, serialize, style_text, text_nodes

SKIP = {"script", "style", "noscript", "link", "meta", "template", "br", "input", "base"}
FLOW = {
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "figure", "img",
    "table", "hr", "picture", "dl", "pre", "span", "strong", "em", "a",
}  # fmt: skip
HEADINGS = ("h2", "h3", "h4")
CHROME = re.compile(r"(^|[\s_-])(header|footer|nav|navbar|menu|cookie|drawer|popup|modal)", re.I)
CTA_TEXT = re.compile(
    r"\b(buy|shop|order|get|claim|try|check|see|add to|start|learn|discover|yes|save)\b", re.I
)
CTA_HREF = re.compile(r"/products?/|/cart|/checkout|checkout|offer|order", re.I)
SPLIT_SHARE = 0.25  # a block holding more of the page's words than this is opened up
MAX_BLOCKS = 60
MAX_IMAGES = 60
MAX_LINKS = 60
MAX_TEXT = 4_000
CAP_MARGIN = 1.12
MAX_CAPS = 30
DUPLICABLE_ROLES = {"testimonials", "social_proof", "benefits", "ingredients", "faq"}


@dataclass
class Block:
    id: str
    nodes: list[Tag]  # one element, or a run of siblings that will be wrapped

    @property
    def words(self) -> int:
        return sum(_words(n) for n in self.nodes)


@dataclass
class PageDigest:
    title: str | None
    source_host: str
    source_name: str | None
    colours: list[dict[str, Any]] = field(default_factory=list)
    blocks: list[dict[str, Any]] = field(default_factory=list)
    images: list[dict[str, Any]] = field(default_factory=list)
    links: list[dict[str, Any]] = field(default_factory=list)
    headings: list[str] = field(default_factory=list)
    text: str = ""

    def for_model(self) -> dict[str, Any]:
        return {
            "page": {"title": self.title, "site": self.source_host, "name": self.source_name},
            "colours": self.colours,
            "blocks": self.blocks,
            "images": self.images,
            "links": self.links,
            "headings": self.headings,
            "text": self.text,
        }


# ── blocks ────────────────────────────────────────────────────────────────────


def _significant(tag: Tag) -> list[Tag]:
    return [c for c in tag.children if isinstance(c, Tag) and c.name not in SKIP]


def _words(tag: Tag) -> int:
    return len(tag.get_text(" ", strip=True).split())


def _has_media(tag: Tag) -> bool:
    return tag.name in ("img", "picture") or bool(
        tag.find(["img", "picture"]) or tag.select_one(".lp-media-slot")
    )


def _chrome(tag: Tag) -> bool:
    if tag.name in ("header", "footer", "nav"):
        return True
    hint = " ".join([str(tag.get("id") or ""), *(tag.get_attribute_list("class") or [])])
    return bool(CHROME.search(hint))


def _step_in(tag: Tag) -> Tag:
    """Through wrappers that hold a single element."""
    while True:
        kids = _significant(tag)
        if len(kids) != 1 or kids[0].name in FLOW:
            return tag
        tag = kids[0]


def _heading_only(tag: Tag, level: str) -> bool:
    """A heading, or a wrapper holding little but one (page builders wrap every element)."""
    if tag.name == level:
        return True
    heading = tag.find(level)
    return isinstance(heading, Tag) and _words(tag) <= _words(heading) + 3


def _runs(kids: list[Tag]) -> list[list[Tag]] | None:
    """Siblings cut into runs that each start at a heading (h2, else h3, else h4)."""
    for level in HEADINGS:
        starts = [i for i, k in enumerate(kids) if _heading_only(k, level)]
        if len(starts) >= 2:
            cuts = ([0] if starts[0] > 0 else []) + starts + [len(kids)]
            return [kids[a:b] for a, b in pairwise(cuts) if kids[a:b]]
    return None


def _open(tag: Tag) -> list[list[Tag]]:
    """A container's parts: its children, or, for a flat article (mostly paragraphs and headings,
    or a page builder's list of same-shaped wrappers), runs that each start at a heading."""
    kids = _significant(tag)
    shapes: dict[str, int] = {}
    for kid in kids:
        shape = ".".join([kid.name, *[c for c in kid.get_attribute_list("class") or [] if c][:1]])
        shapes[shape] = shapes.get(shape, 0) + 1
    flat = len(kids) >= 6 and (
        sum(k.name in FLOW for k in kids) >= 0.6 * len(kids)
        or max(shapes.values(), default=0) >= 0.7 * len(kids)
    )
    return (_runs(kids) if flat else None) or [[k] for k in kids]


def candidate_blocks(soup: BeautifulSoup) -> list[Block]:
    root = soup.body if isinstance(soup.body, Tag) else soup
    total = max(1, _words(root))
    parts = _open(_step_in(root))
    for _ in range(8):
        opened: list[list[Tag]] = []
        changed = False
        for index, part in enumerate(parts):
            node = part[0]
            big = (
                sum(_words(n) for n in part) > SPLIT_SHARE * total
                and not _chrome(node)
                and len(opened) + len(parts) - index < MAX_BLOCKS
            )
            # A big element opens up; a big run is cut again at its smaller headings.
            inner = (_open(_step_in(node)) if len(part) == 1 else _runs(part)) if big else None
            if inner and len(inner) >= 2:
                opened.extend(inner)
                changed = True
                continue
            opened.append(part)
        parts = opened
        if not changed:
            break
    kept = [p for p in parts if any(_words(n) or _has_media(n) for n in p)][:MAX_BLOCKS]
    return [Block(id=f"b{i + 1}", nodes=p) for i, p in enumerate(kept)]


def _hint(tag: Tag) -> str:
    classes = [c for c in tag.get_attribute_list("class") or [] if c][:3]
    ident = str(tag.get("id") or "")[:30]
    return "".join([tag.name, f"#{ident}" if ident else "", *(f".{c[:30]}" for c in classes)])


def _block_summary(block: Block) -> dict[str, Any]:
    first = block.nodes[0]
    heading = next(
        (h for n in block.nodes for h in ([n] if n.name in ("h1", "h2", "h3") else [])
         + n.find_all(["h1", "h2", "h3"], limit=1)),
        None,
    )  # fmt: skip
    text = " ".join(" ".join(n.get_text(" ", strip=True).split()) for n in block.nodes)
    return {
        "id": block.id,
        "element": _hint(first)
        + (f" (+{len(block.nodes) - 1} siblings)" if len(block.nodes) > 1 else ""),
        "chrome": _chrome(first),
        "words": block.words,
        "images": sum(len(n.find_all("img")) + (n.name == "img") for n in block.nodes),
        "media_slots": sum(len(n.select(".lp-media-slot")) for n in block.nodes),
        "heading": " ".join(heading.get_text(" ", strip=True).split())[:120] if heading else None,
        "starts": text[:160],
    }


# ── the digest ────────────────────────────────────────────────────────────────


def _colours(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """Colour literals in the page's styles by how often they appear, merged by hex: the
    saturated ones first (brand candidates), then the darkest and lightest neutrals."""
    css = " ".join(style_text(s) for s in soup.find_all("style") if isinstance(s, Tag))
    css += " " + " ".join(str(t["style"]) for t in soup.find_all(style=True) if isinstance(t, Tag))
    found = re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)", css)
    counts: dict[str, int] = {}
    for token in found:
        rgb = parse_color(token)
        if rgb is not None:
            counts[to_hex(rgb)] = counts.get(to_hex(rgb), 0) + 1
    total = max(1, sum(counts.values()))
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])
    saturated = [(h, n) for h, n in ranked if not is_neutral(parse_color(h) or (0, 0, 0))][:12]
    neutral = [(h, n) for h, n in ranked if is_neutral(parse_color(h) or (0, 0, 0))][:4]
    return [
        {"hex": h, "share": round(n / total, 3), "neutral": h in dict(neutral)}
        for h, n in saturated + neutral
    ]


def _block_of(tag: Tag, owners: dict[int, str]) -> str | None:
    for node in [tag, *tag.parents]:
        if id(node) in owners:
            return owners[id(node)]
    return None


def digest(
    html: str, *, source_host: str, source_name: str | None, title: str | None
) -> tuple[PageDigest, list[Block], BeautifulSoup]:
    """The page as the model reads it, its candidate blocks, and the parsed page they point
    into (pass it to `apply`)."""
    soup = parse(html)
    blocks = candidate_blocks(soup)
    owners = {id(n): b.id for b in blocks for n in b.nodes}
    page = PageDigest(title=title, source_host=source_host, source_name=source_name)
    page.colours = _colours(soup)
    page.blocks = [_block_summary(b) for b in blocks]
    for img in soup.find_all("img"):
        if not isinstance(img, Tag) or len(page.images) >= MAX_IMAGES:
            continue
        src = str(img.get("src") or "")
        if not src.startswith(("http://", "https://")):
            continue
        hint = " ".join([str(img.get("id") or ""), *(img.get_attribute_list("class") or [])])
        link = img.find_parent("a")
        page.images.append({
            "id": len(page.images),
            "src": src[:300],
            "alt": str(img.get("alt") or "")[:120],
            "hint": hint.strip()[:80],
            "size": f"{img.get('width') or '?'}x{img.get('height') or '?'}",
            "links_to": str(link.get("href") or "")[:200] if isinstance(link, Tag) else None,
            "block": _block_of(img, owners),
        })  # fmt: skip
    seen: set[str] = set()
    for anchor in soup.find_all(["a", "button"]):
        if not isinstance(anchor, Tag) or len(page.links) >= MAX_LINKS:
            continue
        href = str(anchor.get("href") or "")
        text = " ".join(anchor.get_text(" ", strip=True).split())[:80]
        if not text and not href:
            continue
        key = f"{href}|{text}"
        if key in seen:
            continue
        seen.add(key)
        page.links.append({
            "id": len(page.links),
            "text": text,
            "href": href[:300],
            "looks_like_cta": bool(CTA_TEXT.search(text) or CTA_HREF.search(href)),
            "block": _block_of(anchor, owners),
        })  # fmt: skip
    page.headings = [
        f"{h.name}: {' '.join(h.get_text(' ', strip=True).split())[:120]}"
        for h in soup.find_all(["h1", "h2", "h3"])[:40]
        if isinstance(h, Tag) and h.get_text(strip=True)
    ]
    body = soup.body if isinstance(soup.body, Tag) else soup
    page.text = " ".join(" ".join(str(t).split()) for t in text_nodes(body) if str(t).strip())[
        :MAX_TEXT
    ]
    return page, blocks, soup


# ── applying the answer ───────────────────────────────────────────────────────


def section_key(label: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")[:32].strip("-") or "section"
    key, n = base, 2
    while key in taken:
        key, n = f"{base}-{n}", n + 1
    taken.add(key)
    return key


@dataclass
class ChosenSection:
    blocks: list[str]
    role: str
    label: str


def apply(
    soup: BeautifulSoup, blocks: list[Block], chosen: list[ChosenSection]
) -> tuple[str, list[dict[str, Any]], dict[str, int]]:
    """Tags the chosen blocks as sections, in page order. A section of several blocks (or a run)
    is wrapped when its pieces are siblings; otherwise only its first block is used. Returns the
    page, the section rows (with the blocks each came from) and stats."""
    by_id = {b.id: b for b in blocks}
    order = {b.id: i for i, b in enumerate(blocks)}
    stats = {"sections": 0, "wrapped": 0, "skipped": 0}
    used: set[str] = set()
    picks: list[tuple[int, list[Tag], list[str], ChosenSection]] = []
    for section in chosen:
        ids = [i for i in dict.fromkeys(section.blocks) if i in by_id and i not in used]
        if not ids:
            stats["skipped"] += 1
            continue
        ids.sort(key=order.__getitem__)
        nodes = [n for i in ids for n in by_id[i].nodes]
        parent = nodes[0].parent
        if any(n.parent is not parent for n in nodes):
            nodes, ids = list(by_id[ids[0]].nodes), ids[:1]
        used.update(ids)
        picks.append((order[ids[0]], nodes, ids, section))
    taken: set[str] = set()
    rows: list[dict[str, Any]] = []
    for _, nodes, ids, section in sorted(picks, key=lambda p: p[0]):
        if len(nodes) == 1:
            target = nodes[0]
        else:
            target = soup.new_tag("div")
            target["data-lp-wrap"] = ""
            nodes[0].insert_before(target)
            for node in nodes:
                target.append(node.extract())
            stats["wrapped"] += 1
        key = section_key(section.label, taken)
        target["data-lp-section"] = key
        target["data-lp-role"] = section.role
        rows.append({
            "key": key, "role": section.role, "label": section.label, "position": len(rows),
            "removable": True, "duplicable": section.role in DUPLICABLE_ROLES, "blocks": ids,
        })  # fmt: skip
        stats["sections"] += 1
    return serialize(soup), rows, stats


def untag(html: str) -> str:
    """The page before analysis: section marks removed, wrappers unwrapped."""
    soup = parse(html)
    for wrap in soup.select("[data-lp-wrap]"):
        wrap.unwrap()
    for tag in soup.select("[data-lp-section], [data-lp-role]"):
        for attr in ("data-lp-section", "data-lp-role"):
            if tag.has_attr(attr):
                del tag[attr]
    return serialize(soup)


def length_caps(html: str) -> list[dict[str, Any]]:
    """Budgets for headings and short buttons inside sections: the longest current text for
    each line name, plus about 12 %."""
    soup = parse(html)
    longest: dict[str, int] = {}
    for tag in soup.select("[data-lp-section] :is(h1, h2, h3, button, a)"):
        if not isinstance(tag, Tag):
            continue
        text = " ".join(tag.get_text(" ", strip=True).split())
        if not text or (tag.name in ("a", "button") and len(text) > 40):
            continue
        classes = [str(c) for c in tag.get_attribute_list("class") if c][:2]
        # A cap applies to every line whose name contains its match, so a bare "a" would cap
        # nearly everything: classless links and buttons get none, classless headings "h2@"
        # (inside a section, the copy pass names them "h2@<role>").
        if not classes and tag.name in ("a", "button"):
            continue
        match = ".".join([tag.name, *classes]) if classes else f"{tag.name}@"
        longest[match] = max(longest.get(match, 0), len(text))
    ranked = sorted(longest.items(), key=lambda kv: (kv[0].split(".")[0], -kv[1]))
    return [
        {"match": match, "max_chars": max(8, math.ceil(length * CAP_MARGIN))}
        for match, length in ranked[:MAX_CAPS]
    ]


def heuristic(page: PageDigest) -> dict[str, Any]:
    """An answer from the digest alone, in the model's shape: the mock reply (tests and local
    runs without AI). Never saved in place of a failed AI call (D24)."""
    saturated = [c["hex"] for c in page.colours if not c["neutral"]]
    primary = saturated[0] if saturated else "#000000"
    neutral_dark = next(
        (
            c["hex"]
            for c in page.colours
            if c["neutral"] and (parse_color(c["hex"]) or (255,))[0] < 80
        ),
        None,
    )
    logos = [
        i["id"] for i in page.images
        if "logo" in f"{i['src']} {i['alt']} {i['hint']}".lower()
    ][:3]  # fmt: skip
    sections = [
        {
            "blocks": [b["id"]],
            "role": "hero" if index == 0 else "other",
            "label": (b["heading"] or f"Section {index + 1}")[:40],
        }
        for index, b in enumerate(x for x in page.blocks if not x["chrome"] and x["words"] >= 5)
    ]
    tokens = [t for t in (page.source_name, page.source_host.split(".")[0].title()) if t]
    return {
        "palette": {
            "primary": primary,
            "dark": neutral_dark or primary,
            "tint": next((c["hex"] for c in page.colours if c["neutral"]), "#f5f5f5"),
            "accent": saturated[1] if len(saturated) > 1 else primary,
        },
        "brand_tokens": list(dict.fromkeys(tokens)),
        "logo_images": logos,
        "cta_links": [link["id"] for link in page.links if link["looks_like_cta"]][:10],
        "variant_blocks": [],
        "sections": sections,
        "keep_images": [],
        "generic_images": [],
        "forbidden_terms": list(dict.fromkeys(tokens)),
        "copy_rules": "",
        "image_rules": "",
        "notes": "Mock analysis (no AI): sections are the page's main blocks.",
    }
