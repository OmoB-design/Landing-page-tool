"""Product data from a store or a product page (BUILD_SPEC §7.4). Pure: JSON and HTML in,
`PulledProduct` out; the `product_pull` job does the fetching.

Sources, best first: Shopify's public product JSON (`/products/<handle>.json`, plus selling
plans from `/products/<handle>.js`), the store's catalogue (`/products.json`) matched by handle,
then the page itself: JSON-LD `Product`, Open Graph tags, and finally the `<h1>`.
"""

import difflib
import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup, Tag

from app.models.product import (
    PricingLine,
    ProductImage,
    ProductVariant,
    PulledProduct,
    PullSource,
)

MAX_IMAGES = 8
MAX_VARIANTS = 100
TEXT_CHARS = 6000
PRODUCT_PATH = re.compile(r"/products/([^/?#]+)")
CATALOGUE_CUTOFF = 0.75
SHOPIFY_IMAGE_WIDTH = 2048
# Between a page title and the site name: | - : · and the en and em dashes.
SEPARATORS = "[|\\-:\u00b7\u2013\u2014]"


def handle_from_url(url: str) -> str | None:
    """The Shopify product handle in a URL (`/products/<handle>`, also under `/collections/…`)."""
    match = PRODUCT_PATH.search(urlsplit(url).path)
    return match.group(1).lower() if match else None


def store_base(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:80] or "product"


def handle_for_page(url: str, name: str) -> str:
    """A handle for a non-Shopify page: the last path segment, else the product name."""
    segments = [s for s in urlsplit(url).path.split("/") if s]
    last = re.sub(r"\.(html?|php|aspx?)$", "", segments[-1]) if segments else ""
    return slugify(last) if last else slugify(name)


def money(value: Any, *, cents: bool = False) -> Decimal | None:
    """A price from a string or number ("21.00", 21, "") or, with `cents`, from Shopify's
    integer cents in `.js` responses."""
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        amount = Decimal(str(value).replace(",", "").strip())
    except InvalidOperation:
        return None
    if amount < 0:
        return None
    return (amount / 100 if cents else amount).quantize(Decimal("0.01"))


def regular_and_sale(
    price: Decimal | None, compare_at: Decimal | None
) -> tuple[Decimal | None, Decimal | None]:
    """(regular price, sale price): a compare-at price above the price means it's on sale."""
    if price is not None and compare_at is not None and compare_at > price:
        return compare_at, price
    return price, None


def html_to_text(html: str | None) -> str:
    if not html:
        return ""
    soup = BeautifulSoup(html, "lxml")
    for junk in soup(["script", "style", "noscript", "template", "svg", "iframe"]):
        junk.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()


def page_text(html: str, limit: int = TEXT_CHARS) -> str:
    """The readable product copy on a page (headings, paragraphs, list items), without the
    site's header, footer and navigation, for the enrichment pass."""
    soup = BeautifulSoup(html, "lxml")
    for junk in soup(
        ["script", "style", "noscript", "template", "svg", "iframe", "header", "footer", "nav"]
    ):
        junk.decompose()
    blocks: list[str] = []
    seen: set[str] = set()
    for el in soup.find_all(["h1", "h2", "h3", "h4", "p", "li", "td", "th", "summary"]):
        text = re.sub(r"\s+", " ", el.get_text(" ", strip=True))
        if len(text) >= 3 and text not in seen:
            seen.add(text)
            blocks.append(text)
    return " · ".join(blocks)[:limit]


def image_download_url(src: str) -> str:
    """Shopify's CDN can resize: ask for at most 2048 px wide so a 6 MB PNG isn't stored."""
    parts = urlsplit(src)
    if parts.netloc != "cdn.shopify.com" and "/cdn/shop/" not in parts.path:
        return src
    query = dict(parse_qsl(parts.query))
    query.setdefault("width", str(SHOPIFY_IMAGE_WIDTH))
    return urlunsplit(parts._replace(query=urlencode(query)))


def _absolute(url: str, src: str) -> str:
    return urljoin(url, src.strip()) if src else ""


# ── Shopify ──────────────────────────────────────────────────────────────────


