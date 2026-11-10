"""A page's offer (B7.2b, D146): prices, the checkout link, the brief's OFFER block and the
checkout warning (engines/offers.py)."""

import json
import uuid
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient

from app.db import transaction
from app.engines import offers
from app.engines.fragments import dump
from app.engines.html import parse
from app.providers import storage
from tests.conftest import DbUser, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)

PERCENT = {"name": "Autumn", "price_change": "percent", "price_value": "20", "checkout": "code",
           "code": "AUTUMN 20", "promo_text": "Autumn edit", "details": "Free strap"}  # fmt: skip


def test_an_offer_comes_off_the_stores_current_price() -> None:
    prices = offers.page_prices("145.00", None, PERCENT)
    assert prices == offers.Prices(Decimal("145.00"), Decimal("116.00"), Decimal("145.00"), 20)
    # On sale in the store: the offer comes off the sale price; the regular price is struck through.
    on_sale = offers.page_prices("145.00", "125.00", PERCENT)
    assert (on_sale.store, on_sale.now, on_sale.regular, on_sale.percent) == (
        Decimal("125.00"), Decimal("100.00"), Decimal("145.00"), 31,
    )  # fmt: skip
    amount = offers.page_prices("20", None, {"price_change": "amount", "price_value": "25"})
    assert (amount.now, amount.regular, amount.percent) == (Decimal("0.00"), Decimal("20"), 100)


def test_without_an_offer_the_store_decides_and_badges_tell_the_truth() -> None:
    assert offers.page_prices("145.00", None, None) == offers.Prices(
        Decimal("145.00"), Decimal("145.00"), None, None
    )
    # The store's own sale: a real 14% (not a typed-in percent beside the full price).
    assert offers.page_prices("145.00", "125.00", None).percent == 14
    assert offers.page_prices(None, None, PERCENT).now is None
    free = {"price_change": "none", "price_value": None}
    assert offers.page_prices("145", None, free).regular is None


def test_variant_prices_take_the_offer_too() -> None:
    assert offers.discounted("40.00", PERCENT) == Decimal("32.00")
    assert offers.discounted("40.00", None) == Decimal("40.00")
    assert offers.discounted(None, PERCENT) is None


def test_the_buttons_apply_a_code_on_shopify_stores_only() -> None:
    url = "https://wrenfield.example/products/saddle-bag?variant=1"
    assert offers.checkout_url(url, PERCENT, source="shopify_json") == (
        "https://wrenfield.example/discount/AUTUMN%2020?redirect=/products/saddle-bag"
    )
    assert offers.checkout_url(url, PERCENT, source="jsonld") is None
    assert (
        offers.checkout_url(url, {**PERCENT, "checkout": "automatic"}, source="shopify_json")
        is None
    )
    assert offers.checkout_url("not a url", PERCENT, source="shopify_json") is None


def test_the_brief_names_the_deal_and_nothing_else() -> None:
    text = offers.brief(PERCENT, offers.page_prices("145", None, PERCENT), "USD", linked=True)
    assert text is not None
    assert "never invent another discount" in text
    assert "Price: $116.00 (was $145.00, 20% off)." in text
    assert "Discount code: AUTUMN 20 (the page's buttons apply it at checkout)." in text
    assert "Promo line: Autumn edit" in text and "Also part of the deal: Free strap" in text
    assert offers.brief(None, offers.page_prices("145", None, None), "USD", linked=False) is None


def test_a_price_the_store_wont_charge_is_flagged() -> None:
    bare = {**PERCENT, "checkout": "none", "code": None}
    warning = offers.checkout_warning(bare, offers.page_prices("145", None, bare), "USD")
    assert warning == (
        "Autumn shows $116.00, but it has no discount code and isn't applied automatically at "
        "checkout: the store will still charge $145.00."
    )
    for fine in (PERCENT, {**PERCENT, "checkout": "automatic"}, {**bare, "price_change": "none"}):
        assert offers.checkout_warning(fine, offers.page_prices("145", None, fine), "USD") is None


