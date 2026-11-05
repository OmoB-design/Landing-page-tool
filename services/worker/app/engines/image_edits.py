"""The image studio's changes to a page (BUILD_SPEC §11.2, B3.2a, D109). Pure: HTML in, HTML out.

Every image a build placed has a stable number (`data-lp-img`, §10.4). These functions read the
page's images, swap one's picture (dropping a `srcset` or `<picture>` source that would win over
it), set its shape, fit and focus as its inline style, and set its alt text. Logos come from the
brand and aren't changed here.
"""

import re
from dataclasses import dataclass
from typing import Literal

from bs4 import Tag

from app.engines.html import parse, serialize

Ratio = Literal["original", "1:1", "4:3", "3:4", "16:9"]
Fit = Literal["cover", "contain"]
Focus = Literal["center", "top", "bottom"]
RATIOS = {"1:1": "1 / 1", "4:3": "4 / 3", "3:4": "3 / 4", "16:9": "16 / 9"}
KINDS = (
    ("data-lp-logo", "logo"),
    ("data-lp-product", "product"),
    ("data-lp-person", "person"),
    ("data-lp-scene", "scene"),
    ("data-lp-keep", "kept"),
)
_STYLE = re.compile(r"\s*([a-z-]+)\s*:\s*([^;]+)")
# The image's own style before the studio first changed it, so "Original" can put it back exactly
# (exports strip `data-lp-*`).
OWN_STYLE = "data-lp-style0"


class ImageEditError(ValueError):
    """The image isn't on the page, or can't be changed here: the message says why."""


@dataclass(frozen=True)
class PageImage:
    number: int
    src: str
    alt: str
    kind: str  # logo, product, person, scene, kept or image
    section: str | None
    ratio: str
    fit: str
    focus: str
    # Its inline style as it is now, and its own style from before the studio changed it (None when
    # the studio hasn't kept one).
    style: str = ""
    own_style: str | None = None


def _style(tag: Tag) -> dict[str, str]:
    return {k.lower(): " ".join(v.split()) for k, v in _STYLE.findall(str(tag.get("style") or ""))}


def _write_style(tag: Tag, style: dict[str, str]) -> None:
    if style:
        tag["style"] = "; ".join(f"{k}: {v}" for k, v in style.items())
    elif tag.has_attr("style"):
        del tag["style"]


def _kind(tag: Tag) -> str:
    return next((name for attr, name in KINDS if tag.has_attr(attr)), "image")


def _describe(tag: Tag) -> PageImage:
    style = _style(tag)
    ratio = next(
        (name for name, css in RATIOS.items() if style.get("aspect-ratio") == css), "original"
    )
    position = style.get("object-position", "")
    focus = (
        "top"
        if position.startswith("50% 0") or "top" in position
        else ("bottom" if "bottom" in position or position.startswith("50% 100") else "center")
    )
    section = tag.find_parent(attrs={"data-lp-section": True})
    return PageImage(
        number=int(str(tag["data-lp-img"])),
        src=str(tag.get("src") or ""),
        alt=str(tag.get("alt") or ""),
        kind=_kind(tag),
        section=str(section["data-lp-section"]) if isinstance(section, Tag) else None,
        ratio=ratio,
        fit=style.get("object-fit", "cover")
        if style.get("object-fit") in ("cover", "contain")
        else "cover",
        focus=focus,
        style=str(tag.get("style") or ""),
        own_style=str(tag[OWN_STYLE]) if tag.has_attr(OWN_STYLE) else None,
    )


def page_images(html: str) -> list[PageImage]:
    """The page's numbered images, in page order."""
    soup = parse(html)
    return [
        _describe(tag)
        for tag in soup.select("img[data-lp-img]")
        if isinstance(tag, Tag) and str(tag.get("data-lp-img", "")).isdigit()
    ]


def _find(soup: Tag, number: int) -> Tag:
    tag = soup.select_one(f'img[data-lp-img="{int(number)}"]')
    if not isinstance(tag, Tag):
        raise ImageEditError(f"There's no image {number} on this page.")
    if tag.has_attr("data-lp-logo"):
        raise ImageEditError("That's the brand's logo: change it on the brand.")
    return tag


def set_src(html: str, number: int, src: str) -> tuple[str, str]:
    """The page with image `number` showing `src`, and the address it showed before. A `srcset`
    or a `<picture>`'s sources would win over `src`, so they go."""
    if not src.startswith(("https://", "data:image/")):
        raise ImageEditError("An image needs a web address or a picture.")
    soup = parse(html)
    tag = _find(soup, number)
    before = str(tag.get("src") or "")
    if before == src:
        raise ImageEditError("That image is already there.")
    tag["src"] = src
    for attr in ("srcset", "sizes", "data-src", "data-srcset"):
        if tag.has_attr(attr):
            del tag[attr]
    picture = tag.find_parent("picture")
    if isinstance(picture, Tag):
        for source in picture.find_all("source"):
            source.decompose()
    return serialize(soup), before


def set_shape(
    html: str, number: int, *, ratio: Ratio | None = None, fit: Fit | None = None,
    focus: Focus | None = None, own_style: str | None = None,
) -> str:  # fmt: skip
    """The page with image `number`'s shape (aspect ratio), fit (fill or fit the shape) and focus
    (which part stays in view when it's filled) set as its inline style. "original" puts back the
    image as the build made it: its own style from before the studio first changed it (kept on
    the image, or `own_style` for an image changed before that was kept), so the crop's width,
    height, fit and focus go too (owner, 2026-11-05: a restored profile photo stayed stretched)."""
    soup = parse(html)
    tag = _find(soup, number)
    if ratio == "original":
        kept = tag.get(OWN_STYLE)
        own = str(kept) if kept is not None else own_style
        if own is None:  # nothing to go back to: take off the crop itself
            style = _style(tag)
            style.pop("aspect-ratio", None)
        else:
            style = {k.lower(): " ".join(v.split()) for k, v in _STYLE.findall(own)}
        if tag.has_attr(OWN_STYLE):
            del tag[OWN_STYLE]
        if fit is None and focus is None:
            if own is not None and own.strip():
                tag["style"] = own  # exactly as it was
            else:
                _write_style(tag, style)
            return serialize(soup)
        tag[OWN_STYLE] = own if own is not None else str(tag.get("style") or "")
    else:
        if not tag.has_attr(OWN_STYLE):
            tag[OWN_STYLE] = str(tag.get("style") or "")
        style = _style(tag)
    if ratio is not None and ratio != "original":
        style["aspect-ratio"] = RATIOS[ratio]
        style.setdefault("width", "100%")
        style["height"] = "auto"
        style.setdefault("object-fit", "cover")
    if fit is not None:
        style["object-fit"] = fit
    if focus is not None:
        style["object-position"] = {"center": "50% 50%", "top": "50% 0%", "bottom": "50% 100%"}[
            focus
        ]
    _write_style(tag, style)
    return serialize(soup)


def set_alt(html: str, number: int, alt: str) -> str:
    """The page with image `number`'s alt text set (what a screen reader says for it)."""
    text = " ".join(alt.split())[:250]
    soup = parse(html)
    tag = _find(soup, number)
    tag["alt"] = text
    return serialize(soup)
