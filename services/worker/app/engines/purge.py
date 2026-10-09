"""Forbidden terms (BUILD_SPEC §8.5, §10.2 `purge_terms`). Pure.

After the copy pass, a term that survives removes the innermost block still containing it; a
lone label (an inline element holding only that text) loses only itself. Capitalised terms
match case-sensitively, lowercase terms case-insensitively. Section roots are never removed:
inside one, only the text goes.
"""

import re

from bs4.element import NavigableString, Tag

from app.engines.html import BLOCK_TAGS, parse, serialize, text_nodes

INLINE_LABELS = {"span", "small", "em", "strong", "b", "i", "label", "a", "mark", "sup"}


def _pattern(term: str) -> re.Pattern[str]:
    flags = 0 if any(c.isupper() for c in term) else re.IGNORECASE
    return re.compile(re.escape(term), flags)


def _target(node: NavigableString) -> Tag | NavigableString:
    parent = node.parent
    if (
        isinstance(parent, Tag)
        and parent.name in INLINE_LABELS
        and parent.get_text(strip=True) == node.strip()
        and not parent.has_attr("data-lp-section")
    ):
        return parent
    for ancestor in node.parents:
        if not isinstance(ancestor, Tag):
            continue
        if ancestor.has_attr("data-lp-section") or ancestor.name in ("body", "html", "main"):
            return node
        if ancestor.name in BLOCK_TAGS:
            return ancestor
    return node


def purge_terms(html: str, terms: list[str]) -> tuple[str, dict[str, object]]:
    patterns = [(term, _pattern(term)) for term in terms if term.strip()]
    if not patterns:
        return html, {"purged_terms": []}
    soup = parse(html)
    purged: list[dict[str, str]] = []
    for node in list(text_nodes(soup)):
        if node.parent is None:  # removed with an earlier block
            continue
        hit = next((term for term, pattern in patterns if pattern.search(str(node))), None)
        if hit is None:
            continue
        target = _target(node)
        removed = target.name if isinstance(target, Tag) else "text"
        purged.append({"term": hit, "removed": removed, "text": str(node).strip()[:120]})
        target.extract()
    return serialize(soup), {"purged_terms": purged}
