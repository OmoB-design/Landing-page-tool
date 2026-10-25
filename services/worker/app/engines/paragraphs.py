"""Paragraphs for the review desk (D84). Pure.

The desk edits a paragraph (or a heading, list item, button…) as one piece of text, even when a
bold word, a link or a price splits it into several fragments. A paragraph is the block element its
fragments share (fragments.BLOCK_KINDS; otherwise the text's own parent), numbered by its first
fragment in page order, and its text is every text node inside it, whitespace collapsed, as a
reader sees it.

`rewrite` writes an edited paragraph back without losing its formatting: the old and new texts are
compared character by character, and each changed stretch goes into the text node it replaces (an
insertion joins the text just before it), so words that stay keep their bold or link, and new words
take the formatting of their neighbours. Text filled from data (a price, the product name) is
locked: an edit that changes it is refused.
"""

import difflib
import re
from dataclasses import dataclass
from typing import Any

from bs4 import BeautifulSoup
from bs4.element import NavigableString, Tag

from app.engines.fragments import BLOCK_KINDS, LETTER, PRICE, _block, _locked, _nodes
from app.engines.html import parse, serialize, text_nodes


class ParagraphDriftError(Exception):
    """The paragraph no longer reads as the desk showed it."""


class ParagraphEditError(Exception):
    """An edit the paragraph doesn't allow; the message is shown to the user."""


@dataclass(frozen=True)
class Paragraph:
    number: int
    kind: str
    section: str | None
    text: str
    # Every fragment in it is filled from data: shown, not editable.
    locked: bool
    # The parts filled from data, which stay as they are when the rest is edited.
    locked_parts: tuple[str, ...]
    fragment_ids: tuple[str, ...]


@dataclass
class _Entry:
    number: int
    element: Tag | None
    fragments: list[tuple[str, NavigableString]]
    nodes: list[NavigableString]


def _collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _index(soup: BeautifulSoup) -> list[_Entry]:
    entries: list[_Entry] = []
    by_key: dict[int, _Entry] = {}
    for index, node in enumerate(_nodes(soup), start=1):
        element = _block(node)
        key = id(element) if element is not None else id(node)
        entry = by_key.get(key)
        if entry is None:
            entry = _Entry(len(entries) + 1, element, [], [node])
            by_key[key] = entry
            entries.append(entry)
        entry.fragments.append((f"f{index:04d}", node))
    for entry in entries:
        if entry.element is not None:
            # Every text node of this block (punctuation and numbers too), not nested blocks'.
            entry.nodes = [n for n in text_nodes(entry.element) if _block(n) is entry.element]
    return entries


def _layout(nodes: list[NavigableString]) -> tuple[str, list[int]]:
    """The text as read (whitespace collapsed) and, per character, the node it comes from."""
    chars: list[str] = []
    owners: list[int] = []
    space = False
    for index, node in enumerate(nodes):
        for char in str(node):
            if char.isspace():
                if chars and not space:
                    chars.append(" ")
                    owners.append(index)
                space = True
            else:
                chars.append(char)
                owners.append(index)
                space = False
    while chars and chars[-1] == " ":
        chars.pop()
        owners.pop()
    return "".join(chars), owners


def _kind(element: Tag | None) -> str:
    if element is None:
        return "Text"
    if element.name == "a":
        return "Button"
    return BLOCK_KINDS.get(element.name, "Text")


def _section(element: Any) -> str | None:
    node = element if isinstance(element, Tag) else getattr(element, "parent", None)
    while isinstance(node, Tag):
        if node.has_attr("data-lp-section"):
            return str(node["data-lp-section"])
        node = node.parent
    return None


def paragraphs(html: str) -> list[Paragraph]:
    """The page's paragraphs in order."""
    out: list[Paragraph] = []
    for entry in _index(parse(html)):
        text, _ = _layout(entry.nodes)
        locked_flags = [_locked(node, ()) for _, node in entry.fragments]
        out.append(
            Paragraph(
                number=entry.number,
                kind=_kind(entry.element),
                section=_section(entry.element or entry.fragments[0][1]),
                text=text,
                locked=all(locked_flags),
                locked_parts=tuple(
                    _collapse(str(node))
                    for (_, node), locked in zip(entry.fragments, locked_flags, strict=True)
                    if locked
                ),
                fragment_ids=tuple(fid for fid, _ in entry.fragments),
            )
        )
    return out


def numbers(html: str) -> dict[str, int]:
    """The paragraph number of each fragment id."""
    return {fid: entry.number for entry in _index(parse(html)) for fid, _ in entry.fragments}


def rewrite(html: str, number: int, original: str, new: str) -> str:
    """The page with paragraph `number` changed from `original` (as the desk showed it) to `new`."""
    soup = parse(html)
    entry = next((e for e in _index(soup) if e.number == number), None)
    if entry is None:
        raise ParagraphDriftError
    shown, owners = _layout(entry.nodes)
    if shown != _collapse(original):
        raise ParagraphDriftError
    text = _collapse(new)
    if not (LETTER.search(text) or PRICE.search(text)):
        raise ParagraphEditError("A line needs words (to remove one, wait for the editor).")
    if text == shown:
        raise ParagraphEditError("Nothing changed.")
    locked = [_locked(node, ()) for node in entry.nodes]

    def refuse(index: int) -> None:
        raise ParagraphEditError(
            f"“{_collapse(str(entry.nodes[index]))}” is filled from the brand or product, so it "
            "stays as it is (change it there)."
        )

    assigned = [""] * len(entry.nodes)
    matcher = difflib.SequenceMatcher(None, shown, text, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(i1, i2):
                assigned[owners[k]] += shown[k]
            continue
        if tag in ("replace", "delete"):
            touched = sorted({owners[k] for k in range(i1, i2)})
            for index in touched:
                if locked[index]:
                    refuse(index)
            assigned[touched[0]] += text[j1:j2]
            continue
        # An insertion joins the text just before it (or after it, at the start or after a lock).
        candidates = ([owners[i1 - 1]] if i1 > 0 else []) + (
            [owners[i1]] if i1 < len(shown) else []
        )
        target = next((c for c in candidates if not locked[c]), None)
        if target is None:
            refuse(candidates[0])
        else:
            assigned[target] += text[j1:j2]

    for index, node in enumerate(entry.nodes):
        before = "".join(shown[k] for k in range(len(shown)) if owners[k] == index)
        if assigned[index] != before:
            node.replace_with(assigned[index])
    return serialize(soup)


def mark_blocks(soup: BeautifulSoup) -> None:
    """Puts each paragraph's number on its element (`data-lp-block`), for the desk's preview."""
    for entry in _index(soup):
        if entry.element is not None:
            entry.element["data-lp-block"] = str(entry.number)
