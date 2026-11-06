"""Text formatting on the page (B3.1g, D118): bold, italic, underline, strikethrough, a link, text
colour, highlight, text size, or clearing them, on exactly the characters selected, in one line or
across several, as an editor's toolbar does. Pure: HTML in, HTML out.

A selection is a list of ranges, one per line it touches: the line's number (as the desk numbers
paragraphs) and the start and end in the line's text as a reader sees it (whitespace collapsed,
as `paragraphs` does). The text pieces inside a range are cut out of their text nodes and wrapped,
or freed from the formatting around them by splitting it, so the words outside the selection keep
theirs. Only safe markup is written: <strong>, <em>, <u>, <s>, <a href>, and <span data-lp-fmt> with
one of `color`, `background-color`, `font-size`, `font-weight` or `font-style`.
"""

import re
from collections.abc import Iterator
from dataclasses import dataclass

from bs4 import BeautifulSoup
from bs4.element import NavigableString, Tag

from app.engines import paragraphs
from app.engines.html import parse, serialize

FMT = "data-lp-fmt"
# Word's font sizes (its size box, and the steps Grow Font and Shrink Font take), in px here.
WORD_SIZES = (8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72)
MIN_SIZE, MAX_SIZE = 6, 200

BOLD_TAGS = ("strong", "b")
ITALIC_TAGS = ("em", "i")
UNDERLINE_TAGS = ("u",)
STRIKE_TAGS = ("s", "strike", "del")
CLEARED_TAGS = (*BOLD_TAGS, *ITALIC_TAGS, *UNDERLINE_TAGS, *STRIKE_TAGS, "mark")

_COLOUR = re.compile(r"^(#[0-9a-fA-F]{3,8}|var\(--lp-[a-z0-9-]+\)|rgba?\([\d\s.,%]+\))$")
_LINK = re.compile(r"^(https?://|mailto:|tel:|#|/)[^\s\"'<>]*$", re.I)


class FormatError(ValueError):
    """The selection or the formatting can't be applied: the message says why."""


@dataclass(frozen=True)
class Range:
    block: int
    start: int
    end: int


@dataclass(frozen=True)
class Format:
    """One change. A property left None isn't touched; `link`, `color` and `highlight` set to ""
    and `size` set to 0 take that formatting off."""

    bold: bool | None = None
    italic: bool | None = None
    underline: bool | None = None
    strike: bool | None = None
    link: str | None = None
    color: str | None = None
    highlight: str | None = None
    size: int | None = None
    clear: bool = False

    def check(self) -> None:
        if self.link and not _LINK.match(self.link.strip()):
            raise FormatError("A link needs a web address, like https://example.com.")
        for name, value in (("colour", self.color), ("highlight", self.highlight)):
            if value and not _COLOUR.match(value.strip()):
                raise FormatError(f"“{value}” isn't a {name} the page can use.")
        if self.size and not MIN_SIZE <= self.size <= MAX_SIZE:
            raise FormatError(f"Text size goes from {MIN_SIZE} to {MAX_SIZE} px.")
        if not self.clear and all(
            v is None
            for v in (self.bold, self.italic, self.underline, self.strike, self.link,
                      self.color, self.highlight, self.size)
        ):  # fmt: skip
            raise FormatError("Nothing to change.")


