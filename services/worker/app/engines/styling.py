"""Lander's styling (BUILD_SPEC §11.3, B3.1d, D107). Pure: HTML in, HTML out.

`describe` tells Claude about the element a line sits in and the boxes around it (up to its
section): each by its tag and classes, a little of its text, and the CSS that styles it (the page's
rules that match it, then its own style), so "the Verified frame" can be found as "line 6, up 1".
`apply` sets a safe set of style properties on one of them, as its inline style (so it wins over
the page's rules without touching them); "unset" takes an earlier value off again.

A box can also be reached by what's inside it (owner, 2026-11-05: the Verified pill holds no line):
`describe` lists each box's elements with a path ("2", then "2.1" inside it), and a target's
`child` walks that path from the box, so a badge, an icon or a picture can be styled and looked at.
"""

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

from app.engines import paragraphs
from app.engines.html import parse, serialize

MAX_UP = 4
MAX_VALUE = 80

# What Lander may set: spacing, size, layout of a box's content, type, colour and borders. No
# positioning, transforms, animation or content.
ALLOWED = {
    *(f"padding{s}" for s in ("", "-top", "-right", "-bottom", "-left", "-inline", "-block")),
    *(f"margin{s}" for s in ("", "-top", "-right", "-bottom", "-left", "-inline", "-block")),
    "width", "min-width", "max-width", "height", "min-height", "max-height",
    "display", "flex-direction", "flex-wrap", "align-items", "justify-content", "align-self",
    "justify-self", "gap", "row-gap", "column-gap",
    "text-align", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
    "text-transform", "text-decoration", "white-space",
    "color", "background-color", "background",
    "border", "border-top", "border-right", "border-bottom", "border-left", "border-width",
    "border-style", "border-color", "border-radius", "box-shadow", "opacity",
    "object-fit", "object-position", "aspect-ratio",
}  # fmt: skip
DISPLAY = {"block", "inline-block", "inline", "flex", "inline-flex", "grid", "inline-grid", "none"}
FUNCTIONS = {"var", "calc", "rgb", "rgba", "hsl", "hsla", "min", "max", "clamp"}
_VALUE = re.compile(r"^[#\w\s.,%()\-/+*]+$")
_FORBIDDEN = re.compile(r"url\(|expression|image|@|\\|<|>|;|\{|\}|!", re.I)
_FUNCTION = re.compile(r"([a-zA-Z-]+)\(")
_KEY = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_RULE = re.compile(r"([^{}@]+)\{([^{}]*)\}")


class StyleError(ValueError):
    """The target isn't on the page, or nothing could be set: the message says why."""


@dataclass(frozen=True)
class Target:
    line: int | None = None
    up: int = 0
    section: str | None = None
    # A path to an element inside the box ("2", "2.1"), as `describe` lists them.
    child: str | None = None


MAX_INSIDE = 8
_CHILD = re.compile(r"^[1-9]\d?(\.[1-9]\d?){0,3}$")
_SKIP = {"script", "style", "noscript", "template", "br"}


def _elements(node: Tag) -> list[Tag]:
    return [c for c in node.children if isinstance(c, Tag) and c.name not in _SKIP]


def _box(chain: list[Tag], target: Target) -> Tag:
    return chain[0] if target.section is not None else chain[min(target.up, len(chain) - 1)]


def _node(soup: BeautifulSoup, target: Target) -> Tag:
    """The element a target names: the box (`up` levels above a line, or a section), then the
    element its `child` path leads to inside it."""
    node = _box(_chain(soup, target), target)
    if not target.child:
        return node
    if not _CHILD.match(target.child):
        raise StyleError(f"“{target.child}” isn't a path like 2 or 2.1 from inspect.")
    for step in target.child.split("."):
        inside = _elements(node)
        index = int(step)
        if index > len(inside):
            raise StyleError(f"There's no element {target.child} in that box: inspect it again.")
        node = inside[index - 1]
    return node


