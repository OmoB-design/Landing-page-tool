"""Product extraction (BUILD_SPEC §7.4) against made-up store data and pages."""

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest

from app.engines import product_extract as pe
from app.models.product import Briefing, ProductEnrichment
from app.providers.anthropic import strict_schema

FIXTURES = Path(__file__).parent / "fixtures"
PAGE = (FIXTURES / "product_page.html").read_text()
STORE_URL = "https://www.lumeskin.test/collections/all/products/glow-serum?variant=1001"


def shopify() -> tuple[dict[str, Any], dict[str, Any]]:
    product = json.loads((FIXTURES / "shopify_product.json").read_text())["product"]
    js = json.loads((FIXTURES / "shopify_product.js.json").read_text())
    return product, js


@pytest.mark.parametrize(
    ("url", "handle"),
    [
        ("https://shop.test/products/glow-serum", "glow-serum"),
        ("https://shop.test/collections/skin/products/Glow-Serum?variant=1#reviews", "glow-serum"),
        ("https://shop.test/en-gb/products/glow-serum/", "glow-serum"),
        ("https://shop.test/shop/glow-serum", None),
    ],
)
def test_handle_from_url(url: str, handle: str | None) -> None:
    assert pe.handle_from_url(url) == handle


def test_money_and_sale_prices() -> None:
    assert pe.money("21.00") == Decimal("21.00")
    assert pe.money(36) == Decimal("36.00")
    assert pe.money(1995, cents=True) == Decimal("19.95")
    assert pe.money("") is None and pe.money("free") is None and pe.money(-1) is None
    assert pe.regular_and_sale(Decimal("24"), Decimal("32")) == (Decimal("32"), Decimal("24"))
    assert pe.regular_and_sale(Decimal("21"), Decimal("21")) == (Decimal("21"), None)
    assert pe.regular_and_sale(Decimal("21"), None) == (Decimal("21"), None)


def test_from_shopify_reads_prices_variants_images_and_plans() -> None:
    product, js = shopify()
    pulled = pe.from_shopify(product, js, STORE_URL)
    assert pulled.pull_source == "shopify_json"
    assert pulled.name == "Lumé Glow Serum" and pulled.handle == "glow-serum"
    assert pulled.url == "https://www.lumeskin.test/products/glow-serum"
    assert pulled.currency == "GBP"
    # The first variant is on sale: compare-at £32, selling at £24.
    assert (pulled.price, pulled.sale_price) == (Decimal("32.00"), Decimal("24.00"))
    assert pulled.description == "A daily vitamin C serum for a brighter look. 30 ml"
    assert [i.source_url for i in pulled.images] == [
        "https://cdn.shopify.com/s/files/1/0001/files/glow-front.png?v=1",
        "https://cdn.shopify.com/s/files/1/0001/files/glow-30ml.png?v=1",
    ]
    assert [(v.name, v.options, v.price, v.available) for v in pulled.variants] == [
        ("30 ml", {"Size": "30 ml"}, Decimal("24.00"), True),
        ("50 ml", {"Size": "50 ml"}, Decimal("36.00"), False),
    ]
    assert pulled.variants[0].image_source_url == pulled.images[1].source_url
    # Plans priced from Shopify's allocation for the first variant.
    assert [(p.label, p.price, p.compare_at_price) for p in pulled.pricing_lines] == [
        ("Subscribe & save 10% · Every month", Decimal("21.60"), Decimal("24.00"))
    ]


def test_selling_plans_without_allocations_use_the_adjustment() -> None:
    _, js = shopify()
    js["variants"][0]["selling_plan_allocations"] = []
    lines = pe.selling_plans(js)
    assert [(p.label, p.price) for p in lines] == [
        ("Subscribe & save 10% · Every month", Decimal("21.60")),
        ("Subscribe & save 10% · Every 2 months", Decimal("21.60")),
    ]


def test_a_single_default_variant_is_not_listed() -> None:
    product, _ = shopify()
    product["options"] = [{"name": "Title", "values": ["Default Title"]}]
    product["variants"] = [
        {"id": 1, "title": "Default Title", "option1": "Default Title", "price": "18.00"}
    ]
    pulled = pe.from_shopify(product, None, STORE_URL)
    assert pulled.variants == []
    assert pulled.price == Decimal("18.00") and pulled.pricing_lines == []