def from_shopify(product: dict[str, Any], js: dict[str, Any] | None, url: str) -> PulledProduct:
    """From `/products/<handle>.json` (`product`) and, if available, `/products/<handle>.js`."""
    handle = str(product.get("handle") or handle_from_url(url) or slugify(product["title"]))
    base = store_base(url)
    image_by_id: dict[Any, str] = {}
    images: list[ProductImage] = []
    for image in product.get("images") or []:
        src = _absolute(url, str(image.get("src") or ""))
        if not src:
            continue
        image_by_id[image.get("id")] = src
        if len(images) < MAX_IMAGES:
            images.append(ProductImage(source_url=src, alt=image.get("alt") or None))

    option_names = [
        str(o.get("name") or f"Option {i + 1}") for i, o in enumerate(product.get("options") or [])
    ]
    js_variants = {v.get("id"): v for v in (js or {}).get("variants") or []}
    variants: list[ProductVariant] = []
    for variant in (product.get("variants") or [])[:MAX_VARIANTS]:
        options = {
            name: str(variant[f"option{i + 1}"])
            for i, name in enumerate(option_names[:3])
            if variant.get(f"option{i + 1}") not in (None, "")
        }
        js_variant = js_variants.get(variant.get("id"), {})
        variants.append(
            ProductVariant(
                name=str(variant.get("title") or " / ".join(options.values()) or "Default"),
                options=options,
                price=money(variant.get("price")),
                compare_at_price=money(variant.get("compare_at_price")),
                available=js_variant.get("available"),
                image_source_url=image_by_id.get(variant.get("image_id")),
            )
        )
    if len(variants) == 1 and variants[0].name == "Default Title":
        variants[0].name = "Default"
        variants[0].options = {}

    first = variants[0] if variants else None
    price, sale_price = regular_and_sale(
        first.price if first else None, first.compare_at_price if first else None
    )
    currency = next(
        (
            str(v["price_currency"])
            for v in product.get("variants") or []
            if v.get("price_currency")
        ),
        None,
    )
    return PulledProduct(
        handle=handle,
        name=str(product.get("title") or handle).strip(),
        url=f"{base}/products/{handle}",
        vendor=product.get("vendor") or None,
        product_type=product.get("product_type") or None,
        currency=currency,
        price=price,
        sale_price=sale_price,
        description=html_to_text(product.get("body_html")) or None,
        images=images,
        variants=variants if len(variants) > 1 or (first and first.options) else [],
        pricing_lines=selling_plans(js) if js else [],
        pull_source="shopify_json",
    )


def selling_plans(js: dict[str, Any]) -> list[PricingLine]:
    """Subscriptions and other selling plans (`/products/<handle>.js`), priced for the first
    variant: from its allocations when Shopify lists them, else from the plan's adjustment."""
    groups = js.get("selling_plan_groups") or []
    if not groups:
        return []
    plans: dict[Any, tuple[str, dict[str, Any]]] = {}
    for group in groups:
        for plan in group.get("selling_plans") or []:
            plans[plan.get("id")] = (str(group.get("name") or ""), plan)
    variants = js.get("variants") or []
    first = variants[0] if variants else {}
    base_price = money(first.get("price"), cents=True)
    lines: list[PricingLine] = []
    seen: set[str] = set()

    def add(
        group: str, plan: dict[str, Any], price: Decimal | None, compare: Decimal | None
    ) -> None:
        name = str(plan.get("name") or "").strip()
        label = name if not group or group == name else f"{group} · {name}"
        if label and label not in seen:
            seen.add(label)
            lines.append(
                PricingLine(label=label, group=group or None, price=price, compare_at_price=compare)
            )

    allocations = first.get("selling_plan_allocations") or []
    for allocation in allocations:
        found = plans.get(allocation.get("selling_plan_id"))
        if found:
            add(
                found[0], found[1],
                money(allocation.get("price"), cents=True),
                money(allocation.get("compare_at_price"), cents=True) or base_price,
            )  # fmt: skip
    if not allocations:
        for group_name, plan in plans.values():
            add(group_name, plan, _adjusted(base_price, plan), base_price)
    return lines


