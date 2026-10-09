"""`product_pull` (BUILD_SPEC §7.4): a product from its page, saved to the brand. Steps:
1. read the store's product data (Shopify's public JSON, else its catalogue; selling plans from
   `/products/<handle>.js`); requests carry no Accept-Language, so prices stay in the store's
   own currency;
2. load the product page (its text feeds step 4; without store data the product comes from the
   page's JSON-LD, Open Graph tags or `<h1>`);
3. save the images into `assets` (deduplicated per org);
4. write the description, selling points, specs and selling context with one AI call;
5. save the product (a second pull of the same product updates it).

Connected-store (Admin API) pulls come with the Shopify connection (B1.5)."""

import json
from typing import Any
from uuid import UUID

import structlog
from pydantic import BaseModel, ConfigDict, Field

from app.config import get_settings
from app.db import transaction
from app.engines import product_extract
from app.fetch import ladder
from app.fetch.safety import check_public_url
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.models.product import ProductEnrichment, PulledProduct
from app.providers import anthropic, storage
from app.providers.ledger import node_context

log = structlog.get_logger()
TOTAL = 5
MAX_IMAGE_BYTES = 8_000_000
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_USPS = 6
MAX_SPECS = 10

SYSTEM = (
    "You write factual product details for a landing-page tool. Use only what the store data "
    "and the page show; never invent claims, awards, certifications, results, prices or "
    "medical benefits. Plain words, no em dashes. Write in the brand's language and voice. "
    "description: two to four sentences. usps: three to six selling points, each under twelve "
    "words. specs: up to eight label and value facts the page states (materials, size, "
    "ingredients, care, what's included); an empty list if there are none. selling_context: "
    "one or two sentences on who buys it and why, plus any offer shown (bundles, "
    "subscriptions, guarantees, free shipping)."
)


class ProductPullPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand_id: UUID
    url: str = Field(min_length=4, max_length=2000)


def dedupe_key(payload: ProductPullPayload) -> str:
    return f"product_pull:{payload.brand_id}:{normalise_url(payload.url)}"


def normalise_url(url: str) -> str:
    url = url.strip()
    return url if url.lower().startswith(("http://", "https://")) else f"https://{url}"


def run(ctx: JobContext) -> dict[str, Any]:
    payload = ProductPullPayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    brand = _brand(org_id, payload.brand_id)
    url = check_public_url(normalise_url(payload.url))
    warnings: list[str] = []

    handle = product_extract.handle_from_url(url)
    pulled = _from_store(url, handle) if handle else None
    ctx.progress(
        f"Read the store's data for {pulled.name}" if pulled else "No store data; reading the page",
        data={"step": 1, "total": TOTAL},
    )

    html: str | None = None
    page_url = url
    try:
        page = ladder.fetch_page(url)
        html, page_url = page.html, page.url
    except UserFacingError as exc:
        if pulled is None:
            raise
        warnings.append(
            f"Couldn't load the product page ({exc.message}), so the write-up uses the store's "
            "description only."
        )
    if pulled is None and html is not None:
        pulled = product_extract.from_html(html, page_url, brand_name=brand["name"])
    if pulled is None:
        raise UserFacingError(
            "Couldn't find a product on that page. Check it's a product page, or try the "
            "product's own link.",
            code="no_product",
        )
    if html is not None and not pulled.currency:
        from_page = product_extract.from_html(html, page_url, brand_name=brand["name"])
        pulled.currency = from_page.currency if from_page else None
    if pulled.pull_source == "h1":
        warnings.append(
            "The page had no product data, only its heading. Check it's a product page and "
            "fill in the details."
        )
    if pulled.price is None:
        warnings.append("No price found on the page. Add it on the product.")
    ctx.progress(
        f"Loaded the page: {pulled.name}" if html else f"Using the store's data for {pulled.name}",
        data={"step": 2, "total": TOTAL},
    )

    saved = _store_images(org_id, pulled, warnings)
    ctx.progress(
        f"Saved {saved} {'image' if saved == 1 else 'images'}", data={"step": 3, "total": TOTAL}
    )

    text = product_extract.page_text(html) if html else ""
    enrichment = _enrich(brand, pulled, text)
    ctx.progress("Wrote the product details", data={"step": 4, "total": TOTAL})

    product_id, created = _save(org_id, payload.brand_id, pulled, enrichment)
    ctx.progress(
        "Saved the product" if created else "Updated the product", data={"step": 5, "total": TOTAL}
    )
    return {
        "product_id": str(product_id),
        "brand_id": str(payload.brand_id),
        "name": pulled.name,
        "created": created,
        "pull_source": pulled.pull_source,
        "ai": "mock" if get_settings().lp_mock_llm else "live",
        "warnings": warnings,
    }