def test_match_catalogue() -> None:
    products = [
        {"handle": "glow-serum-v2", "title": "Glow Serum"},
        {"handle": "night-cream", "title": "Night Cream"},
    ]
    assert pe.match_catalogue(products, "night-cream") == products[1]
    assert pe.match_catalogue(products, "glow-serum") == products[0]  # renamed handle
    assert pe.match_catalogue(products, "day-mask") is None


def test_from_html_prefers_jsonld_and_names_variants_from_offer_links() -> None:
    pulled = pe.from_html(PAGE, "https://www.lumeskin.test/shop/glow-serum")
    assert pulled is not None and pulled.pull_source == "jsonld"
    assert pulled.name == "Glow Serum" and pulled.handle == "glow-serum"
    assert pulled.currency == "GBP" and pulled.price == Decimal("24.00")
    assert pulled.description == "A daily vitamin C serum."
    assert [i.source_url for i in pulled.images] == [
        "https://www.lumeskin.test/images/glow-front.jpg",
        "https://www.lumeskin.test/images/glow-side.jpg",
    ]
    assert [(v.name, v.price, v.available) for v in pulled.variants] == [
        ("30 ml", Decimal("24.00"), True),
        ("50 ml", Decimal("36.00"), False),
    ]


def test_from_html_falls_back_to_open_graph_then_h1() -> None:
    no_jsonld = PAGE.replace('"@type": "Product"', '"@type": "Thing"')
    pulled = pe.from_html(no_jsonld, "https://www.lumeskin.test/shop/glow-serum")
    assert pulled is not None and pulled.pull_source == "og"
    assert pulled.name == "Glow Serum"  # site name stripped from og:title
    assert pulled.price == Decimal("24.00") and pulled.currency == "GBP"
    assert [i.source_url for i in pulled.images] == ["https://www.lumeskin.test/images/glow-og.jpg"]

    bare = "<html><head><title>Shop</title></head><body><h1> Night  Cream </h1></body></html>"
    pulled = pe.from_html(bare, "https://shop.test/products/night-cream")
    assert pulled is not None and pulled.pull_source == "h1"
    assert (pulled.name, pulled.handle, pulled.price) == ("Night Cream", "night-cream", None)

    assert pe.from_html("<html><body><p>Hello</p></body></html>", "https://shop.test/") is None


def test_currency_from_the_shopify_theme_object() -> None:
    page = (
        "<html><body><h1>Mask</h1><script>Shopify.currency = "
        '{"active":"CAD","rate":"1.0"};</script></body></html>'
    )
    pulled = pe.from_html(page, "https://shop.test/products/mask")
    assert pulled is not None and pulled.currency == "CAD"


def test_page_text_skips_site_chrome() -> None:
    text = pe.page_text(PAGE)
    assert "Brighter-looking skin in four weeks" in text and "Vegan and cruelty free" in text
    assert "Cart" not in text and "All rights reserved" not in text


def test_shopify_images_are_downloaded_at_a_capped_width() -> None:
    assert pe.image_download_url("https://cdn.shopify.com/s/files/a.png?v=1") == (
        "https://cdn.shopify.com/s/files/a.png?v=1&width=2048"
    )
    assert pe.image_download_url("https://shop.test/cdn/shop/files/a.png?width=800").endswith(
        "width=800"
    )
    assert pe.image_download_url("https://img.test/a.png") == "https://img.test/a.png"


@pytest.mark.parametrize("model", [ProductEnrichment, Briefing])
def test_structured_output_schemas_are_closed_and_inlined(model: Any) -> None:
    schema = strict_schema(model)
    text = json.dumps(schema)
    assert "$ref" not in text and "$defs" not in text and '"title"' not in text

    def objects(node: Any) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        if isinstance(node, dict):
            if node.get("type") == "object":
                found.append(node)
            for value in node.values():
                found.extend(objects(value))
        elif isinstance(node, list):
            for value in node:
                found.extend(objects(value))
        return found

    assert objects(schema) and all(o["additionalProperties"] is False for o in objects(schema))