def _adjusted(price: Decimal | None, plan: dict[str, Any]) -> Decimal | None:
    adjustments = plan.get("price_adjustments") or []
    if price is None or not adjustments:
        return price
    adjustment = adjustments[0]
    value = money(adjustment.get("value"))
    kind = adjustment.get("value_type")
    if value is None:
        return price
    if kind == "percentage":
        return (price * (100 - value) / 100).quantize(Decimal("0.01"))
    if kind == "fixed_amount":
        return max(price - value / 100, Decimal(0)).quantize(Decimal("0.01"))
    if kind == "price":
        return (value / 100).quantize(Decimal("0.01"))
    return price


def match_catalogue(products: list[dict[str, Any]], handle: str) -> dict[str, Any] | None:
    """The catalogue (`/products.json`) entry for a handle: exact, else the closest handle or
    title (handles change when products are renamed; old links still carry the old one)."""
    by_handle = {str(p.get("handle", "")).lower(): p for p in products if p.get("handle")}
    if handle in by_handle:
        return by_handle[handle]
    close = difflib.get_close_matches(handle, list(by_handle), n=1, cutoff=CATALOGUE_CUTOFF)
    if close:
        return by_handle[close[0]]
    by_title = {slugify(str(p.get("title", ""))): p for p in products if p.get("title")}
    close = difflib.get_close_matches(handle, list(by_title), n=1, cutoff=CATALOGUE_CUTOFF)
    return by_title[close[0]] if close else None


# ── The page: JSON-LD, Open Graph, <h1> ──────────────────────────────────────


def _meta(soup: BeautifulSoup, *names: str) -> str | None:
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if isinstance(tag, Tag):
            content = tag.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
    return None


def _jsonld_nodes(soup: BeautifulSoup) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    def walk(value: Any) -> None:
        if isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, dict):
            nodes.append(value)
            walk(value.get("@graph"))

    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.get_text().strip()
        raw = re.sub(r"^\s*(<!--|//\s*<!\[CDATA\[)|(-->|//\s*\]\]>)\s*$", "", raw)
        try:
            walk(json.loads(raw))
        except ValueError:
            continue
    return nodes


def _types(node: dict[str, Any]) -> set[str]:
    kind = node.get("@type")
    return {str(k) for k in kind} if isinstance(kind, list) else {str(kind)}


def _images(value: Any, url: str) -> list[str]:
    found: list[str] = []
    for item in value if isinstance(value, list) else [value]:
        src = item.get("url") or item.get("contentUrl") if isinstance(item, dict) else item
        if isinstance(src, str) and src.strip() and not src.startswith("data:"):
            absolute = _absolute(url, src)
            if absolute not in found:
                found.append(absolute)
    return found


def _offers(value: Any) -> list[dict[str, Any]]:
    offers: list[dict[str, Any]] = []
    for item in value if isinstance(value, list) else [value]:
        if not isinstance(item, dict):
            continue
        if "AggregateOffer" in _types(item) and item.get("offers"):
            offers.extend(_offers(item["offers"]))
        elif "AggregateOffer" in _types(item):
            offers.append({**item, "price": item.get("lowPrice") or item.get("price")})
        else:
            offers.append(item)
    return offers


def _offer_name(offer: dict[str, Any], product_name: str) -> str:
    """A variant name for an offer: its own name, else the option values in its URL (Shopify
    themes link each offer to `?Size=Jumbo`), else its SKU."""
    name = offer.get("name")
    if isinstance(name, str) and name.strip() and name.strip() != product_name:
        return name.strip()
    query = parse_qsl(urlsplit(str(offer.get("url") or "")).query)
    values = [value for key, value in query if key.lower() not in ("variant", "currency")]
    if values:
        return " / ".join(values)
    return str(offer.get("sku") or "Option")


