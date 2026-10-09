"""Section layout (BUILD_SPEC §8.2, §10.2 `apply_section_layout`): put a page's
`data-lp-section` blocks in the order of the template's section rows, removing sections that
are not listed and duplicating `<key>-2` copies of duplicable ones. Pure."""

import copy
import re

from bs4 import Tag

from app.engines.html import parse, serialize, set_text

DUPLICATE_KEY = re.compile(r"^(?P<base>.+)-(?P<n>\d+)$")


def top_level_sections(root: Tag) -> list[Tag]:
    """Sections that are not inside another section, in document order."""
    return [
        tag
        for tag in root.select("[data-lp-section]")
        if isinstance(tag, Tag) and tag.find_parent(attrs={"data-lp-section": True}) is None
    ]


def apply_layout(html: str, keys: list[str]) -> tuple[str, dict[str, object]]:
    """Makes the page's sections match `keys` (the template's rows sorted by position):
    sections not listed are removed, `<key>-<n>` copies of a listed section are added after it,
    and sections are reordered within their container (a section never moves out of the element
    that holds it; that is reported). A no-op when the page already matches."""
    soup = parse(html)
    sections = top_level_sections(soup)
    current = [str(s["data-lp-section"]) for s in sections]
    warnings: list[str] = []
    stats: dict[str, object] = {
        "in_order": current == keys,
        "moved": 0,
        "removed": [],
        "duplicated": [],
        "warnings": warnings,
    }
    if not keys or current == keys:
        return html, stats

    by_key = {str(s["data-lp-section"]): s for s in sections}
    removed = [key for key in current if key not in keys]
    for key in removed:
        by_key.pop(key).extract()
    duplicated: list[str] = []
    for key in keys:
        if key in by_key:
            continue
        match = DUPLICATE_KEY.match(key)
        base = by_key.get(match.group("base")) if match else None
        if base is None or match is None:
            warnings.append(f"Section {key} is not in the page.")
            continue
        clone = _copy_section(base, key)
        last = base
        for other_key, other in by_key.items():
            other_match = DUPLICATE_KEY.match(other_key)
            if other_match and other_match.group("base") == match.group("base"):
                last = other
        last.insert_after(clone)
        by_key[key] = clone
        duplicated.append(key)

    rank = {key: index for index, key in enumerate(keys)}
    groups: dict[int, list[Tag]] = {}
    for section in top_level_sections(soup):
        groups.setdefault(id(section.parent), []).append(section)
    for members in groups.values():
        wanted = sorted(members, key=lambda t: rank.get(str(t["data-lp-section"]), len(rank)))
        if [id(t) for t in wanted] == [id(t) for t in members]:
            continue
        markers = []
        for member in members:
            marker = soup.new_tag("lp-anchor")
            member.insert_before(marker)
            markers.append(marker)
        for member in members:
            member.extract()
        for marker, member in zip(markers, wanted, strict=True):
            marker.replace_with(member)

    after = [str(s["data-lp-section"]) for s in top_level_sections(soup)]
    expected = [key for key in keys if key in after]
    if after != expected:
        warnings.append(
            "Some sections sit in different containers, so they couldn't move across them."
        )
    renumber(soup)
    kept = [key for key in current if key not in removed]
    stats["moved"] = sum(
        1 for a, b in zip(kept, [k for k in after if k in kept], strict=False) if a != b
    )
    stats["removed"] = removed
    stats["duplicated"] = duplicated
    return serialize(soup), stats


def _copy_section(source: Tag, key: str) -> Tag:
    """A copy of a section under a new key (its `id`, if any, gets the key's number)."""
    clone = copy.copy(source)
    clone["data-lp-section"] = key
    if clone.has_attr("id"):
        match = DUPLICATE_KEY.match(key)
        clone["id"] = f"{clone['id']}-{match.group('n') if match else key}"
    for img in clone.select("[data-lp-img]"):
        del img["data-lp-img"]  # image slots are numbered again later
    return clone


def duplicate_section(html: str, key: str, new_key: str) -> str:
    """Copies the top-level section `key` as `new_key`, right after the original
    (BUILD_SPEC §8.3), and renumbers numbered items. Raises KeyError for an unknown key."""
    soup = parse(html)
    source = next((s for s in top_level_sections(soup) if s["data-lp-section"] == key), None)
    if source is None:
        raise KeyError(key)
    source.insert_after(_copy_section(source, new_key))
    renumber(soup)
    return serialize(soup)


def section_order(html: str) -> list[str]:
    """The page's top-level section keys, in document order."""
    return [str(s["data-lp-section"]) for s in top_level_sections(parse(html))]


def renumber(soup: Tag) -> None:
    """Numbered items (`data-lp-number`, e.g. a listicle's "1"…"10", or "01") count up in page
    order, keeping zero-padding; inside a `data-lp-alternate="<class>"` container the numbered
    items take turns having that class (alternating photo sides)."""
    numbered = [s for s in top_level_sections(soup) if s.select_one("[data-lp-number]")]
    for index, section in enumerate(numbered, start=1):
        for number in section.select("[data-lp-number]"):
            old = number.get_text(strip=True)
            width = len(old) if old.isdigit() and old.startswith("0") else 0
            set_text(number, str(index).zfill(width))
    for container in soup.select("[data-lp-alternate]"):
        name = str(container["data-lp-alternate"])
        items = [
            s
            for s in container.find_all(True, recursive=False)
            if s.has_attr("data-lp-section") and s.select_one("[data-lp-number]")
        ]
        for index, item in enumerate(items):
            classes = [c for c in item.get_attribute_list("class") if c and c != name]
            item["class"] = " ".join([*classes, name] if index % 2 else classes)