def _brand(org_id: UUID, brand_id: UUID) -> dict[str, Any]:
    with transaction() as conn:
        brand = conn.execute(
            """
            select id, name, positioning, audience, voice, language from brands
            where id = %(id)s and org_id = %(org)s and deleted_at is null
            """,
            {"id": brand_id, "org": org_id},
        ).fetchone()
    if brand is None:
        raise UserFacingError("That brand no longer exists.", code="brand_missing")
    return dict(brand)


def _json(url: str) -> Any | None:
    """A store JSON endpoint, or None if it's missing, blocked or not JSON."""
    try:
        body, _ = ladder.fetch_bytes(url, max_bytes=get_settings().lp_fetch_max_bytes)
        return json.loads(body)
    except (ladder.FetchError, ValueError) as exc:
        log.info("store json unavailable", url=url, error=str(exc))
        return None


def _from_store(url: str, handle: str) -> PulledProduct | None:
    base = product_extract.store_base(url)
    data = _json(f"{base}/products/{handle}.json")
    product = data.get("product") if isinstance(data, dict) else None
    if not isinstance(product, dict):
        catalogue = _json(f"{base}/products.json?limit=250")
        products = catalogue.get("products") if isinstance(catalogue, dict) else None
        product = product_extract.match_catalogue(products, handle) if products else None
    if not isinstance(product, dict) or not product.get("title"):
        return None
    js = _json(f"{base}/products/{product.get('handle') or handle}.js")
    return product_extract.from_shopify(product, js if isinstance(js, dict) else None, url)


def _store_images(org_id: UUID, pulled: PulledProduct, warnings: list[str]) -> int:
    stored: dict[str, UUID] = {}
    failed = 0
    for image in pulled.images:
        try:
            data, content_type = ladder.fetch_bytes(
                product_extract.image_download_url(image.source_url), max_bytes=MAX_IMAGE_BYTES
            )
        except UserFacingError as exc:
            log.info("product image download failed", url=image.source_url, error=exc.message)
            failed += 1
            continue
        if content_type not in IMAGE_TYPES:
            failed += 1
            continue
        asset = storage.store_asset(org_id, data, content_type, source_url=image.source_url)
        image.asset_id = asset.id
        stored[image.source_url] = asset.id
    for variant in pulled.variants:
        if variant.image_source_url in stored:
            variant.image_asset_id = stored[variant.image_source_url]
    if failed:
        warnings.append(f"{failed} {'image' if failed == 1 else 'images'} couldn't be downloaded.")
    return len(stored)


