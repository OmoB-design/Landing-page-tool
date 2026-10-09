"""Page engines (BUILD_SPEC §10.2, §13.1, §16) against the advertorial test template and small
made-up snippets. Pure: no database, no network."""

import json
from pathlib import Path

import pytest

from app.cli.seed_library import SeedError, load_folder
from app.engines import brand_parts, compliance, images, purge, recolor, sections
from app.engines.finalize import FinalizeInputs, finalize_common
from app.engines.html import parse, serialize
from app.engines.money import format_price

LIBRARY = Path(__file__).resolve().parents[3] / "templates" / "library"
FIXTURE = LIBRARY / "advertorial-fixture"
PAGE = (FIXTURE / "index.html").read_text()
MANIFEST = json.loads((FIXTURE / "template.json").read_text())
KEYS = [s["key"] for s in MANIFEST["sections"]]


def keys_of(html: str) -> list[str]:
    return [str(s["data-lp-section"]) for s in sections.top_level_sections(parse(html))]


# ── markup and serialising ───────────────────────────────────────────────────


def test_the_test_template_follows_the_markup_contract() -> None:
    manifest, instructions, html = load_folder(FIXTURE)
    assert manifest.slug == "advertorial-fixture" and instructions.forbidden_terms == [
        "Sample Labs"
    ]
    assert keys_of(html) == KEYS


def test_a_template_whose_sections_disagree_is_refused(tmp_path: Path) -> None:
    folder = tmp_path / "advertorial-fixture"
    folder.mkdir()
    for name in ("template.json", "instructions.json"):
        (folder / name).write_text((FIXTURE / name).read_text())
    (folder / "index.html").write_text(
        PAGE.replace('data-lp-section="faq"', 'data-lp-section="qa"')
    )
    with pytest.raises(SeedError, match="don't match"):
        load_folder(folder)


def test_serialising_keeps_svg_camel_case() -> None:
    html = '<p>viewbox in text</p><svg viewBox="0 0 4 4"><linearGradient id="g"/></svg>'
    out = serialize(parse(html))
    assert 'viewBox="0 0 4 4"' in out and "<linearGradient" in out
    assert "viewbox in text" in out  # text outside SVG is untouched


def test_prices() -> None:
    assert format_price("21", "USD") == "$21.00"
    assert format_price(1234.5, "GBP") == "£1,234.50"
    assert format_price("2400", "JPY") == "¥2,400"
    assert format_price("19.95", "XYZ") == "19.95 XYZ"
    assert format_price(None, "USD") is None


# ── sections ─────────────────────────────────────────────────────────────────


def test_sections_already_in_order_are_left_alone() -> None:
    out, stats = sections.apply_layout(PAGE, KEYS)
    assert out == PAGE and stats["in_order"] is True


def test_sections_are_removed_duplicated_and_reordered_within_their_container() -> None:
    wanted = [
        "promo-bar", "masthead", "hero", "mechanism", "testimonials", "testimonials-2",
        "product", "faq", "offer", "footer",
    ]  # fmt: skip
    out, stats = sections.apply_layout(PAGE, wanted)
    assert keys_of(out) == wanted
    assert stats["removed"] == ["problem"] and stats["duplicated"] == ["testimonials-2"]
    assert stats["warnings"] == []


def test_sections_never_move_out_of_their_container() -> None:
    # The hero sits inside <main>, the masthead outside it: the hero can't go first.
    out, stats = sections.apply_layout(PAGE, ["hero", *[k for k in KEYS if k != "hero"]])
    assert keys_of(out) == KEYS
    assert "different containers" in str(stats["warnings"])


def test_an_unknown_section_is_reported() -> None:
    _, stats = sections.apply_layout(PAGE, [*KEYS, "guarantee"])
    assert "guarantee is not in the page" in str(stats["warnings"])


# ── recolour ─────────────────────────────────────────────────────────────────

GRAZA = {"primary": "#d1e030", "dark": None, "tint": None, "accent": "#0b3d2e"}


def tokens(html: str) -> str:
    block = parse(html).find("style", id="lp-brand-tokens")
    assert block is not None
    return block.get_text()


def test_recolour_sets_brand_tokens_and_readable_text_colours() -> None:
    out, stats = recolor.recolor(
        PAGE, source_palette=MANIFEST["source_palette"], brand_palette=GRAZA,
        brand_fonts={"heading": "ITC Garamond", "body": None},
    )  # fmt: skip
    block = tokens(out)
    assert "--lp-primary: #d1e030" in block and "--lp-accent: #0b3d2e" in block
    assert "--lp-on-primary: #111111" in block  # lime needs dark text
    assert "--lp-on-accent: #ffffff" in block  # dark green needs light text
    assert '--lp-heading-font: "ITC Garamond", Georgia' in block
    assert "--lp-body-font" not in block  # no body font: the template's stays
    assert stats["fonts"] == ["ITC Garamond"]


