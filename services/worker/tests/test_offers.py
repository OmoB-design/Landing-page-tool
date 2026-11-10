"""A page's offer (B7.2b, D146): prices, the checkout link, the brief's OFFER block and the
checkout warning (engines/offers.py)."""

import json
import uuid
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient

from app.db import transaction
from app.engines import offers
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