def grow(size: float) -> int:
    """Word's Grow Font: the next size in its list (past 72, the next ten)."""
    for step in WORD_SIZES:
        if step > size + 0.01:
            return step
    return min(MAX_SIZE, (int(size) // 10 + 1) * 10)


def shrink(size: float) -> int:
    """Word's Shrink Font: the size before in its list (under 8, one smaller)."""
    for step in reversed(WORD_SIZES):
        if step < size - 0.01:
            return step
    return max(MIN_SIZE, int(size) - 1)


def _positions(nodes: list[NavigableString]) -> tuple[str, list[tuple[int, int]]]:
    """The line's text as read and, per character, its node and offset in that node (the same
    collapsing as `paragraphs._layout`)."""
    chars: list[str] = []
    where: list[tuple[int, int]] = []
    space = False
    for index, node in enumerate(nodes):
        for offset, char in enumerate(str(node)):
            if char.isspace():
                if chars and not space:
                    chars.append(" ")
                    where.append((index, offset))
                space = True
            else:
                chars.append(char)
                where.append((index, offset))
                space = False
    while chars and chars[-1] == " ":
        chars.pop()
        where.pop()
    return "".join(chars), where


def _cut(node: NavigableString, start: int, end: int) -> NavigableString:
    """The node's text from `start` to `end` as a text node of its own, in its place."""
    text = str(node)
    if start <= 0 and end >= len(text):
        return node
    middle = NavigableString(text[start:end])
    parts = [p for p in (NavigableString(text[:start]), middle, NavigableString(text[end:])) if p]
    node.replace_with(*parts)
    return middle


def _shell(soup: BeautifulSoup, element: Tag) -> Tag:
    attrs = {
        k: " ".join(v) if isinstance(v, list) else str(v)
        for k, v in element.attrs.items()
        if k != "id"
    }
    return soup.new_tag(element.name, attrs=attrs)


def _split_around(soup: BeautifulSoup, parent: Tag, child: Tag | NavigableString) -> None:
    """Moves what comes before and after `child` in `parent` into copies of `parent` beside it."""
    contents = list(parent.contents)
    index = next(i for i, c in enumerate(contents) if c is child)
    before, after = contents[:index], contents[index + 1 :]
    if before:
        left = _shell(soup, parent)
        for node in before:
            left.append(node.extract())
        parent.insert_before(left)
    if after:
        right = _shell(soup, parent)
        for node in after:
            right.append(node.extract())
        parent.insert_after(right)


def _isolate(soup: BeautifulSoup, piece: NavigableString, ancestor: Tag) -> None:
    """Takes `ancestor`'s formatting off `piece` only: everything between them is split around the
    piece, then the copy of `ancestor` that holds just the piece is unwrapped."""
    node: Tag | NavigableString = piece
    while True:
        parent = node.parent
        if parent is None:
            return
        _split_around(soup, parent, node)
        if parent is ancestor:
            break
        node = parent
    ancestor.unwrap()


def _ancestors(piece: NavigableString, block: Tag | None) -> Iterator[Tag]:
    for parent in piece.parents:
        if parent is block or parent.name in ("body", "html", "[document]"):
            return
        yield parent


def _style(tag: Tag) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in str(tag.get("style") or "").split(";"):
        prop, sep, value = part.partition(":")
        if sep and prop.strip():
            out[prop.strip().lower()] = value.strip()
    return out


def _ours(tag: Tag, prop: str) -> bool:
    return tag.name == "span" and tag.has_attr(FMT) and prop in _style(tag)


def _take_off(soup: BeautifulSoup, piece: NavigableString, block: Tag | None, test: object) -> bool:
    """Frees the piece from every formatting ancestor `test` matches; whether there was one."""
    found = False
    while True:
        match = next((a for a in _ancestors(piece, block) if test(a)), None)  # type: ignore[operator]
        if match is None:
            return found
        _isolate(soup, piece, match)
        found = True


def _wrap(soup: BeautifulSoup, piece: NavigableString, name: str, **attrs: str) -> None:
    tag = soup.new_tag(name, attrs=attrs)
    piece.wrap(tag)


def _span(soup: BeautifulSoup, piece: NavigableString, prop: str, value: str) -> None:
    _wrap(soup, piece, "span", **{FMT: "", "style": f"{prop}: {value}"})


def _apply_one(soup: BeautifulSoup, piece: NavigableString, block: Tag | None, fmt: Format) -> None:
    if not str(piece).strip():
        return
    if fmt.clear:
        _take_off(soup, piece, block, lambda a: a.name in CLEARED_TAGS or a.has_attr(FMT))
        return
    weights: tuple[tuple[bool | None, tuple[str, ...], str, str], ...] = (
        (fmt.bold, BOLD_TAGS, "font-weight", "normal"),
        (fmt.italic, ITALIC_TAGS, "font-style", "normal"),
    )
    for on, tags, prop, normal in weights:
        if on is None:
            continue
        _take_off(soup, piece, block, lambda a, p=prop: _ours(a, p))
        if on:
            if not any(a.name in tags for a in _ancestors(piece, block)):
                _wrap(soup, piece, tags[0])
        elif not _take_off(soup, piece, block, lambda a, t=tags: a.name in t):
            # Bold or italic from the page's own styles (a heading): undone where it's selected.
            _span(soup, piece, prop, normal)
    lines: tuple[tuple[bool | None, tuple[str, ...]], ...] = (
        (fmt.underline, UNDERLINE_TAGS),
        (fmt.strike, STRIKE_TAGS),
    )
    for on, tags in lines:
        if on is None:
            continue
        if on:
            if not any(a.name in tags for a in _ancestors(piece, block)):
                _wrap(soup, piece, tags[0])
        else:
            _take_off(soup, piece, block, lambda a, t=tags: a.name in t)
    if fmt.link is not None:
        if block is not None and block.name == "a":
            raise FormatError("That's a button: it already goes somewhere.")
        _take_off(soup, piece, block, lambda a: a.name == "a")
        if fmt.link.strip():
            _wrap(soup, piece, "a", href=fmt.link.strip())
    for value, prop in ((fmt.color, "color"), (fmt.highlight, "background-color")):
        if value is None:
            continue
        _take_off(soup, piece, block, lambda a, p=prop: _ours(a, p))
        if value.strip():
            _span(soup, piece, prop, value.strip())
    if fmt.size is not None:
        _take_off(soup, piece, block, lambda a: _ours(a, "font-size"))
        if fmt.size:
            _span(soup, piece, "font-size", f"{fmt.size}px")


@dataclass(frozen=True)
class Result:
    html: str
    words: int
    lines: int
    sections: list[str | None]


def apply(html: str, ranges: list[Range], fmt: Format) -> Result:
    """The page with `fmt` applied to exactly the characters in `ranges`."""
    fmt.check()
    soup = parse(html)
    entries = {e.number: e for e in paragraphs._index(soup)}
    by_block: dict[int, list[Range]] = {}
    for r in ranges:
        if r.block not in entries:
            raise FormatError("That text isn't on the page any more. Select it again.")
        by_block.setdefault(r.block, []).append(r)
    words = 0
    sections: list[str | None] = []
    lines = 0
    for number, block_ranges in by_block.items():
        entry = entries[number]
        shown, where = _positions(entry.nodes)
        spans: dict[int, list[int]] = {}
        for r in block_ranges:
            start, end = max(0, r.start), min(len(shown), r.end)
            if end <= start:
                continue
            words += len(shown[start:end].split())
            for k in range(start, end):
                node, offset = where[k]
                span = spans.setdefault(node, [offset, offset + 1])
                span[0], span[1] = min(span[0], offset), max(span[1], offset + 1)
        if not spans:
            continue
        lines += 1
        pieces = [_cut(entry.nodes[n], a, b) for n, (a, b) in sorted(spans.items())]
        for piece in pieces:
            _apply_one(soup, piece, entry.element, fmt)
        section = (
            entry.element.find_parent(attrs={"data-lp-section": True}) if entry.element else None
        )
        sections.append(str(section["data-lp-section"]) if isinstance(section, Tag) else None)
    if not lines:
        raise FormatError("Select some words first.")
    return Result(serialize(soup), words, lines, sections)


def describe(fmt: Format) -> str:
    """The change in words, with {} where what was changed goes: "Made {} bold"."""
    if fmt.clear:
        return "Cleared the formatting of {}"
    if fmt.bold is not None:
        return "Made {} bold" if fmt.bold else "Took bold off {}"
    if fmt.italic is not None:
        return "Made {} italic" if fmt.italic else "Took italic off {}"
    if fmt.underline is not None:
        return "Underlined {}" if fmt.underline else "Took the underline off {}"
    if fmt.strike is not None:
        return "Struck through {}" if fmt.strike else "Took the strikethrough off {}"
    if fmt.link is not None:
        return "Linked {}" if fmt.link else "Took the link off {}"
    if fmt.color is not None:
        return "Coloured {}" if fmt.color else "Took the colour off {}"
    if fmt.highlight is not None:
        return "Highlighted {}" if fmt.highlight else "Took the highlight off {}"
    if fmt.size is not None:
        return f"Set {{}} to {fmt.size} px" if fmt.size else "Took the size off {}"
    return "Formatted {}"


def reason(fmt: Format, result: Result) -> str:
    """The undo step's name: "Made 6 words bold in hero", "Highlighted text in 3 lines"."""
    what = (
        f"{result.words} word{'' if result.words == 1 else 's'}"
        if result.lines == 1
        else f"text in {result.lines} lines"
    )
    named = sorted({s.replace("-", " ") for s in result.sections if s})
    where = f" in {named[0]}" if len(named) == 1 else ""
    return describe(fmt).format(what) + where
