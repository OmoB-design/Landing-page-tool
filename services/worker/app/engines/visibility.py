"""Hiding and showing parts of a page (B4.4, D123: Shopify's eye). Pure.

A hidden section, line or picture stays in the page, marked `data-lp-hidden`, with
`display:none !important` added to its own inline style, so it's left out wherever the page goes
(the editor, the preview, an export, Vercel, Shopify) without any of them knowing about hiding;
showing it takes both off again and leaves the element's own style as it was.
"""

import re

from bs4.element import Tag

from app.engines.html import parse, serialize
from app.engines.paragraphs import _index
from app.engines.sections import top_level_sections

HIDDEN = "data-lp-hidden"
_NONE = "display:none !important"
_TRAILING_NONE = re.compile(r";?\s*display\s*:\s*none\s*!important\s*;?\s*$", re.I)


class NotOnPageError(Exception):
    """The section, line or picture to hide or show isn't on the page."""


def is_hidden(tag: Tag) -> bool:
    return tag.has_attr(HIDDEN)


def set_hidden(tag: Tag, hidden: bool) -> bool:
    """Hides or shows one element; False when it already was."""
    style = str(tag.get("style") or "").strip()
    if hidden:
        if tag.has_attr(HIDDEN):
            return False
        tag[HIDDEN] = ""
        tag["style"] = (style.rstrip(";") + ";" if style else "") + _NONE
        return True
    if not tag.has_attr(HIDDEN):
        return False
    del tag[HIDDEN]
    rest = _TRAILING_NONE.sub("", style).strip()
    if rest:
        tag["style"] = rest
    elif tag.has_attr("style"):
        del tag["style"]
    return True


def toggle(
    html: str,
    *,
    hidden: bool,
    key: str | None = None,
    block: int | None = None,
    image: int | None = None,
) -> tuple[str, str | None, bool]:
    """The page with a section (`key`), a line (`block`, the editor's numbering) or a picture
    (`image`, its `data-lp-img`) hidden or shown, the key of the section it's in, and whether
    anything changed. Raises NotOnPageError."""
    soup = parse(html)
    sections = top_level_sections(soup)
    target: Tag | None = None
    if key is not None:
        target = next((s for s in sections if s.get("data-lp-section") == key), None)
    elif block is not None:
        target = next(
            (e.element for e in _index(soup) if e.number == block and e.element is not None),
            None,
        )
    elif image is not None:
        found = soup.select_one(f'img[data-lp-img="{int(image)}"]')
        target = found if isinstance(found, Tag) else None
    if target is None:
        raise NotOnPageError
    owner = next((s for s in sections if s is target or any(p is s for p in target.parents)), None)
    changed = set_hidden(target, hidden)
    return serialize(soup), str(owner["data-lp-section"]) if owner else None, changed
