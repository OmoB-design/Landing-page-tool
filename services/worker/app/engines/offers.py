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

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any
from urllib.parse import quote, urlsplit

from bs4.element import Tag

from app.engines import visibility
from app.engines.html import parse, serialize, set_text
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


# ── Changing a page's offer (B7.3a) ──────────────────────────────────────────────────────────

_STOPWORDS = {
    "with", "every", "order", "orders", "from", "your", "this", "that", "only", "when", "over",
    "plus", "into", "each", "the", "and", "for", "you", "our", "all", "any", "get", "one",
}  # fmt: skip
_DAY_OR_MONTH = re.compile(
    r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tonight|tomorrow|january|"
    r"february|march|april|may|june|july|august|september|october|november|december|"
    r"black friday|cyber monday)\b",
    re.I,
)
_DEAL_WORDS = re.compile(
    r"\b(sale|deal|offer|discount|discounted|save|saving|savings|coupon|promo|code|% off|"
    r"percent off|free shipping|limited time|today only|ends)\b|\d+\s*%",
    re.I,
)
_PERCENT = re.compile(r"(\d{1,2}(?:\.\d+)?)\s*(?:%|percent\b)", re.I)
_MONEY = re.compile(r"[$€£¥₹]\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?!\d)")


@dataclass(frozen=True)
class Facts:
    """What text that names an offer contains: exact strings (its prices, percent, amount off,
    code, promo line) and, from its details, phrases told by their key words."""

    exact: tuple[str, ...]
    phrases: tuple[frozenset[str], ...]
    strong: tuple[str, ...]  # days, months and code-like words from the details


def _price_forms(amount: Decimal | None, currency: str | None) -> list[str]:
    if amount is None:
        return []
    full = format_price(amount, currency)
    forms = [full] if full else []
    if amount == amount.to_integral_value():
        whole = format_price(amount, currency)
        if whole and whole.endswith(".00"):
            forms.append(whole[:-3])
    return forms


def facts(offer: dict[str, Any] | None, product: dict[str, Any]) -> Facts:
    """The facts a page's words may state about its offer (`offer` None: the store's own price
    and sale)."""
    currency = product.get("currency")
    prices = page_prices(product.get("price"), product.get("sale_price"), offer)
    exact: list[str] = []
    if prices.regular is not None:  # a discount: "$116", "was $145", "20% off"
        exact += _price_forms(prices.now, currency) + _price_forms(prices.regular, currency)
        if prices.percent:
            exact += [f"{prices.percent}%", f"{prices.percent} %", f"{prices.percent} percent"]
    offer = offer or {}
    value = _decimal(offer.get("price_value"))
    if offer.get("price_change") == "percent" and value:
        whole = value.normalize()
        exact += [f"{whole}%", f"{whole} %", f"{whole} percent"]
    if offer.get("price_change") == "amount" and value:
        exact += _price_forms(value, currency)
    if offer.get("code"):
        exact.append(str(offer["code"]))
    if offer.get("promo_text"):
        exact.append(str(offer["promo_text"]))
    phrases: list[frozenset[str]] = []
    strong: list[str] = []
    for part in re.split(r"[.;,!\n]+|\band\b", str(offer.get("details") or ""), flags=re.I):
        words = {w for w in re.findall(r"[a-z]{4,}", part.lower()) if w not in _STOPWORDS}
        if words:
            phrases.append(frozenset(words))
        strong += [m.group(0) for m in _DAY_OR_MONTH.finditer(part)]
    return Facts(
        exact=tuple(dict.fromkeys(e for e in exact if e)),
        phrases=tuple(phrases),
        strong=tuple(dict.fromkeys(strong)),
    )