# ── Pages record their offer (through the API) ────────────────────────────────────────────


def _offer(build: dict[str, Any], **fields: Any) -> str:
    with transaction() as conn:
        row = conn.execute(
            """
            insert into offers (org_id, brand_id, name, price_change, price_value, checkout, code,
                                promo_text, details, archived_at)
            select org_id, brand_id, %(name)s, %(change)s, %(value)s, %(checkout)s, %(code)s,
                   %(promo)s, %(details)s, %(archived)s
            from builds where id = %(b)s
            returning id
            """,
            {
                "b": build["id"], "name": fields.get("name", "Autumn"),
                "change": fields.get("price_change", "percent"),
                "value": fields.get("price_value", 20), "checkout": fields.get("checkout", "code"),
                "code": fields.get("code", "SAVE20"), "promo": fields.get("promo_text", "Autumn"),
                "details": fields.get("details"), "archived": fields.get("archived_at"),
            },
        ).fetchone()  # fmt: skip
    assert row is not None
    return str(row["id"])


def _new_page(client: TestClient, user: DbUser, build: dict[str, Any], offer_id: str) -> Any:
    with transaction() as conn:
        row = conn.execute(
            """
            select b.brand_id, b.product_id,
                   (select id from templates where org_id is null and status = 'active'
                      and type <> 'ranking' and deleted_at is null
                    order by slug limit 1) as template_id
            from builds b where b.id = %(b)s
            """,
            {"b": build["id"]},
        ).fetchone()
        assert row is not None
        conn.execute(
            "update brands set next_build_number = 10 where id = %(b)s", {"b": row["brand_id"]}
        )
    return client.post(
        "/builds",
        json={
            "org_id": build["org_id"], "template_id": str(row["template_id"]),
            "brand_id": str(row["brand_id"]), "product_id": str(row["product_id"]),
            "offer_id": offer_id,
        },
        headers=bearer(user),
    )  # fmt: skip