def test_recolour_maps_exact_colours_keeping_alpha_and_shifts_the_hue_family() -> None:
    out, stats = recolor.recolor(
        PAGE, source_palette=MANIFEST["source_palette"], brand_palette=GRAZA, brand_fonts={}
    )
    assert "#2f6fde" not in out.lower()  # every source primary is gone
    assert "rgba(209, 224, 48, 0.12)" in out  # the product box shadow kept its alpha
    assert "#4a82e4" not in out  # a lighter blue link moved to the brand hue
    assert "#f5b301" in out  # gold stars (another hue family) stay
    assert "#1f2937" in out and "#e5e7eb" in out  # neutrals stay
    assert int(stats["exact"]) > 5 and int(stats["hue_shifted"]) >= 1  # type: ignore[call-overload]


def test_recolour_needs_a_primary_colour() -> None:
    out, stats = recolor.recolor(PAGE, source_palette=None, brand_palette={}, brand_fonts={})
    assert out == PAGE and "no primary colour" in str(stats["skipped"])


def test_missing_brand_colours_are_derived() -> None:
    colours = recolor.brand_colors({"primary": "#1f6feb"})
    assert colours is not None and colours.accent == colours.primary
    assert colours.dark != colours.primary and colours.tint != colours.primary


# ── logo and variants ────────────────────────────────────────────────────────


def test_logo_slots_get_the_brand_logo_or_a_wordmark() -> None:
    out, stats = brand_parts.swap_logos(
        PAGE, logo_url="https://cdn.test/logo.svg", brand_name="Graza"
    )
    logo = parse(out).select_one("[data-lp-logo]")
    assert logo is not None and logo["src"] == "https://cdn.test/logo.svg"
    assert logo["alt"] == "Graza logo" and stats == {"slots": 1, "logos_missing": 0}
    out, stats = brand_parts.swap_logos(PAGE, logo_url=None, brand_name="Graza")
    mark = parse(out).select_one("[data-lp-logo]")
    assert mark is not None and mark.name == "span" and mark.get_text() == "Graza"
    assert stats["logos_missing"] == 1


def variant_names(html: str) -> list[str]:
    return [t.get_text() for t in parse(html).select("[data-lp-variant-name]")]


def test_the_variant_picker_gets_one_unit_per_option() -> None:
    units = [brand_parts.VariantUnit(f"{n} Bottles", f"${n * 20}.00") for n in (1, 2, 6)]
    out, stats = brand_parts.regenerate_variants(PAGE, units)
    assert variant_names(out) == ["1 Bottles", "2 Bottles", "6 Bottles"]
    assert [t.get_text() for t in parse(out).select("[data-lp-variant-price]")][2] == "$120.00"
    assert stats["units"] == 3 and stats["collapsed"] == 0


def test_the_variant_picker_collapses_and_caps() -> None:
    out, stats = brand_parts.regenerate_variants(
        PAGE, [brand_parts.VariantUnit("Drizzle", "$21.00")]
    )
    assert variant_names(out) == ["Drizzle"] and stats["collapsed"] == 1
    many = [brand_parts.VariantUnit(str(size), "$110.00") for size in range(4, 14)]
    out, stats = brand_parts.regenerate_variants(PAGE, many)
    assert len(variant_names(out)) == 8 and stats["truncated"] == 2


# ── forbidden terms ──────────────────────────────────────────────────────────


def test_a_lone_label_loses_only_itself() -> None:
    out, stats = purge.purge_terms(PAGE, ["Sample Labs"])
    assert "Sample Labs" not in out
    assert parse(out).select_one("[data-lp-logo]") is not None  # the masthead stays
    assert stats["purged_terms"][0]["removed"] == "span"  # type: ignore[index]


def test_a_term_inside_a_paragraph_removes_the_paragraph() -> None:
    html = (
        '<section data-lp-section="a"><p>Keep me.</p><p>Made by <b>Acme</b> labs since 1990.</p>'
        "<p>Also keep.</p></section>"
    )
    out, _ = purge.purge_terms(html, ["since 1990"])
    assert "Keep me." in out and "Also keep." in out and "Acme" not in out


def test_term_case_rules() -> None:
    html = '<section data-lp-section="a"><p>clinically tested</p><p>Brandname rules</p></section>'
    out, _ = purge.purge_terms(html, ["Clinically", "brandname"])
    assert "clinically tested" in out  # capitalised term: case-sensitive
    assert "Brandname" not in out  # lowercase term: case-insensitive


