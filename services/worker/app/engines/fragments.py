"""Text fragments (BUILD_SPEC §10.3). Pure.

A fragment is a visible text node that contains letters or is a price. Fragments are numbered
by position (f0001, f0002 …) each time the page is read; ids are never stored in a template.
Text with no letters ("4.8", "12,000+", countdown digits) is never a fragment, so neither the
copy pass nor the editor can change it.

Reinjection checks that each node still holds its original text before replacing it, so a
page that changed in between is never corrupted (a drift warning is recorded instead).
"""

import re
from dataclasses import dataclass

from bs4.element import NavigableString, Tag

from app.engines.html import parse, serialize, text_nodes

LETTER = re.compile(r"[^\W\d_]")
PRICE = re.compile(r"[$€£¥₹]\s?\d|\d[\d.,]*\s?(?:USD|EUR|GBP|CAD|AUD)\b")
# Slots the pipeline fills from brand and product data later (finalize), and fixed text.
LOCKED_ATTRS = (
    "data-lp-lock", "data-lp-brand", "data-lp-product-name", "data-lp-price",
    "data-lp-sale-price", "data-lp-compare-price", "data-lp-sale-percent",
    "data-lp-variant-name", "data-lp-variant-price",
)  # fmt: skip


@dataclass(frozen=True)
class Fragment:
    id: str
    text: str  # the node's text without surrounding whitespace
    context: str  # "tag.class1.class2@role", for length caps and the model
    locked: bool  # filled by the pipeline or marked data-lp-lock: never rewritten
    section: str | None

    @property
    def chars(self) -> int:
        return len(self.text)

    @property
    def words(self) -> int:
        return len(self.text.split())


def _eligible(node: NavigableString) -> bool:
    text = str(node).strip()
    return bool(text) and (bool(LETTER.search(text)) or bool(PRICE.search(text)))


def _nodes(root: Tag) -> list[NavigableString]:
    return [node for node in text_nodes(root) if _eligible(node)]


def _context(node: NavigableString) -> tuple[str, str | None]:
    parent = node.parent if isinstance(node.parent, Tag) else None
    if parent is None:
        return "text", None
    classes = [str(c) for c in parent.get_attribute_list("class") if c][:2]
    context = ".".join([parent.name, *classes])
    section = (
        parent
        if parent.has_attr("data-lp-section")
        else parent.find_parent(attrs={"data-lp-section": True})
    )
    if isinstance(section, Tag):
        role = section.get("data-lp-role")
        if role:
            context += f"@{role}"
        return context, str(section["data-lp-section"])
    return context, None


def _locked(node: NavigableString, extra: tuple[str, ...]) -> bool:
    attrs = LOCKED_ATTRS + extra
    for ancestor in node.parents:
        if isinstance(ancestor, Tag) and any(ancestor.has_attr(a) for a in attrs):
            return True
    return False


def dump(html: str, *, extra_locked: tuple[str, ...] = ()) -> list[Fragment]:
    """The page's fragments in document order. `extra_locked` adds attributes whose text the
    pipeline will fill (e.g. `data-lp-usp-text` when the product has selling points)."""
    soup = parse(html)
    fragments: list[Fragment] = []
    for index, node in enumerate(_nodes(soup), start=1):
        context, section = _context(node)
        fragments.append(
            Fragment(
                id=f"f{index:04d}",
                text=str(node).strip(),
                context=context,
                locked=_locked(node, extra_locked),
                section=section,
            )
        )
    return fragments


def reinject(
    html: str, replacements: dict[str, str], originals: dict[str, str], *, allow_empty: bool
) -> tuple[str, dict[str, object]]:
    """Writes each replacement into the fragment at its position, keeping the node's surrounding
    whitespace. A node whose text no longer matches its original is skipped (drift). An empty
    replacement removes the text only when `allow_empty` (clones: navigation and UI text);
    otherwise the original stays."""
    soup = parse(html)
    nodes = _nodes(soup)
    applied = 0
    drift: list[str] = []
    for index, node in enumerate(nodes, start=1):
        fragment_id = f"f{index:04d}"
        if fragment_id not in replacements:
            continue
        original = str(node)
        if original.strip() != originals.get(fragment_id):
            drift.append(fragment_id)
            continue
        new = replacements[fragment_id].strip()
        if not new and not allow_empty:
            continue
        lead = original[: len(original) - len(original.lstrip())]
        trail = original[len(original.rstrip()) :]
        node.replace_with(f"{lead}{new}{trail}" if new else "")
        applied += 1
    return serialize(soup), {"applied": applied, "drift": drift}
