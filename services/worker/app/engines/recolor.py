"""Recolour a page to the brand (BUILD_SPEC §10.2 `recolor`). Pure.

1. Library templates declare their colours as CSS custom properties (`--lp-primary` …): those
   are overridden with the brand's palette and fonts in one `<style id="lp-brand-tokens">`,
   together with readable text colours on top of them (`--lp-on-primary` …).
2. Exact pass: every colour that equals a source palette colour (hex or rgb[a], in `<style>`
   blocks, inline styles and SVG paint attributes) becomes its brand counterpart, keeping alpha.
3. Hue sweep: remaining clearly coloured tones in the source primary's hue family move to the
   brand hue, keeping their lightness. Greys, slate text colours, near-white and near-black stay,
   and there is no sweep when the source primary is itself a grey (it has no hue to follow).

The four colours put on the page are recorded on
`<html data-lp-palette="primary:#…;dark:#…;tint:#…;accent:#…">`, so the review desk can recolour
the page again from what is really on it (`page_palette`); the export strips it with the other
`data-lp-*` markers.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass

from bs4 import Tag

from app.engines.colors import (
    RGB,
    derive_dark,
    derive_tint,
    from_hsl,
    hsl,
    hue_distance,
    is_neutral,
    parse_color,
    to_hex,
)
from app.engines.html import ensure_head, parse, serialize, style_text

HUE_FAMILY_DEGREES = 18
# Only clearly coloured tones move with the hue sweep: slate and blue-grey text colours
# (saturation up to ~0.3) and near-black or near-white stay as they are.
SWEEP_MIN_SATURATION = 0.35
SWEEP_LIGHTNESS = (0.12, 0.92)
SVG_PAINT_ATTRS = ("fill", "stroke", "stop-color", "color", "flood-color", "lighting-color")
_COLOR_TOKEN = re.compile(
    r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+(?:\s*[,/]\s*[\d.]+%?)?\s*\)"
)
_ROOT_VAR = re.compile(r"(--lp-[a-z-]+)\s*:\s*([^;}]+)")
TOKENS_ID = "lp-brand-tokens"
PALETTE_ATTR = "data-lp-palette"
ROLES = ("primary", "dark", "tint", "accent")
VAR_FOR_ROLE = {
    "primary": "--lp-primary",
    "dark": "--lp-primary-dark",
    "tint": "--lp-tint",
    "accent": "--lp-accent",
}


@dataclass(frozen=True)
class BrandColors:
    primary: RGB
    dark: RGB
    tint: RGB
    accent: RGB


def brand_colors(palette: Mapping[str, str | None]) -> BrandColors | None:
    """The brand's four colours, deriving any that are missing; None without a primary."""
    primary = parse_color(palette.get("primary"))
    if primary is None:
        return None
    return BrandColors(
        primary=primary,
        dark=parse_color(palette.get("dark")) or derive_dark(primary),
        tint=parse_color(palette.get("tint")) or derive_tint(primary),
        accent=parse_color(palette.get("accent")) or primary,
    )


def palette_of(colors: BrandColors) -> dict[str, str]:
    return {role: to_hex(getattr(colors, role)) for role in ROLES}


def page_palette(html: str) -> dict[str, str] | None:
    """The four colours on the page, as the last recolour recorded them: `data-lp-palette` on
    `<html>`, else the `--lp-*` values in the brand tokens block (pages recoloured before the
    record existed); None when neither is there."""
    soup = parse(html)
    root = soup.find("html")
    if isinstance(root, Tag) and root.has_attr(PALETTE_ATTR):
        recorded = dict(
            part.split(":", 1) for part in str(root[PALETTE_ATTR]).split(";") if ":" in part
        )
        found = {role: to_hex(rgb) for role in ROLES if (rgb := parse_color(recorded.get(role)))}
        if "primary" in found:
            return found
    block = soup.find("style", id=TOKENS_ID)
    if isinstance(block, Tag):
        declared = dict(_ROOT_VAR.findall(style_text(block)))
        found = {
            role: to_hex(rgb)
            for role, var in VAR_FOR_ROLE.items()
            if (rgb := parse_color(declared.get(var, "").strip()))
        }
        if "primary" in found:
            return found
    return None


def readable_on(rgb: RGB) -> str:
    """Black or white text, whichever reads better on this colour (WCAG relative luminance)."""

    def channel(c: int) -> float:
        v = c / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(c) for c in rgb)
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return "#111111" if luminance > 0.4 else "#ffffff"


def _alpha_suffix(token: str) -> str | None:
    """The alpha part of a colour token, to keep on its replacement (None when opaque)."""
    lower = token.lower()
    if lower.startswith("#"):
        return lower[7:] if len(lower) == 9 else None
    numbers = re.findall(r"[\d.]+%?", lower)
    return numbers[3] if len(numbers) >= 4 else None


def _render(rgb: RGB, original: str) -> str:
    alpha = _alpha_suffix(original)
    if alpha is None:
        return to_hex(rgb)
    if original.startswith("#"):
        return to_hex(rgb) + alpha
    return "rgba({}, {}, {}, {})".format(*rgb, alpha)