def test_text_directly_in_a_section_root_keeps_the_section() -> None:
    html = '<main><section data-lp-section="a">Acme only<p>Other</p></section></main>'
    out, _ = purge.purge_terms(html, ["Acme"])
    assert 'data-lp-section="a"' in out and "Other" in out and "Acme" not in out


# ── image slots ──────────────────────────────────────────────────────────────


def test_media_slots_become_scene_image_slots() -> None:
    out, stats = images.prepare_media_slots(PAGE)
    slot = parse(out).select_one("img.lp-scene-slot")
    assert stats["media_slots"] == 1 and slot is not None and slot.has_attr("data-lp-scene")
    assert "aspect-ratio: 16/9" in str(slot["style"]) and "border-radius: 8px" in str(slot["style"])


def test_image_slots_are_numbered_once_with_sizes() -> None:
    html, _ = images.prepare_media_slots(PAGE)
    numbered, slots = images.number_slots(html)
    kinds = [s.kind for s in slots]
    assert kinds == ["logo", "person", "scene", "scene", "product", "person", "person"]
    assert [s.number for s in slots] == list(range(1, 8))
    scene = next(s for s in slots if s.kind == "scene")
    assert (scene.width, scene.height) == (1200, 675)
    media = slots[3]
    assert (media.width, media.height) == (1200, 675)  # 16/9 on the default scene width
    assert all(s.width == s.height for s in slots if s.kind == "person")
    again, slots_again = images.number_slots(numbered)
    assert again == numbered and [s.number for s in slots_again] == list(range(1, 8))


def test_chosen_images_are_written_and_dropped_slots_removed() -> None:
    html, _ = images.number_slots(PAGE)
    out, stats = images.apply_images(html, {5: "https://img.test/p.jpg"}, drop={2})
    soup = parse(out)
    assert soup.select_one('img[data-lp-img="5"]')["src"] == "https://img.test/p.jpg"  # type: ignore[index]
    assert soup.select_one('img[data-lp-img="2"]') is None
    assert stats == {"replaced": 1, "dropped": 1}


# ── finalize ─────────────────────────────────────────────────────────────────

INPUTS = FinalizeInputs(
    brand_name="Graza",
    product_name="Drizzle",
    language="en-US",
    meta_title=None,
    meta_description="Fresh olive oil for finishing.",
    og_image_url="https://img.test/drizzle.jpg",
    favicon_url="https://img.test/favicon.png",
    support_email="hello@graza.co",
    brand_url="https://www.graza.co",
    product_url="https://www.graza.co/products/drizzle",
    price="$21.00",
    compare_price=None,
    usps=["Made for finishing", "Single origin", "Squeeze bottle", "Fresh harvest"],
)


def meta(html: str, key: str, value: str) -> str | None:
    tag = parse(html).find("meta", attrs={key: value})
    return str(tag["content"]) if tag is not None else None


def test_finalize_sets_meta_share_tags_favicon_and_language() -> None:
    out, stats = finalize_common(PAGE, INPUTS)
    soup = parse(out)
    assert soup.title is not None and soup.title.get_text() == "Drizzle | Graza"
    assert meta(out, "name", "description") == "Fresh olive oil for finishing."
    assert meta(out, "property", "og:image") == "https://img.test/drizzle.jpg"
    assert meta(out, "name", "twitter:card") == "summary_large_image"
    icons = soup.select('link[rel~="icon"]')
    assert [i["href"] for i in icons] == ["https://img.test/favicon.png"]
    assert soup.html is not None and soup.html["lang"] == "en-US"
    assert "<!--" not in out and stats["comments_dropped"] == 1


def test_finalize_fills_names_prices_emails_selling_points_and_ctas() -> None:
    out, stats = finalize_common(PAGE, INPUTS)
    soup = parse(out)
    assert {t.get_text() for t in soup.select("[data-lp-product-name]")} == {"Drizzle"}
    assert {t.get_text() for t in soup.select("[data-lp-brand]")} == {"Graza"}
    assert {t.get_text() for t in soup.select("[data-lp-price]")} == {"$21.00"}
    assert soup.select("[data-lp-compare-price]") == []  # not on sale: no struck-through price
    assert soup.select("[data-lp-sale-percent]") == []  # the brand has no sale
    assert "help@fixture.example" not in out and "mailto:hello@graza.co" in out
    assert [t.get_text() for t in soup.select("[data-lp-usp-text]")] == INPUTS.usps
    assert len(soup.select("[data-lp-usps] svg")) == 4  # each row keeps its tick
    assert {a["href"] for a in soup.select("a[data-lp-cta]")} == {INPUTS.product_url}
    assert stats["ctas"] == 2 and stats["prices"] == 2