def _enrich(brand: dict[str, Any], pulled: PulledProduct, page_text: str) -> ProductEnrichment:
    digest = {
        "brand": {
            "name": brand["name"],
            "positioning": brand["positioning"],
            "audience": brand["audience"],
            "voice": brand["voice"],
            "language": brand["language"],
        },
        "product": {
            "name": pulled.name,
            "vendor": pulled.vendor,
            "type": pulled.product_type,
            "currency": pulled.currency,
            "price": str(pulled.price) if pulled.price is not None else None,
            "sale_price": str(pulled.sale_price) if pulled.sale_price is not None else None,
            "variants": [variant.name for variant in pulled.variants[:20]],
            "pricing": [line.label for line in pulled.pricing_lines[:10]],
            "store_description": (pulled.description or "")[:3000],
        },
        "page_text": page_text,
    }
    with node_context("product_enrich"):
        result = anthropic.generate(
            role="analysis",
            ledger_kind="analysis",
            system=SYSTEM,
            prompt="Product data (JSON):\n" + json.dumps(digest, ensure_ascii=False),
            max_tokens=2000,
            effort="medium",
            json_schema=anthropic.strict_schema(ProductEnrichment),
            mock_text=json.dumps(_mock_enrichment(pulled)),
        )
    enrichment = ProductEnrichment.model_validate(result.json())
    enrichment.usps = [usp.strip() for usp in enrichment.usps if usp.strip()][:MAX_USPS]
    enrichment.specs = [s for s in enrichment.specs if s.label.strip() and s.value.strip()][
        :MAX_SPECS
    ]
    return enrichment


def _mock_enrichment(pulled: PulledProduct) -> dict[str, Any]:
    """Mock mode: the store's own description, clearly marked placeholders for the rest."""
    return {
        "description": pulled.description or f"(mock) {pulled.name}.",
        "usps": ["(mock) Written by the AI pass when mock mode is off."],
        "specs": [],
        "selling_context": "(mock) Written by the AI pass when mock mode is off.",
    }


def _save(
    org_id: UUID, brand_id: UUID, pulled: PulledProduct, enrichment: ProductEnrichment
) -> tuple[UUID, bool]:
    def as_json(items: list[Any]) -> str:
        return json.dumps(
            [
                item.model_dump(mode="json") if isinstance(item, BaseModel) else item
                for item in items
            ]
        )

    with transaction() as conn:
        row = conn.execute(
            """
            insert into products (
              org_id, brand_id, handle, name, url, currency, price, sale_price, description,
              specs, usps, images, variants, pricing_lines, selling_context, pulled_at,
              pull_source
            ) values (
              %(org)s, %(brand)s, %(handle)s, %(name)s, %(url)s, %(currency)s, %(price)s,
              %(sale_price)s, %(description)s, %(specs)s::jsonb, %(usps)s::jsonb,
              %(images)s::jsonb, %(variants)s::jsonb, %(pricing_lines)s::jsonb,
              %(selling_context)s, now(), %(source)s
            )
            on conflict (brand_id, handle) do update set
              name = excluded.name, url = excluded.url, currency = excluded.currency,
              price = excluded.price, sale_price = excluded.sale_price,
              description = excluded.description, specs = excluded.specs,
              usps = excluded.usps, images = excluded.images, variants = excluded.variants,
              pricing_lines = excluded.pricing_lines,
              selling_context = excluded.selling_context, pulled_at = now(),
              pull_source = excluded.pull_source, deleted_at = null
            where products.org_id = excluded.org_id
            returning id, (xmax = 0) as created
            """,
            {
                "org": org_id,
                "brand": brand_id,
                "handle": pulled.handle[:200],
                "name": pulled.name[:200],
                "url": pulled.url,
                "currency": pulled.currency,
                "price": pulled.price,
                "sale_price": pulled.sale_price,
                "description": enrichment.description or pulled.description,
                "specs": as_json(enrichment.specs),
                "usps": as_json(enrichment.usps),
                "images": as_json(pulled.images),
                "variants": as_json(pulled.variants),
                "pricing_lines": as_json(pulled.pricing_lines),
                "selling_context": enrichment.selling_context or None,
                "source": pulled.pull_source,
            },
        ).fetchone()
    if row is None:
        raise UserFacingError("Couldn't save the product.", code="save_failed")
    return row["id"], bool(row["created"])
