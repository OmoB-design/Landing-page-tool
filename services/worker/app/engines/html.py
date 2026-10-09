"""Parsing and serialising pages for the engines. Pure.

BeautifulSoup with lxml is fast, but HTML parsers lowercase every name, and SVG is
case-sensitive (`viewBox`, `linearGradient`): `serialize` puts the camelCase names back inside
inline SVG so icons and logos keep rendering.
"""

import re
from collections.abc import Iterator

from bs4 import BeautifulSoup
from bs4.element import Comment, NavigableString, Tag

# SVG is case-sensitive, but HTML parsers lowercase names; these are the camelCase ones pages use.
SVG_CAMEL_CASE = [
    "viewBox", "preserveAspectRatio", "gradientUnits", "gradientTransform", "patternUnits",
    "patternContentUnits", "patternTransform", "clipPathUnits", "maskUnits", "maskContentUnits",
    "stdDeviation", "spreadMethod", "textLength", "lengthAdjust", "startOffset", "baseFrequency",
    "numOctaves", "pathLength", "markerWidth", "markerHeight", "refX", "refY",
    "linearGradient", "radialGradient", "clipPath", "textPath", "foreignObject",
    "feGaussianBlur", "feOffset", "feBlend", "feColorMatrix", "feFlood", "feComposite",
    "feMerge", "feMergeNode",
]  # fmt: skip
_SVG_NAME = re.compile(
    r"(?<=[\s<])(/?)(" + "|".join(name.lower() for name in SVG_CAMEL_CASE) + r")(?=[\s=>/])"
)
_SVG_CASE = {name.lower(): name for name in SVG_CAMEL_CASE}
_SVG_BLOCK = re.compile(r"<svg\b.*?</svg>", re.DOTALL | re.IGNORECASE)

# Text inside these is never page copy.
NON_TEXT = {"script", "style", "noscript", "template", "head", "title", "svg"}
BLOCK_TAGS = {
    "address", "article", "aside", "blockquote", "dd", "details", "div", "dl", "dt",
    "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
    "header", "li", "main", "nav", "ol", "p", "section", "summary", "table", "td", "th", "tr",
    "ul",
}  # fmt: skip


def restore_svg_case(markup: str) -> str:
    """viewbox → viewBox inside one piece of SVG markup."""
    return _SVG_NAME.sub(lambda m: m.group(1) + _SVG_CASE[m.group(2)], markup)


def parse(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def serialize(soup: BeautifulSoup | Tag) -> str:
    return _SVG_BLOCK.sub(lambda m: restore_svg_case(m.group(0)), str(soup))


def text_nodes(root: BeautifulSoup | Tag) -> Iterator[NavigableString]:
    """Visible text nodes in document order (not comments, scripts, styles or SVG)."""
    for node in root.descendants:
        if not isinstance(node, NavigableString) or isinstance(node, Comment):
            continue
        if type(node) is not NavigableString:  # doctype, CDATA, processing instructions
            continue
        if any(isinstance(p, Tag) and p.name in NON_TEXT for p in node.parents):
            continue
        yield node


def set_text(tag: Tag, text: str) -> None:
    """Replaces an element's text, keeping it a single text node."""
    tag.clear()
    tag.append(text)


def ensure_head(soup: BeautifulSoup) -> Tag:
    head = soup.find("head")
    if isinstance(head, Tag):
        return head
    head = soup.new_tag("head")
    html = soup.find("html")
    if isinstance(html, Tag):
        html.insert(0, head)
    else:
        soup.insert(0, head)
    return head


def element_path(tag: Tag) -> str:
    """A short, readable location for a report: the section key and the element, e.g.
    `hero > p:nth-of-type(2)`."""
    section = (
        tag if tag.has_attr("data-lp-section") else tag.find_parent(attrs={"data-lp-section": True})
    )
    parts: list[str] = []
    node: Tag | None = tag
    while (
        node is not None and node is not section and node.name not in ("body", "html", "[document]")
    ):
        parent = node.parent if isinstance(node.parent, Tag) else None
        if parent is not None:
            same = [c for c in parent.find_all(node.name, recursive=False)]
            index = same.index(node) + 1 if node in same else 1
            parts.append(f"{node.name}:nth-of-type({index})" if len(same) > 1 else node.name)
        else:
            parts.append(node.name)
        node = parent
    prefix = str(section["data-lp-section"]) if isinstance(section, Tag) else "page"
    return " > ".join([prefix, *reversed(parts)]) if parts else prefix
