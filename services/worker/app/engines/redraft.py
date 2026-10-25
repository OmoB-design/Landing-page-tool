"""Which lines a review-desk redraft rewrites, and how long each may be (D86). Pure.

Scopes: the whole page, one section, one paragraph, or the lines still in the template's words
(the build's copy pass couldn't write them). Locked and structural lines are never rewritten
(copy_rules.rewritable), and neither are paragraphs edited by hand on the desk, unless that very
paragraph is the one asked for.

Length limits come from the template's own lines where a section still has the template's number
of lines (line n of the section is the template's line n), so redrafting again and again can't
keep lengthening the page; otherwise from the current line.
"""

from collections import defaultdict
from typing import Literal

from app.engines import copy_rules as rules
from app.engines import paragraphs as paragraph_engine
from app.engines.fragments import Fragment
from app.models.template import LengthCap

Scope = Literal["page", "section", "paragraph", "unwritten"]


def targets(
    html: str,
    fragments: list[Fragment],
    *,
    scope: Scope,
    section: str | None = None,
    block: int | None = None,
    edited: set[str] | frozenset[str] = frozenset(),
    template_texts: set[str] | frozenset[str] = frozenset(),
) -> tuple[list[Fragment], int]:
    """The fragments to rewrite, and how many hand-edited paragraphs in scope were kept."""
    paras = paragraph_engine.paragraphs(html)
    if scope == "paragraph":
        chosen = [p for p in paras if p.number == block]
    elif scope == "section":
        chosen = [p for p in paras if p.section == section]
    else:
        chosen = paras
    kept = 0
    ids: set[str] = set()
    for paragraph in chosen:
        if scope != "paragraph" and paragraph.text in edited:
            kept += 1
            continue
        ids.update(paragraph.fragment_ids)
    rewritable = [f for f in rules.rewritable(fragments) if f.id in ids]
    if scope == "unwritten":
        rewritable = [f for f in rewritable if f.text in template_texts]
    return rewritable, kept


def budgets(
    page: list[Fragment],
    template: list[Fragment],
    chosen: list[Fragment],
    caps: list[LengthCap],
) -> dict[str, int]:
    """Each chosen fragment's character budget (copy_rules.length_budget)."""

    def by_section(items: list[Fragment]) -> dict[str | None, list[Fragment]]:
        grouped: dict[str | None, list[Fragment]] = defaultdict(list)
        for item in items:
            grouped[item.section].append(item)
        return grouped

    page_sections, template_sections = by_section(page), by_section(template)
    original: dict[str, Fragment] = {}
    for key, lines in page_sections.items():
        source = template_sections.get(key, [])
        if len(source) == len(lines):
            original.update({line.id: match for line, match in zip(lines, source, strict=True)})
    return {f.id: rules.length_budget(original.get(f.id, f), caps) for f in chosen}