@needs_db
def test_a_new_page_records_the_offer_it_was_built_with(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    offer_id = _offer(finished, details="Free strap")
    response = _new_page(client, user, finished, offer_id)
    assert response.status_code == 201, response.text
    with transaction() as conn:
        page = conn.execute(
            "select offer_id, offer from builds where id = %(b)s",
            {"b": response.json()["build"]["id"]},
        ).fetchone()
        # Editing the offer afterwards doesn't change what the page recorded.
        conn.execute("update offers set name = 'Renamed' where id = %(o)s", {"o": offer_id})
    assert page is not None and str(page["offer_id"]) == offer_id
    assert page["offer"] == {
        "id": offer_id, "name": "Autumn", "price_change": "percent", "price_value": "20.00",
        "checkout": "code", "code": "SAVE20", "promo_text": "Autumn", "details": "Free strap",
    }  # fmt: skip


@needs_db
def test_an_archived_or_unknown_offer_is_refused(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    archived = _offer(finished, archived_at="2026-11-01")
    for offer_id in (archived, str(uuid.uuid4())):
        refused = _new_page(client, user, finished, offer_id)
        assert refused.status_code == 404
        assert refused.json()["detail"] == "That template, brand, product or offer isn't available."


@needs_db
def test_a_copy_keeps_its_originals_offer(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    offer_id = _offer(finished)
    snapshot = {"id": offer_id, "name": "Autumn", "price_change": "percent"}
    with transaction() as conn:
        conn.execute(
            "update builds set offer_id = %(o)s, offer = %(s)s::jsonb where id = %(b)s",
            {"o": offer_id, "s": json.dumps(snapshot), "b": finished["id"]},
        )
        conn.execute(
            "update brands set next_build_number = 2 where id = "
            "(select brand_id from builds where id = %(b)s)",
            {"b": finished["id"]},
        )
    copy = client.post(
        f"/builds/{finished['id']}/duplicate",
        json={"org_id": finished["org_id"]},
        headers=bearer(user),
    ).json()
    with transaction() as conn:
        row = conn.execute(
            "select offer_id, offer from builds where id = %(b)s", {"b": copy["id"]}
        ).fetchone()
    assert row is not None and str(row["offer_id"]) == offer_id and row["offer"] == snapshot
    storage.remove_folder("builds", f"{finished['org_id']}/{copy['id']}")


# ── Changing a page's offer (B7.3a): facts, mentions, slots ─────────────────────────────────


PRODUCT = {
    "price": "145.00", "sale_price": None, "currency": "USD", "pull_source": "shopify_json",
    "url": "https://fernway.example/products/market-tote",
    "variants": [{"name": "Tan", "price": "145.00"}, {"name": "Black", "price": "150.00"}],
}  # fmt: skip
OLD = {
    "name": "Autumn",
    "price_change": "percent",
    "price_value": "20",
    "checkout": "code",
    "code": "AUTUMN20",
    "promo_text": "Autumn edit: 20% off this week",
    "details": "Free shipping on every order, and a free leather strap. Ends Sunday.",
}
NEW = {"name": "Ten off", "price_change": "amount", "price_value": "10", "checkout": "automatic",
       "code": None, "promo_text": "Ten dollars off, this week only", "details": None}  # fmt: skip

PAGE = """
<section data-lp-section="bar">
  <p data-lp-promo>Autumn edit: <span data-lp-sale-percent>20% off</span></p>
</section>
<section data-lp-section="hero" data-lp-sale-only><h1>Save 20% on the Market Tote</h1></section>
<section data-lp-section="body">
  <p>I carried it for a month. At $116 it's the best bag I own.</p>
  <p>It holds a laptop, groceries and a water bottle.</p>
  <blockquote>"Used code AUTUMN20 and the strap came free!" — Dana</blockquote>
  <p>Order before Sunday to get free shipping.</p>
  <p>Our summer sale is long gone, but quality stays.</p>
  <p>Price <span data-lp-price>$116.00</span> <s data-lp-compare-price>$145.00</s></p>
  <ul>
    <li><span data-lp-variant-name>Tan</span> <span data-lp-variant-price>$116.00</span></li>
    <li><span data-lp-variant-name>Black</span> <span data-lp-variant-price>$120.00</span></li>
  </ul>
  <a data-lp-cta href="https://fernway.example/discount/AUTUMN20?redirect=/products/tote">
    Get 20% off</a>
  <div data-lp-sale-only data-lp-hidden style="display:none !important"><p>Hidden by hand</p></div>
</section>
"""


def test_every_mention_of_the_old_offer_is_found_wherever_it_is() -> None:
    old = offers.facts(OLD, PRODUCT)
    lines = {f.text: offers.mentions(f.text, old) for f in dump(PAGE) if not f.locked}
    found = {text for text, hits in lines.items() if hits}
    assert "Save 20% on the Market Tote" in found  # a heading
    assert "Get 20% off" in found  # a button
    assert any("AUTUMN20" in text for text in found)  # a review quote
    assert "I carried it for a month. At $116 it's the best bag I own." in found  # in a sentence
    assert "Order before Sunday to get free shipping." in found  # the details' deadline
    assert "It holds a laptop, groceries and a water bottle." not in found
    # A deal that isn't this offer is only a hint to look at.
    summer = "Our summer sale is long gone, but quality stays."
    assert summer not in found and offers.deal_hint(summer)


def test_leftovers_and_invented_deals_are_caught() -> None:
    old, new = offers.facts(OLD, PRODUCT), offers.facts(NEW, PRODUCT)
    assert offers.leftovers("Now $135, code AUTUMN20 still works", old, new) == ["AUTUMN20"]
    assert offers.leftovers("Now $135.00, ten off", old, new) == []
    before = "At $116 it's the best bag I own."
    assert offers.invented("At $135.00 it's the best bag I own.", before, new) == []
    assert offers.invented("Save 25% at $99.00 today", before, new) == ["25%", "$99.00"]


def test_the_data_slots_follow_the_new_offer_both_ways() -> None:
    html, stats = offers.apply_to_page(PAGE, PRODUCT, NEW)
    soup = parse(html)
    assert {t.get_text() for t in soup.select("[data-lp-price]")} == {"$135.00"}
    assert soup.select_one("[data-lp-compare-price]").get_text() == "$145.00"  # type: ignore[union-attr]
    assert soup.select_one("[data-lp-promo]").get_text() == "Ten dollars off, this week only"  # type: ignore[union-attr]
    assert [t.get_text() for t in soup.select("[data-lp-variant-price]")] == ["$135.00", "$140.00"]
    assert soup.select_one("a[data-lp-cta]")["href"] == PRODUCT["url"]  # type: ignore[index]
    assert stats == {"prices": 1, "badges": 1, "options": 2, "links": 1}  # $10 off: a real 7%
    # No discount at all: the sale parts hide (marked as the offer's), the price is the store's.
    bare, _ = offers.apply_to_page(PAGE, PRODUCT, None)
    soup = parse(bare)
    hero = soup.select_one('[data-lp-section="hero"]')
    assert hero is not None and hero.has_attr("data-lp-offer-hidden")
    assert soup.select_one("[data-lp-compare-price]").has_attr("data-lp-hidden")  # type: ignore[union-attr]
    # And back: the offer's own hiding comes off; the part hidden by hand stays hidden.
    again, _ = offers.apply_to_page(bare, PRODUCT, OLD)
    soup = parse(again)
    hero = soup.select_one('[data-lp-section="hero"]')
    assert hero is not None and not hero.has_attr("data-lp-hidden")
    text = soup.find(string="Hidden by hand")
    by_hand = text.parent.parent if text is not None and text.parent is not None else None
    assert by_hand is not None
    assert by_hand.has_attr("data-lp-hidden") and not by_hand.has_attr("data-lp-offer-hidden")
    assert soup.select_one("a[data-lp-cta]")["href"] == (  # type: ignore[index]
        "https://fernway.example/discount/AUTUMN20?redirect=/products/market-tote"
    )


def test_the_page_itself_says_what_its_deal_was() -> None:
    # A page built before offers: $125 with a 15% badge, whatever its recorded offer gives now.
    html = (
        "<p>Now <span data-lp-price>$125.00</span> <s data-lp-compare-price>$145.00</s> "
        "<b data-lp-sale-percent>15% off</b></p><p data-lp-promo>Oxblood: 15% off this week</p>"
        "<p>I paid $125 and it was worth it.</p><p>15 percent off made it easy.</p>"
    )
    shown = offers.page_facts(html)
    assert {"$125.00", "$125", "$145.00", "15%", "Oxblood: 15% off this week"} <= set(shown.exact)
    found = offers.merged(offers.facts(OLD, PRODUCT), shown)
    assert offers.mentions("I paid $125 and it was worth it.", found)
    assert offers.mentions("15 percent off made it easy.", found)


def test_a_rewrite_that_drops_more_than_the_deal_is_listed() -> None:
    old = offers.facts(OLD, PRODUCT)
    before = "Free shipping and a straightforward return policy mean there's no reason to wait."
    after = "Ten dollars off, applied at checkout, means there's no reason to wait."
    assert offers.dropped(before, after, old) == ["straightforward", "return", "policy"]
    kept = "Ten dollars off and a straightforward return policy mean there's no reason to wait."
    assert offers.dropped(before, kept, old) == []
    # A price followed by a comma is the price, not something new.
    new = offers.facts({"price_change": "amount", "price_value": "10"}, PRODUCT)
    assert (
        offers.invented("I paid $135, down from $145, gladly.", "I paid $116, down from $145.", new)
        == []
    )
