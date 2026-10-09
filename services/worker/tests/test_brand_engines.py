"""Pure engines: static brand extraction and the palette choice (fixture: a made-up brand)."""

from pathlib import Path

import pytest

from app.engines import brand_extract, colors

FIXTURE = (Path(__file__).parent / "fixtures" / "brand_page.html").read_text()
URL = "https://www.lumeskin.test/"


# ── extraction ────────────────────────────────────────────────────────────────
def test_extracts_name_tagline_logo_favicon_and_more() -> None:
    signals = brand_extract.extract_static(FIXTURE, URL)
    assert signals.name == "Lumé Skin"
    assert signals.tagline == "Clean, effective skincare made in small batches."
    assert signals.logo_urls[0] == "https://www.lumeskin.test/images/lume-logo.png"
    assert signals.logo_urls[-1] == "https://www.lumeskin.test/images/social-banner.jpg"
    assert signals.favicon_urls[0] == "https://www.lumeskin.test/apple-touch-icon.png"
    assert signals.theme_color == "#e4572e"
    assert signals.lang == "en-GB"
    assert signals.emails == ["hello@lumeskin.test"]
    assert signals.cta_texts[0] == "Shop the serum"
    assert "Brighter skin in 14 days" in signals.headings
    assert "dataLayer" not in signals.text_digest  # scripts are not page text
    assert ("#e4572e", 3) in signals.css_colors


def test_site_chrome_buttons_are_not_ctas() -> None:
    html = (
        "<html><body><a class='btn'>Skip to content</a><button>Menu</button>"
        "<button>Cart (0)</button><a class='button'>Learn more</a>"
        "<a class='btn'>Shop the drizzle</a></body></html>"
    )
    signals = brand_extract.extract_static(html, URL)
    assert signals.cta_texts == ["Shop the drizzle", "Learn more"]


def test_the_home_link_logo_is_the_fallback() -> None:
    html = (
        '<html lang="EN"><body><header><a aria-label="Topicals homepage" href="/">'
        '<svg viewBox="0 0 80 16"><path d="M0 0h80v16H0z"/></svg></a>'
        '<a href="/collections/all"><svg><path d="M1 1"/></svg></a></header></body></html>'
    )
    signals = brand_extract.extract_static(html, "https://mytopicals.com/")
    assert signals.logo_svg is not None and 'viewBox="0 0 80 16"' in signals.logo_svg
    assert signals.lang == "en"


@pytest.mark.parametrize(
    ("raw", "lang"), [("EN", "en"), ("en-us", "en-US"), ("pt_br", "pt-BR"), ("", None)]
)
def test_normalise_lang(raw: str, lang: str | None) -> None:
    assert brand_extract.normalise_lang(raw) == lang


def test_svg_markup_keeps_camel_case_names() -> None:
    html = (
        '<html><body><header><a class="logo"><svg viewBox="0 0 10 10" preserveAspectRatio="none">'
        '<defs><linearGradient id="g" gradientUnits="userSpaceOnUse"></linearGradient>'
        '<clipPath id="c"></clipPath></defs><path d="M0 0" fill="url(#g)"/></svg></a></header>'
        "</body></html>"
    )
    svg = brand_extract.extract_static(html, URL).logo_svg or ""
    for name in ("viewBox=", "preserveAspectRatio=", "<linearGradient", "gradientUnits=",
                 "</linearGradient>", "<clipPath", "</clipPath>"):  # fmt: skip
        assert name in svg, name
    assert 'fill="url(#g)"' in svg  # attribute values are untouched


def test_inline_svg_logos_are_kept() -> None:
    html = (
        '<html><body><header><a class="logo">'
        '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg></a></header></body></html>'
    )
    signals = brand_extract.extract_static(html, URL)
    assert signals.logo_urls == []
    assert signals.logo_svg is not None and signals.logo_svg.startswith("<svg")


@pytest.mark.parametrize(
    ("title", "site_name", "url", "expected"),
    [
        ("Ignored", "Graza", "https://www.graza.co", "Graza"),
        (
            "Allbirds | Sustainable Shoes \u2013 Comfort",
            None,
            "https://www.allbirds.com",
            "Allbirds",
        ),
        ("Shop serums — Topicals", None, "https://mytopicals.com", "Topicals"),
        (None, None, "https://www.my-brand.co.uk", "My Brand"),
    ],
)
def test_brand_name(title: str | None, site_name: str | None, url: str, expected: str) -> None:
    assert brand_extract.brand_name(title, site_name, url) == expected


@pytest.mark.parametrize(
    ("name", "prefix"),
    [("Allbirds", "ALL"), ("Lumé Skin Care", "LSC"), ("Graza", "GRA"), ("A", "AX"), ("", "BR")],
)
def test_suggest_prefix(name: str, prefix: str) -> None:
    assert brand_extract.suggest_prefix(name) == prefix


def test_first_font_skips_generic_families() -> None:
    assert brand_extract.first_font('"Lume Sans", "Helvetica Neue", sans-serif') == "Lume Sans"
    assert brand_extract.first_font("system-ui, -apple-system, sans-serif") is None


# ── colours ───────────────────────────────────────────────────────────────────
def test_parse_color() -> None:
    assert colors.parse_color("#abc") == (170, 187, 204)
    assert colors.parse_color("rgb(228, 87, 46)") == (228, 87, 46)
    assert colors.parse_color("rgba(228, 87, 46, 0.2)") is None  # mostly transparent
    assert colors.parse_color("rgb(1 2 3 / 90%)") == (1, 2, 3)
    assert colors.parse_color("var(--x)") is None


def test_neutral_and_third_party_colours_are_recognised() -> None:
    assert colors.is_neutral((240, 240, 240)) and colors.is_neutral((20, 20, 20))
    assert not colors.is_neutral((228, 87, 46))
    assert colors.third_party((90, 49, 244)) == "Shop Pay"


def test_rendered_brand_colour_wins_and_widgets_are_ignored() -> None:
    choice = colors.choose_palette(
        brand_surface_colors=[("rgb(228, 87, 46)", 900), ("rgb(90, 49, 244)", 2000)],
        button_colors=[("rgb(228, 87, 46)", 5000), ("rgb(90, 49, 244)", 9000)],
        theme_color="#e4572e",
        css_colors=[("#e4572e", 3), ("#2a9d8f", 2)],
    )
    assert choice.primary == "#e4572e"
    assert choice.candidates[0].signal == 3  # several sources agree
    assert all(c.hex != "#5a31f4" for c in choice.candidates)  # Shop Pay purple left out
    assert choice.accent == "#2a9d8f"
    assert choice.dark is not None and choice.tint is not None
    dark_l = colors.hsl(colors.parse_color(choice.dark) or (0, 0, 0))[2]
    tint_l = colors.hsl(colors.parse_color(choice.tint) or (0, 0, 0))[2]
    assert dark_l < 0.45 < tint_l


def test_a_black_and_white_brand_uses_its_button_colour() -> None:
    choice = colors.choose_palette(
        brand_surface_colors=[("rgb(255, 255, 255)", 5000), ("rgb(33, 33, 33)", 4000)],
        button_colors=[("rgb(33, 33, 33)", 6000), ("rgb(255, 255, 255)", 100)],
        theme_color=None,
        css_colors=[],
    )
    assert choice.primary == "#212121"
    assert choice.notes and "black, white and grey" in choice.notes[0]


def test_no_colours_at_all() -> None:
    choice = colors.choose_palette(
        brand_surface_colors=[], button_colors=[], theme_color=None, css_colors=[]
    )
    assert choice.primary is None and choice.candidates == []
