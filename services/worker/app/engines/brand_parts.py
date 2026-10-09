"""Brand pieces of a library template (BUILD_SPEC §10.2 `swap_logos`, `regenerate_variants`):
the logo slots and the variant picker. Pure."""

import copy
from dataclasses import dataclass

from bs4 import Tag

from app.engines.html import parse, serialize, set_text

MAX_VARIANT_UNITS = 8


def swap_logos(
    html: str, *, logo_url: str | None, brand_name: str
) -> tuple[str, dict[str, object]]:
    """`[data-lp-logo]` images get the brand logo. Without one, a text wordmark stands in and
    the slot counts as missing."""
    soup = parse(html)
    slots = [t for t in soup.select("[data-lp-logo]") if isinstance(t, Tag)]
    missing = 0
    for slot in slots:
        if logo_url:
            image = slot if slot.name == "img" else soup.new_tag("img")
            image["src"] = logo_url
            image["alt"] = f"{brand_name} logo"
            image["data-lp-logo"] = ""
            for attr in ("srcset", "sizes", "width"):
                if attr in image.attrs:
                    del image[attr]
            if image is not slot:
                for attr in ("class", "style"):
                    if slot.has_attr(attr):
                        image[attr] = slot[attr]
                slot.replace_with(image)
        else:
            missing += 1
            mark = soup.new_tag("span", attrs={"class": "lp-wordmark", "data-lp-logo": ""})
            mark.string = brand_name
            slot.replace_with(mark)
    return serialize(soup), {"slots": len(slots), "logos_missing": missing}


@dataclass(frozen=True)
class VariantUnit:
    name: str
    price: str | None
    image_url: str | None = None


def regenerate_variants(html: str, variants: list[VariantUnit]) -> tuple[str, dict[str, object]]:
    """Each `[data-lp-variants]` picker gets one unit per product variant (cloned from its first
    `[data-lp-variant]` unit), up to 8; with one variant or none it collapses to one unit."""
    soup = parse(html)
    pickers = [t for t in soup.select("[data-lp-variants]") if isinstance(t, Tag)]
    stats: dict[str, object] = {"pickers": len(pickers), "units": 0, "collapsed": 0, "truncated": 0}
    for picker in pickers:
        units = [u for u in picker.select("[data-lp-variant]") if isinstance(u, Tag)]
        if not units:
            continue
        model = units[0]
        anchor = soup.new_tag("lp-anchor")
        model.insert_before(anchor)
        for unit in units:
            unit.extract()
        wanted = variants[:MAX_VARIANT_UNITS]
        stats["truncated"] = max(0, len(variants) - MAX_VARIANT_UNITS)
        if len(wanted) <= 1:
            stats["collapsed"] = int(stats["collapsed"]) + 1  # type: ignore[call-overload]
        for variant in wanted or [VariantUnit(name="", price=None)]:
            unit = copy.copy(model)
            _fill(unit, variant)
            anchor.insert_before(unit)
            stats["units"] = int(stats["units"]) + 1  # type: ignore[call-overload]
        anchor.decompose()
    return serialize(soup), stats


def _fill(unit: Tag, variant: VariantUnit) -> None:
    name = unit.select_one("[data-lp-variant-name]")
    if isinstance(name, Tag):
        if variant.name:
            set_text(name, variant.name)
        else:
            name.decompose()
    price = unit.select_one("[data-lp-variant-price]")
    if isinstance(price, Tag):
        if variant.price:
            set_text(price, variant.price)
        else:
            price.decompose()
    image = unit.select_one("img[data-lp-variant-image]")
    if isinstance(image, Tag):
        if variant.image_url:
            image["src"] = variant.image_url
            image["alt"] = variant.name
        else:
            image.decompose()