def test_finalize_shows_sales_only_when_there_is_one() -> None:
    on_sale = FinalizeInputs(
        **{**INPUTS.__dict__, "price": "$19.00", "compare_price": "$21.00", "sale_percent": 10,
           "promo_text": "Harvest sale: 10% off"},
    )  # fmt: skip
    out, _ = finalize_common(PAGE, on_sale)
    soup = parse(out)
    assert {t.get_text() for t in soup.select("[data-lp-compare-price]")} == {"$21.00"}
    assert [t.get_text() for t in soup.select("span.sale[data-lp-sale-percent]")] == ["10% off"]
    assert soup.select_one("[data-lp-promo]").get_text() == "Harvest sale: 10% off"  # type: ignore[union-attr]


def test_a_discount_promo_goes_when_the_brand_has_no_sale() -> None:
    out, stats = finalize_common(PAGE, INPUTS)
    soup = parse(out)
    assert soup.select("[data-lp-promo]") == [] and stats["promo_removed"] == 1
    assert soup.select('[data-lp-section="promo-bar"]') == []  # the empty bar went too
    out, _ = finalize_common(
        PAGE, FinalizeInputs(**{**INPUTS.__dict__, "promo_text": "Free shipping this week"})
    )
    promo = parse(out).select_one("[data-lp-promo]")
    assert promo is not None and promo.get_text() == "Free shipping this week"


def test_finalize_turns_script_accordions_into_details() -> None:
    html = (
        '<div class="faq"><div class="faq-item"><button class="faq-question">How long?</button>'
        '<div class="faq-answer" style="display:none">A minute.</div></div></div>'
    )
    out, stats = finalize_common(html, INPUTS)
    details = parse(out).select_one("details.faq-item")
    assert stats["faq_fixed"] == 1 and details is not None
    assert details.summary is not None and details.summary.get_text() == "How long?"
    assert "display:none" not in out


def test_empty_scene_slots_get_product_photos_or_go() -> None:
    html, _ = images.prepare_media_slots(PAGE)
    out, stats = finalize_common(
        html,
        FinalizeInputs(**{**INPUTS.__dict__, "product_image_urls": ["https://img.test/p.jpg"]}),
    )
    assert parse(out).select_one("img.lp-scene-slot")["src"] == "https://img.test/p.jpg"  # type: ignore[index]
    out, _ = finalize_common(html, INPUTS)
    assert parse(out).select_one("img.lp-scene-slot") is None and stats["empty_slots_filled"] == 1


# ── compliance ───────────────────────────────────────────────────────────────


def test_the_test_template_is_clean() -> None:
    assert compliance.scan(PAGE)["clean"] is True


@pytest.mark.parametrize(
    ("text", "rule"),
    [
        ("This serum cures eczema in days.", "disease_claim"),
        ("Helps prevent the spread of infections.", "disease_claim"),
        ("Arthritis pain reversed for good.", "disease_claim"),
        ("Our formula is FDA-approved.", "fda_approved"),
        ("Clinically proven to work.", "clinically_proven"),
        ("Results guaranteed or your money back.", "guaranteed_results"),
        ("I lost 20 lbs in a month.", "weight_loss_amount"),
        ("Dermatologist recommended.", "doctor_recommended"),
        ("The #1 serum in America.", "number_one"),
        ("A miracle in a bottle.", "miracle"),
    ],
)
def test_risky_claims_are_found(text: str, rule: str) -> None:
    result = compliance.scan(f'<section data-lp-section="hero"><p>{text}</p></section>')
    assert rule in [f["rule"] for f in result["findings"]]  # type: ignore[attr-defined]


def test_findings_are_located_ranked_and_counted() -> None:
    html = (
        '<section data-lp-section="hero"><h1>Clinically <b>proven</b> results</h1>'
        "<p>Loved by many.</p><p>The best-selling serum.</p></section>"
        '<img alt="FDA approved badge" src="x.png">'
    )
    result = compliance.scan(html)
    findings: list[dict[str, str]] = result["findings"]  # type: ignore[assignment]
    assert [f["severity"] for f in findings] == ["high", "high", "medium"]
    by_rule = {f["rule"]: f for f in findings}
    assert by_rule["clinically_proven"]["location"].startswith("hero > h1")
    assert by_rule["fda_approved"]["location"] == "page > img"
    assert result["high_risk_count"] == 2 and result["counts"] == {"high": 2, "medium": 1, "low": 0}