def _from_jsonld(soup: BeautifulSoup, url: str) -> PulledProduct | None:
    product = next(
        (
            n for n in _jsonld_nodes(soup)
            if _types(n) & {"Product", "ProductGroup"} and isinstance(n.get("name"), str)
        ),
        None,
    )  # fmt: skip
    if product is None:
        return None
    name = str(product["name"]).strip()
    offers = _offers(product.get("offers"))
    for variant in product.get("hasVariant") or []:
        if isinstance(variant, dict):
            for offer in _offers(variant.get("offers")):
                offers.append({**offer, "name": offer.get("name") or variant.get("name")})
    first = offers[0] if offers else {}
    currency = next((str(o["priceCurrency"]) for o in offers if o.get("priceCurrency")), None)
    variants = [
        ProductVariant(
            name=_offer_name(offer, name),
            price=money(offer.get("price")),
            available=(
                str(offer.get("availability", "")).rsplit("/", 1)[-1] == "InStock"
                if offer.get("availability") else None
            ),
        )
        for offer in offers[:MAX_VARIANTS]
    ]  # fmt: skip
    brand = product.get("brand")
    vendor = (
        brand.get("name") if isinstance(brand, dict) else brand if isinstance(brand, str) else None
    )
    description = product.get("description")
    return PulledProduct(
        handle=handle_from_url(url) or handle_for_page(url, name),
        name=name,
        url=url,
        vendor=vendor or None,
        currency=currency,
        price=money(first.get("price")),
        description=html_to_text(description) if isinstance(description, str) else None,
        images=[ProductImage(source_url=src) for src in _images(product.get("image"), url)],
        variants=variants if len(variants) > 1 else [],
        pull_source="jsonld",
    )


def _strip_site(title: str, names: list[str]) -> str:
    """'Topicals | Faded Serum' or 'Faded Serum - Topicals' → 'Faded Serum'."""
    for name in names:
        if not name:
            continue
        pattern = re.escape(name.strip())
        cleaned = re.sub(
            rf"^\s*{pattern}\s*{SEPARATORS}\s*|\s*{SEPARATORS}\s*{pattern}\s*$",
            "",
            title,
            flags=re.I,
        )
        if cleaned and cleaned != title:
            return cleaned.strip()
    return title.strip()


def from_html(html: str, url: str, *, brand_name: str | None = None) -> PulledProduct | None:
    """The product on a page, from JSON-LD, else Open Graph, else the first `<h1>`. Fields the
    chosen source lacks (images, currency, description) are filled from the others."""
    soup = BeautifulSoup(html, "lxml")
    site_names = [n for n in (_meta(soup, "og:site_name"), brand_name) if n]
    og_title = _meta(soup, "og:title", "twitter:title")
    og_images = _images(
        [_meta(soup, "og:image:secure_url"), _meta(soup, "og:image"), _meta(soup, "twitter:image")],
        url,
    )
    og_price = _meta(soup, "product:price:amount", "og:price:amount")
    og_currency = _meta(soup, "product:price:currency", "og:price:currency")
    og_description = _meta(soup, "og:description", "description")
    h1 = soup.find("h1")
    h1_text = re.sub(r"\s+", " ", h1.get_text(" ", strip=True)) if isinstance(h1, Tag) else ""

    pulled = _from_jsonld(soup, url)
    source: PullSource
    if (
        pulled is None
        and og_title
        and (og_price or (_meta(soup, "og:type") or "").startswith("product"))
    ):
        name = _strip_site(og_title, site_names)
        pulled = PulledProduct(
            handle=handle_from_url(url) or handle_for_page(url, name),
            name=name, url=url, price=money(og_price), pull_source="og",
        )  # fmt: skip
    if pulled is None and h1_text:
        pulled = PulledProduct(
            handle=handle_from_url(url) or handle_for_page(url, h1_text),
            name=h1_text[:200], url=url, pull_source="h1",
        )  # fmt: skip
    if pulled is None:
        return None
    source = pulled.pull_source
    if not pulled.images:
        pulled.images = [ProductImage(source_url=src) for src in og_images]
    pulled.images = pulled.images[:MAX_IMAGES]
    pulled.currency = pulled.currency or og_currency or _page_currency(html)
    if pulled.price is None and source != "h1":
        pulled.price = money(og_price)
    if not pulled.description and og_description:
        pulled.description = og_description
    return pulled


def _page_currency(html: str) -> str | None:
    """Shopify themes set `Shopify.currency = {"active":"USD",…}` even without price tags."""
    match = re.search(r'Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"', html)
    return match.group(1) if match else None
