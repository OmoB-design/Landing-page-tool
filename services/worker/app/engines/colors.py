"""Colour parsing and the brand palette choice (BUILD_SPEC §7.3).

Priority for the primary colour: the rendered brand colour (header, buttons, links) → the CTA
button colour → the `theme-color` meta tag → the dominant colour in the page's own CSS. Greys,
near-white and near-black are left out, and so are colours of common third-party widgets
(payment buttons, review stars, chat bubbles). `dark` and `tint` are derived from the primary.
"""

import colorsys
import re
from collections.abc import Iterable
from dataclasses import dataclass, field

RGB = tuple[int, int, int]

_HEX = re.compile(r"^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$", re.IGNORECASE)
_RGB = re.compile(r"^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$")

# Colours of widgets a brand page embeds but does not own.
THIRD_PARTY: dict[str, str] = {
    "#5a31f4": "Shop Pay",
    "#ffc439": "PayPal",
    "#0070ba": "PayPal",
    "#003087": "PayPal",
    "#ffb3c7": "Klarna",
    "#b2fce4": "Afterpay",
    "#00b67a": "Trustpilot",
    "#635bff": "Stripe",
    "#4285f4": "Google",
    "#1877f2": "Facebook",
    "#25d366": "WhatsApp",
    "#339901": "Judge.me",
    "#ffd200": "Klaviyo",
}


def parse_color(value: str | None) -> RGB | None:
    """'#abc', '#aabbcc', 'rgb(1, 2, 3)', 'rgba(1, 2, 3, 0.9)'; None if unparseable or mostly
    transparent."""
    if not value:
        return None
    text = value.strip().lower()
    if match := _HEX.match(text):
        digits = match.group(1)
        if len(digits) == 3:
            digits = "".join(c * 2 for c in digits)
        if len(digits) == 8 and int(digits[6:], 16) < 150:
            return None
        return int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16)
    if match := _RGB.match(text):
        alpha = match.group(4)
        if alpha is not None:
            a = float(alpha[:-1]) / 100 if alpha.endswith("%") else float(alpha)
            if a < 0.6:
                return None
        r, g, b = (min(255, round(float(match.group(i)))) for i in (1, 2, 3))
        return r, g, b
    return None


def to_hex(rgb: RGB) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def hsl(rgb: RGB) -> tuple[float, float, float]:
    """(hue 0 to 360, saturation 0 to 1, lightness 0 to 1)."""
    h, lightness, s = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    return h * 360, s, lightness


def from_hsl(h: float, s: float, lightness: float) -> RGB:
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, lightness, s)
    return round(r * 255), round(g * 255), round(b * 255)


def is_neutral(rgb: RGB) -> bool:
    """Greys, near-white and near-black: never a brand's primary colour."""
    _, s, lightness = hsl(rgb)
    return s < 0.18 or lightness > 0.93 or lightness < 0.09


def _distance(a: RGB, b: RGB) -> float:
    return float(sum((x - y) ** 2 for x, y in zip(a, b, strict=True)) ** 0.5)


def third_party(rgb: RGB) -> str | None:
    for hex_value, owner in THIRD_PARTY.items():
        known = parse_color(hex_value)
        if known and _distance(rgb, known) < 14:
            return owner
    return None