def page_facts(html: str) -> Facts:
    """The deal as the page shows it now, read from its data slots (the price, the struck-through
    price, the badges' percent, the promo line): what a page built before offers, or under other
    rules, states, whatever its recorded offer says."""
    soup = parse(html)
    exact: list[str] = []
    for tag in soup.select("[data-lp-price], [data-lp-sale-price], [data-lp-compare-price]"):
        said = tag.get_text(strip=True)
        if said:
            exact.append(said)
            if said.endswith(".00"):
                exact.append(said[:-3])
    for tag in soup.select("[data-lp-sale-percent]"):
        for number in re.findall(r"(\d{1,2})\s*%", tag.get_text()):
            exact += [f"{number}%", f"{number} %", f"{number} percent"]
    for tag in soup.select("[data-lp-promo]"):
        said = tag.get_text(" ", strip=True)
        if said:
            exact.append(said)
    return Facts(exact=tuple(dict.fromkeys(exact)), phrases=(), strong=())


def merged(*all_facts: Facts) -> Facts:
    """Facts from several places as one."""
    return Facts(
        exact=tuple(dict.fromkeys(e for f in all_facts for e in f.exact)),
        phrases=tuple(dict.fromkeys(p for f in all_facts for p in f.phrases)),
        strong=tuple(dict.fromkeys(s for f in all_facts for s in f.strong)),
    )


def mentions(text: str, found: Facts) -> list[str]:
    """Which of the offer's facts a line states (empty when it says nothing about the offer)."""
    lower = text.lower()
    hits = [e for e in found.exact if e.lower() in lower]
    hits += [s for s in found.strong if re.search(rf"\b{re.escape(s)}\b", text, re.I)]
    words = set(re.findall(r"[a-z]{4,}", lower))
    for phrase in found.phrases:
        shared = phrase & words
        if len(shared) >= min(2, len(phrase)):
            hits.append(" ".join(sorted(shared)))
    return hits


def deal_hint(text: str) -> bool:
    """Whether a line sounds like it's about a deal (a sale, a code, "% off"), for the lines the
    change didn't touch: listed for a look, never changed."""
    return bool(_DEAL_WORDS.search(text))


def leftovers(text: str, old: Facts, new: Facts) -> list[str]:
    """The old offer's exact facts a line still states that the new offer doesn't share (its old
    price, percent, code or promo line)."""
    keep = {e.lower() for e in new.exact}
    lower = text.lower()
    return [e for e in old.exact if e.lower() in lower and e.lower() not in keep]


def invented(text: str, before: str, new: Facts) -> list[str]:
    """Percents and prices a rewritten line states that are neither the new offer's nor in the line
    before the rewrite (so not the product's own facts)."""
    allowed = {e.lower() for e in new.exact} | {before.lower()}
    found: list[str] = []
    for match in [*_PERCENT.finditer(text), *_MONEY.finditer(text)]:
        said = match.group(0)
        if not any(said.lower() in a for a in allowed):
            found.append(said)
    return found


OFFER_HIDDEN = "data-lp-offer-hidden"


def show_for_offer(tag: Tag, shown: bool) -> None:
    """Hides a part the offer has no use for (a sale bar without a discount), marked as the offer's
    doing, or shows one the offer hid. A part the user hid stays hidden."""
    if shown:
        if tag.has_attr(OFFER_HIDDEN):
            visibility.set_hidden(tag, False)
            del tag[OFFER_HIDDEN]
    elif not visibility.is_hidden(tag):
        visibility.set_hidden(tag, True)
        tag[OFFER_HIDDEN] = ""


def _visible_text(tag: Tag) -> str:
    """The words of a part outside its hidden pieces."""
    return " ".join(
        str(node).strip()
        for node in tag.find_all(string=True)
        if str(node).strip()
        and not any(
            isinstance(parent, Tag) and visibility.is_hidden(parent) for parent in node.parents
        )
        and getattr(node.parent, "name", "") not in ("script", "style")
    )


def show_promo(promo: Tag, shown: bool) -> None:
    """A promo line built around a discount, with its bar (the section) when nothing else in it
    shows: hidden together without a discount, shown together again with one."""
    section = (
        promo
        if promo.has_attr("data-lp-section")
        else promo.find_parent(attrs={"data-lp-section": True})
    )
    show_for_offer(promo, shown)
    if isinstance(section, Tag) and section is not promo:
        if shown:
            show_for_offer(section, True)
        elif not _visible_text(section) and not section.find("img"):
            show_for_offer(section, False)


MAX_DROPPED_SHARE = 0.4  # a rewrite may lose at most this share of a line's other words


