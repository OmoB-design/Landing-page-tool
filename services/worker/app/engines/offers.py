"""A page's offer (B7.2b, D146). Pure.

What a page built with an offer shows: its prices (the offer's percent or amount taken off the
store's current price, as a discount code is at checkout, with the regular price struck through
and the real discount as the sale badges' percent), the link its buttons use when the customer
gets the deal with a code on a Shopify store (Shopify's discount link applies the code by itself),
the OFFER block of the copy brief (so the words mention this deal and never invent another), and
the warning when the page would show a price the store won't charge.

An offer is the build's record of it (`builds.offer`): name, price_change ("none", "percent",
"amount"), price_value, checkout ("none", "code", "automatic"), code, promo_text, details.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any
from urllib.parse import quote, urlsplit

from app.engines.money import format_price

CENT = Decimal("0.01")
SHOPIFY_SOURCE = "shopify_json"  # products.pull_source when read from a Shopify store


@dataclass(frozen=True)
class Prices:
    store: Decimal | None  # what the store charges now (its sale price, else its price)
    now: Decimal | None  # what the page says the customer pays
    regular: Decimal | None  # struck through beside it, only when `now` is less
    percent: int | None  # the discount from `regular` to `now`, in whole percent


def _decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return None


def discounted(amount: Any, offer: dict[str, Any] | None) -> Decimal | None:
    """An amount with the offer's percent or amount taken off (never below 0)."""
    value = _decimal(amount)
    if value is None or not offer:
        return value
    off = _decimal(offer.get("price_value"))
    if not off or off <= 0:
        return value
    if offer.get("price_change") == "percent" and off < 100:
        return (value * (Decimal(100) - off) / 100).quantize(CENT, ROUND_HALF_UP)
    if offer.get("price_change") == "amount":
        return max(value - off, Decimal(0)).quantize(CENT, ROUND_HALF_UP)
    return value


def page_prices(price: Any, sale_price: Any, offer: dict[str, Any] | None) -> Prices:
    """The page's prices: the offer taken off the store's current price; the regular price struck
    through whenever the customer pays less than it (the store's own sale counts too)."""
    regular = _decimal(price)
    store = _decimal(sale_price) if _decimal(sale_price) is not None else regular
    now = discounted(store, offer)
    if now is None:
        return Prices(store=None, now=None, regular=None, percent=None)
    top = max((p for p in (regular, store) if p is not None), default=None)
    if top is None or now >= top:
        return Prices(store=store, now=now, regular=None, percent=None)
    percent = int(((top - now) / top * 100).quantize(Decimal(1), ROUND_HALF_UP))
    return Prices(store=store, now=now, regular=top, percent=percent or None)


def checkout_url(
    product_url: str | None, offer: dict[str, Any] | None, *, source: Any
) -> str | None:
    """Shopify's discount link for the offer's code (`/discount/CODE?redirect=/products/…`), which
    applies the code at checkout, when the product was read from a Shopify store; None otherwise
    (the buttons keep the product's page)."""
    code = (offer or {}).get("code")
    if not code or (offer or {}).get("checkout") != "code" or source != SHOPIFY_SOURCE:
        return None
    parts = urlsplit(product_url or "")
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    redirect = quote(parts.path or "/", safe="/")
    return (
        f"{parts.scheme}://{parts.netloc}/discount/{quote(str(code), safe='')}?redirect={redirect}"
    )


def brief(
    offer: dict[str, Any] | None, prices: Prices, currency: str | None, *, linked: bool
) -> str | None:
    """The copy brief's OFFER block: the deal the page sells, in plain facts."""
    if not offer:
        return None
    lines = [
        f"The page sells this offer ({offer.get('name') or 'the offer'}). Mention only this "
        "deal: never invent another discount, gift, code or deadline."
    ]
    if prices.now is not None and prices.regular is not None:
        lines.append(
            f"Price: {format_price(prices.now, currency)} (was "
            f"{format_price(prices.regular, currency)}, {prices.percent}% off)."
        )
    elif prices.now is not None:
        lines.append(f"Price: {format_price(prices.now, currency)}.")
    if offer.get("checkout") == "code" and offer.get("code"):
        lines.append(
            f"Discount code: {offer['code']}"
            + (" (the page's buttons apply it at checkout)." if linked else ".")
        )
    elif offer.get("checkout") == "automatic" and offer.get("price_change") != "none":
        lines.append("The discount is applied automatically at checkout.")
    if offer.get("promo_text"):
        lines.append(f"Promo line: {offer['promo_text']}")
    if offer.get("details"):
        lines.append(f"Also part of the deal: {offer['details']}")
    return "\n".join(lines)


def checkout_warning(
    offer: dict[str, Any] | None, prices: Prices, currency: str | None
) -> str | None:
    """When the page shows the offer's price but nothing makes the store charge it (no code, not
    applied automatically): say what the store will charge instead."""
    if not offer or offer.get("price_change") == "none" or offer.get("checkout") != "none":
        return None
    if prices.now is None or prices.store is None or prices.now >= prices.store:
        return None
    return (
        f"{offer.get('name') or 'The offer'} shows {format_price(prices.now, currency)}, but it "
        "has no discount code and isn't applied automatically at checkout: the store will still "
        f"charge {format_price(prices.store, currency)}."
    )