def _declarations(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in text.split(";"):
        prop, sep, value = part.partition(":")
        if sep and prop.strip() and value.strip():
            out[prop.strip().lower()] = " ".join(value.split())
    return out


def _rules(soup: BeautifulSoup) -> list[tuple[list[str], dict[str, str]]]:
    css = " ".join(s.get_text() for s in soup.find_all("style") if isinstance(s, Tag))
    return [
        ([p.strip() for p in selector.split(",") if p.strip()], _declarations(body))
        for selector, body in _RULE.findall(css)
    ]


def _chain(soup: BeautifulSoup, target: Target) -> list[Tag]:
    """The target's element and the boxes around it, up to its section (or the body)."""
    if target.section is not None:
        if not _KEY.match(target.section):
            raise StyleError(f"There's no section {target.section}.")
        node = soup.select_one(f'[data-lp-section="{target.section}"]')
        if not isinstance(node, Tag):
            raise StyleError(f"There's no section {target.section}.")
        return [node]
    if target.line is None:
        raise StyleError("Say which line (and how many boxes up) or which section.")
    element = paragraphs.element_of(soup, target.line)
    if not isinstance(element, Tag):
        raise StyleError(f"There's no line {target.line}.")
    chain = [element]
    while len(chain) <= MAX_UP:
        current = chain[-1]
        if current.has_attr("data-lp-section"):
            break
        parent = current.parent
        if not isinstance(parent, Tag) or parent.name in ("body", "html", "[document]"):
            break
        chain.append(parent)
    return chain


def _matching(node: Tag, rules: list[tuple[list[str], dict[str, str]]]) -> dict[str, str]:
    styles: dict[str, str] = {}
    for selectors, declarations in rules:
        matched = False
        for selector in selectors:
            try:
                matched = bool(node.css.match(selector))
            except Exception:  # a selector soupsieve can't read (vendor pseudo-classes)
                matched = False
            if matched:
                break
        if matched:
            styles.update({k: v for k, v in declarations.items() if k in ALLOWED})
    if node.has_attr("style"):
        styles.update({k: v for k, v in _declarations(str(node["style"])).items() if k in ALLOWED})
    return styles


def _name(node: Tag) -> str:
    classes = node.get("class")
    names = "".join(f".{c}" for c in (classes or []) if isinstance(c, str))[:60]
    section = node.get("data-lp-section")
    return f"<{node.name}{names}>" + (f" (section {section})" if section else "")


def _text(node: Tag, limit: int = 70) -> str:
    text = " ".join(node.get_text(" ", strip=True).split())
    if not text and node.name == "img":
        text = f"picture: {node.get('alt') or 'no alt'}"
    return text if len(text) <= limit else text[: limit - 3] + "…"


def _line_numbers(soup: BeautifulSoup) -> dict[int, int]:
    """Each numbered line's element (by identity) and its number."""
    html = serialize(soup)
    return {
        id(element): p.number
        for p in paragraphs.paragraphs(html)
        if isinstance(element := paragraphs.element_of(soup, p.number), Tag)
    }


def _inside(node: Tag, path: str, rules: list[tuple[list[str], dict[str, str]]],
            lines: dict[int, int]) -> list[str]:  # fmt: skip
    """The elements inside a box, each with its path, its first line (if it holds one) and the
    CSS that styles it."""
    rows = []
    for i, child in enumerate(_elements(node)[:MAX_INSIDE], 1):
        number = next(
            (lines[id(d)] for d in [child, *child.find_all(True)] if id(d) in lines), None
        )
        held = f" (line {number})" if number else " (no line)"
        css = "; ".join(f"{k}: {v}" for k, v in _matching(child, rules).items())
        rows.append(
            f"     child {path}{i}: {_name(child)} “{_text(child, 40)}”{held}"
            + (f" · {css}" if css else "")
        )
    more = len(_elements(node)) - MAX_INSIDE
    if more > 0:
        rows.append(f"     … and {more} more")
    return rows


def describe(html: str, target: Target) -> str:
    """The target and the boxes around it, for Claude, each with the CSS that styles it and the
    elements inside it (with the `child` paths that reach them)."""
    soup = parse(html)
    rules = _rules(soup)
    lines = _line_numbers(soup)
    if target.child:
        node = _node(soup, target)
        css = "; ".join(f"{k}: {v}" for k, v in _matching(node, rules).items())
        head = f"child {target.child}: {_name(node)} “{_text(node)}”"
        return "\n".join(
            [f"{head}\n   {css or 'no box or type styles'}",
             *_inside(node, f"{target.child}.", rules, lines)]
        )  # fmt: skip
    rows = []
    for level, node in enumerate(_chain(soup, target)):
        styles = _matching(node, rules)
        css = "; ".join(f"{k}: {v}" for k, v in styles.items()) or "no box or type styles"
        where = f"section {target.section}" if target.section else f"line {target.line}, up {level}"
        rows.append(f"{where}: {_name(node)} “{_text(node)}”\n   {css}")
        if level > 0 or target.section:
            rows.extend(_inside(node, "", rules, lines))
    return "\n".join(rows)


def _check(prop: str, value: str) -> str | None:
    """Why a property or value can't be set, or None when it can."""
    if prop not in ALLOWED:
        return f"{prop} isn't one of the properties Lander can set"
    if value == "unset":
        return None
    if len(value) > MAX_VALUE or _FORBIDDEN.search(value) or not _VALUE.match(value):
        return f"{prop}: “{value}” isn't a plain CSS value"
    if any(f.lower() not in FUNCTIONS for f in _FUNCTION.findall(value)):
        return f"{prop}: only var(), calc(), min(), max(), clamp() and colour functions"
    if prop == "display" and value not in DISPLAY:
        return f"display: {value} isn't allowed"
    return None


def apply(
    html: str, target: Target, styles: dict[str, str]
) -> tuple[str, dict[str, str], list[str]]:
    """Sets `styles` on the target as its inline style. Returns the page, what was set, and what
    was refused (with why). Raises StyleError when the target isn't there or nothing was set."""
    soup = parse(html)
    node = _node(soup, target)
    applied: dict[str, str] = {}
    refused: list[str] = []
    for raw_prop, raw_value in styles.items():
        prop, value = raw_prop.strip().lower(), " ".join(str(raw_value).split())
        why = _check(prop, value)
        if why:
            refused.append(why)
        else:
            applied[prop] = value
    if not applied:
        raise StyleError("Nothing set: " + "; ".join(refused))
    current = _declarations(str(node.get("style") or ""))
    for prop, value in applied.items():
        if value == "unset":
            current.pop(prop, None)
        else:
            current[prop] = value
    if current:
        node["style"] = "; ".join(f"{k}: {v}" for k, v in current.items())
    elif node.has_attr("style"):
        del node["style"]
    return serialize(soup), applied, refused


def selector_for(html: str, target: Target) -> tuple[str, str]:
    """The page with a marker on what to picture, and the marker's selector: for a line, the box
    `up` levels above it (the same box style_element would set); for a section, the section."""
    soup = parse(html)
    node = _node(soup, target)
    node["data-lp-look"] = ""
    return serialize(soup), "[data-lp-look]"