def hue_distance(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def derive_dark(rgb: RGB) -> RGB:
    h, s, lightness = hsl(rgb)
    return from_hsl(h, s, max(0.12, lightness * 0.6))


def derive_tint(rgb: RGB) -> RGB:
    h, s, _ = hsl(rgb)
    return from_hsl(h, min(s, 0.45), 0.95)


@dataclass
class Candidate:
    hex: str
    sources: list[str] = field(default_factory=list)
    weight: float = 0.0
    neutral: bool = False


@dataclass
class PaletteChoice:
    primary: str | None
    dark: str | None
    tint: str | None
    accent: str | None
    source_hue: int | None
    candidates: list["RankedCandidate"]
    notes: list[str]


@dataclass
class RankedCandidate:
    hex: str
    label: str
    reason: str
    signal: int  # 0 to 3: how sure we are this is the brand colour


def _cluster(
    samples: Iterable[tuple[str, float]], *, allow_neutral: bool = False
) -> list[Candidate]:
    """Groups near-identical colours (by RGB distance) and sums their weights, heaviest first."""
    clusters: list[tuple[RGB, Candidate]] = []
    for raw, weight in samples:
        rgb = parse_color(raw)
        if rgb is None or weight <= 0 or third_party(rgb):
            continue
        neutral = is_neutral(rgb)
        if neutral and not allow_neutral:
            continue
        for anchor, candidate in clusters:
            if _distance(anchor, rgb) < 24:
                candidate.weight += weight
                break
        else:
            clusters.append((rgb, Candidate(hex=to_hex(rgb), weight=weight, neutral=neutral)))
    return sorted((c for _, c in clusters), key=lambda c: c.weight, reverse=True)


def choose_palette(
    *,
    brand_surface_colors: list[tuple[str, float]],
    button_colors: list[tuple[str, float]],
    theme_color: str | None,
    css_colors: list[tuple[str, float]],
    ai_color: str | None = None,
) -> PaletteChoice:
    sources: list[tuple[str, list[Candidate]]] = [
        ("Brand colour on the page", _cluster(brand_surface_colors)),
        ("Button colour", _cluster(button_colors)),
        ("theme-color tag", _cluster([(theme_color, 1.0)] if theme_color else [])),
        ("Page styles", _cluster(css_colors)),
        ("AI suggestion", _cluster([(ai_color, 1.0)] if ai_color else [])),
    ]
    merged: list[Candidate] = []
    for source_index, (label, clustered) in enumerate(sources):
        source_weight = len(sources) - source_index  # earlier sources count for more
        for rank, candidate in enumerate(clustered[:3]):
            rgb = parse_color(candidate.hex)
            assert rgb is not None
            existing = next(
                (m for m in merged if _distance(parse_color(m.hex) or (0, 0, 0), rgb) < 30), None
            )
            if existing is None:
                existing = Candidate(hex=candidate.hex)
                merged.append(existing)
            if label not in existing.sources:
                existing.sources.append(label)
            existing.weight += source_weight * (3 - rank)

    notes: list[str] = []
    if not merged:
        # A neutral brand (black and white): use the darkest strong button colour.
        neutral_buttons = [
            c for c in _cluster(button_colors, allow_neutral=True) if c.hex != "#ffffff"
        ]
        if neutral_buttons:
            merged = [Candidate(hex=neutral_buttons[0].hex, sources=["Button colour"], weight=1)]
            notes.append("The site is mostly black, white and grey; the button colour is used.")
        else:
            return PaletteChoice(None, None, None, None, None, [], ["No brand colour found."])

    merged.sort(key=lambda c: c.weight, reverse=True)
    ranked = [
        RankedCandidate(
            hex=c.hex,
            label=c.hex.upper(),
            reason=" + ".join(c.sources),
            signal=min(3, max(1, len(c.sources) + (1 if i == 0 else 0))),
        )
        for i, c in enumerate(merged[:5])
    ]
    primary = parse_color(merged[0].hex)
    assert primary is not None
    primary_hue = hsl(primary)[0]
    accent = next(
        (
            c.hex
            for c in merged[1:]
            if (rgb := parse_color(c.hex))
            and not is_neutral(rgb)
            and hue_distance(hsl(rgb)[0], primary_hue) >= 30
        ),
        None,
    )
    return PaletteChoice(
        primary=to_hex(primary),
        dark=to_hex(derive_dark(primary)),
        tint=to_hex(derive_tint(primary)),
        accent=accent,
        source_hue=round(primary_hue),
        candidates=ranked,
        notes=notes,
    )


_CSS_COLOR = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]{5,40}\)")


def css_color_counts(css_text: str) -> list[tuple[str, float]]:
    """Colour literals in CSS text with how often each appears (raw strings)."""
    counts: dict[str, float] = {}
    for match in _CSS_COLOR.findall(css_text):
        counts[match.lower()] = counts.get(match.lower(), 0) + 1
    return sorted(counts.items(), key=lambda item: item[1], reverse=True)[:60]