def _parse_any_alpha(token: str) -> RGB | None:
    """Like parse_color but ignores transparency, so shadows and tints still match."""
    lower = token.strip().lower()
    if lower.startswith("#") and len(lower) == 9:
        lower = lower[:7]
    elif lower.startswith("rgb"):
        numbers = re.findall(r"[\d.]+", lower)[:3]
        if len(numbers) == 3:
            lower = "rgb({}, {}, {})".format(*numbers)
    return parse_color(lower)


class _Recolourer:
    def __init__(self, source: dict[str, RGB], brand: BrandColors) -> None:
        # When two source roles share a colour (accent = primary), the first role wins.
        self.exact: dict[RGB, RGB] = {}
        for role in ROLES:
            if role in source:
                self.exact.setdefault(source[role], getattr(brand, role))
        self.source_primary = source.get("primary")
        self.brand = brand
        self.exact_count = 0
        self.hue_count = 0

    def token(self, match: re.Match[str]) -> str:
        original = match.group(0)
        rgb = _parse_any_alpha(original)
        if rgb is None:
            return original
        if rgb in self.exact:
            self.exact_count += 1
            return _render(self.exact[rgb], original)
        if self.source_primary is None or is_neutral(self.source_primary) or is_neutral(rgb):
            return original
        h, s, lightness = hsl(rgb)
        if s < SWEEP_MIN_SATURATION or not SWEEP_LIGHTNESS[0] <= lightness <= SWEEP_LIGHTNESS[1]:
            return original
        src_h, src_s, _ = hsl(self.source_primary)
        if hue_distance(h, src_h) > HUE_FAMILY_DEGREES:
            return original
        brand_h, brand_s, _ = hsl(self.brand.primary)
        ratio = brand_s / src_s if src_s else 1.0
        self.hue_count += 1
        return _render(from_hsl(brand_h, min(1.0, s * ratio), lightness), original)

    def text(self, value: str) -> str:
        return _COLOR_TOKEN.sub(self.token, value)


def recolor(
    html: str,
    *,
    source_palette: Mapping[str, str | None] | None,
    brand_palette: Mapping[str, str | None],
    brand_fonts: Mapping[str, str | None],
) -> tuple[str, dict[str, object]]:
    brand = brand_colors(brand_palette)
    fonts: list[str] = []
    stats: dict[str, object] = {"vars_set": [], "exact": 0, "hue_shifted": 0, "fonts": fonts}
    if brand is None:
        stats["skipped"] = "The brand has no primary colour."
        return html, stats
    soup = parse(html)
    styles = [s for s in soup.find_all("style") if isinstance(s, Tag)]
    template_styles = [s for s in styles if s.get("id") != TOKENS_ID]
    # The template's own declarations (fallback fonts come from these, never from an earlier
    # recolour's tokens, so a second recolour doesn't nest them).
    declared = dict(_ROOT_VAR.findall(" ".join(style_text(s) for s in template_styles)))

    source = {
        role: rgb
        for role, value in (source_palette or {}).items()
        if role in ROLES and (rgb := parse_color(value)) is not None
    }
    worker = _Recolourer(source, brand)
    for style in template_styles:
        style.string = worker.text(style_text(style))
    for tag in soup.find_all(True):
        if not isinstance(tag, Tag):
            continue
        if tag.has_attr("style"):
            tag["style"] = worker.text(str(tag["style"]))
        for attr in SVG_PAINT_ATTRS:
            if tag.has_attr(attr):
                tag[attr] = worker.text(str(tag[attr]))

    tokens: dict[str, str] = {}
    for role, var in VAR_FOR_ROLE.items():
        if var in declared:
            tokens[var] = to_hex(getattr(brand, role))
    for role, var in (
        ("primary", "--lp-on-primary"),
        ("accent", "--lp-on-accent"),
        ("dark", "--lp-on-dark"),
    ):
        if var in declared:
            tokens[var] = readable_on(getattr(brand, role))
    for kind, var in (("heading", "--lp-heading-font"), ("body", "--lp-body-font")):
        font = (brand_fonts.get(kind) or "").strip().replace('"', "")
        if font and var in declared:
            tokens[var] = f'"{font}", {declared[var].strip()}'
            fonts.append(font)
    if tokens:
        existing = soup.find("style", id=TOKENS_ID)
        block = existing if isinstance(existing, Tag) else soup.new_tag("style", id=TOKENS_ID)
        # Tokens this recolour doesn't set (fonts, when only colours change) stay as they were.
        merged = {**dict(_ROOT_VAR.findall(style_text(block))), **tokens}
        block.string = ":root { " + " ".join(f"{k}: {v.strip()};" for k, v in merged.items()) + " }"
        if not isinstance(existing, Tag):
            ensure_head(soup).append(block)
    root = soup.find("html")
    if isinstance(root, Tag):
        root[PALETTE_ATTR] = ";".join(f"{k}:{v}" for k, v in palette_of(brand).items())
    stats["vars_set"] = sorted(tokens)
    stats["exact"] = worker.exact_count
    stats["hue_shifted"] = worker.hue_count
    return serialize(soup), stats