def _stem(word: str) -> str:
    """ "means" and "mean", "bags" and "bag" as one word."""
    return word[:-1] if len(word) > 4 and word.endswith("s") and not word.endswith("ss") else word


def _words(text: str) -> set[str]:
    return {_stem(w) for w in re.findall(r"[a-z']{4,}", text.lower()) if w not in _STOPWORDS}


def dropped(before: str, after: str, old: Facts) -> list[str]:
    """The words a rewrite dropped that weren't about the deal, when it dropped more than a few
    (it should change only the deal): listed for the person to check, never undone."""
    deal = {w for e in old.exact for w in _words(e)} | {w for p in old.phrases for w in p}
    deal |= {s.lower() for s in old.strong} | {"shipping", "free", "code", "checkout", "discount"}
    deal = {_stem(w) for w in deal}
    others = [w for w in re.findall(r"[a-z']{4,}", before.lower()) if w not in _STOPWORDS]
    others = [w for w in dict.fromkeys(others) if _stem(w) not in deal]
    kept = _words(after)
    lost = [w for w in others if _stem(w) not in kept]
    if not others or len(lost) / len(others) <= MAX_DROPPED_SHARE:
        return []
    return lost


def apply_to_page(
    html: str,
    product: dict[str, Any],
    offer: dict[str, Any] | None,
    *,
    brand_url: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """A page's data slots for an offer: the price and the struck-through price, the sale badges'
    percent, the parts a discount needs (shown with one, hidden without one, never removed), the
    promo line, the options' prices and the buttons' link."""
    currency = product.get("currency")
    prices = page_prices(product.get("price"), product.get("sale_price"), offer)
    soup = parse(html)
    stats: dict[str, Any] = {"prices": 0, "badges": 0, "options": 0, "links": 0}
    now = format_price(prices.now, currency)
    if now:
        for tag in soup.select("[data-lp-price], [data-lp-sale-price]"):
            if isinstance(tag, Tag):
                set_text(tag, now)
                stats["prices"] += 1
    regular = format_price(prices.regular, currency)
    for tag in soup.select("[data-lp-compare-price]"):
        if isinstance(tag, Tag):
            if regular:
                set_text(tag, regular)
            show_for_offer(tag, regular is not None)
    for tag in soup.select("[data-lp-sale-percent]"):
        if isinstance(tag, Tag):
            if prices.percent:
                original = tag.get_text()
                set_text(
                    tag,
                    re.sub(r"\d+\s*%", f"{prices.percent}%", original)
                    if "%" in original
                    else f"{prices.percent}%",
                )
                stats["badges"] += 1
            show_for_offer(tag, bool(prices.percent))
    for tag in soup.select("[data-lp-sale-only]"):
        if isinstance(tag, Tag):
            show_for_offer(tag, bool(prices.percent))
    promo = (offer or {}).get("promo_text")
    for tag in soup.select("[data-lp-promo]"):
        if not isinstance(tag, Tag):
            continue
        if promo:
            set_text(tag, str(promo))
            show_promo(tag, True)
        elif tag.select_one("[data-lp-sale-percent]") is not None:
            show_promo(tag, bool(prices.percent))
    variant_tags = [t for t in soup.select("[data-lp-variant-price]") if isinstance(t, Tag)]
    variants = [v for v in product.get("variants") or [] if isinstance(v, dict)]
    if variant_tags and len(variant_tags) <= len(variants):
        for tag, variant in zip(variant_tags, variants, strict=False):
            price = format_price(discounted(variant.get("price"), offer), currency)
            if price:
                set_text(tag, price)
                stats["options"] += 1
    link = (
        checkout_url(product.get("url"), offer, source=product.get("pull_source"))
        or product.get("url")
        or brand_url
    )
    if link:
        for tag in soup.select("[data-lp-cta]"):
            anchor = tag if isinstance(tag, Tag) and tag.name == "a" else None
            if anchor is None and isinstance(tag, Tag):
                found_anchor = tag.find("a")
                anchor = found_anchor if isinstance(found_anchor, Tag) else None
            if anchor is not None:
                anchor["href"] = link
                stats["links"] += 1
    return serialize(soup), stats
