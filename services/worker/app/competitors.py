"""A Top 5 ranking build's competitors (BUILD_SPEC §8.7, D53, D102): each of the four product pages
runs the product pull (§7.4) plus its JSON-LD rating and reviews and one AI pass for what the
page claims, all four at once. Stored per build in `build_competitors`, never as brand products.

Ranks follow the order the user gave, closing up over any page that couldn't be read (so the
page never shows a gap). With neutral naming (the default) each competitor is "Brand B" to
"Brand E", every quoted claim and review has its own names replaced by that label, and no photo
or reviewer name is kept; with real names the page shows their product name and first photo.
"""

import contextvars
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import structlog
from psycopg.types.json import Jsonb

from app.db import transaction
from app.engines import product_extract
from app.engines.money import format_price
from app.engines.ranking import RankEntry, neutral_label, neutralise
from app.fetch import ladder
from app.fetch.safety import check_public_url
from app.jobs.errors import UserFacingError
from app.jobs.kinds.product_pull import IMAGE_TYPES, MAX_IMAGE_BYTES, normalise_url, read_product
from app.models.competitor import Competitor, CompetitorClaims, Naming
from app.models.product import ReviewSummary
from app.providers import anthropic, storage

log = structlog.get_logger()
MAX_CLAIMS = 6
CLAIM_CHARS = 200
# Hosts' first labels that aren't the brand's name (shop.brand.com).
SUBDOMAINS = {"www", "shop", "store", "us", "uk", "eu", "en", "m"}
# Second-level labels under a country code (brand.co.uk).
SECOND_LEVEL = {"co", "com", "org", "net", "ac"}

SYSTEM = (
    "You read a competitor's product page for a comparison page. Report only what the page "
    "itself says about its own product; never invent, judge, compare or add claims, results, "
    "awards or prices. Plain words, no em dashes. summary: one neutral sentence saying what the "
    "product is and who it's for. claims: up to six claims the page makes about the product "
    "(benefits, ingredients or materials, guarantees, offers), each quoted or closely "
    "paraphrased from the page and under twenty words; an empty list if it makes none."
)


@dataclass
class _Pulled:
    url: str
    error: str | None = None
    name: str | None = None
    vendor: str | None = None
    currency: str | None = None
    price: Any = None
    sale_price: Any = None
    summary: str | None = None
    claims: list[str] = field(default_factory=list)
    reviews: ReviewSummary = field(default_factory=ReviewSummary)
    image_asset_id: UUID | None = None
    image_url: str | None = None
    pull_source: str | None = None
    warnings: list[str] = field(default_factory=list)


def site_name(url: str) -> str | None:
    """The brand-like part of a page's host: "ritual" for www.ritual.com or ritual.co.uk."""
    host = (urlsplit(url).hostname or "").lower()
    parts = [p for p in host.split(".") if p]
    while len(parts) > 2 and parts[0] in SUBDOMAINS:
        parts = parts[1:]
    if len(parts) >= 3 and parts[-2] in SECOND_LEVEL:
        return parts[-3]
    return parts[-2] if len(parts) >= 2 else None


def _claims(name: str, vendor: str | None, description: str | None, text: str) -> CompetitorClaims:
    product = {"name": name, "vendor": vendor, "store_description": (description or "")[:3000]}
    digest = {"product": product, "page_text": text}
    result = anthropic.generate(
        role="analysis",
        ledger_kind="analysis",
        system=SYSTEM,
        prompt="Competitor product page (JSON):\n" + json.dumps(digest, ensure_ascii=False),
        max_tokens=1200,
        effort="low",
        json_schema=anthropic.strict_schema(CompetitorClaims),
        mock_text=json.dumps(
            {
                "summary": f"(mock) {name}.",
                "claims": ["(mock) A claim quoted from the page when mock mode is off."],
            }
        ),
    )
    claims = CompetitorClaims.model_validate(result.json())
    claims.claims = [" ".join(c.split())[:CLAIM_CHARS] for c in claims.claims if c.strip()][
        :MAX_CLAIMS
    ]
    return claims


def _first_image(org_id: UUID, sources: list[str]) -> tuple[UUID | None, str | None]:
    for source in sources[:3]:
        try:
            data, content_type = ladder.fetch_bytes(
                product_extract.image_download_url(source), max_bytes=MAX_IMAGE_BYTES
            )
        except UserFacingError as exc:
            log.info("competitor image download failed", url=source, error=exc.message)
            continue
        if content_type in IMAGE_TYPES:
            asset = storage.store_asset(org_id, data, content_type, source_url=source)
            return asset.id, asset.url
    return None, None


def _pull_one(org_id: UUID, raw_url: str, naming: Naming) -> _Pulled:
    """One competitor page. Never raises: a page that can't be read comes back with `error`."""
    url = normalise_url(raw_url)
    try:
        url = check_public_url(url)
        read = read_product(url, brand_name=None)
        pulled = read.pulled
        text = product_extract.page_text(read.html) if read.html else ""
        reviews = product_extract.reviews_from_html(read.html) if read.html else ReviewSummary()
        claims = _claims(pulled.name, pulled.vendor, pulled.description, text)
        asset_id = image_url = None
        if naming == "real":
            asset_id, image_url = _first_image(org_id, [i.source_url for i in pulled.images])
        warnings = list(read.warnings)
        if reviews.rating is None and not reviews.reviews:
            warnings.append("The page publishes no rating or reviews the page can quote.")
        return _Pulled(
            url=url,
            name=pulled.name,
            vendor=pulled.vendor,
            currency=pulled.currency,
            price=pulled.price,
            sale_price=pulled.sale_price,
            summary=claims.summary.strip() or None,
            claims=claims.claims,
            reviews=reviews,
            image_asset_id=asset_id,
            image_url=image_url,
            pull_source=pulled.pull_source,
            warnings=warnings,
        )
    except UserFacingError as exc:
        return _Pulled(url=url, error=exc.message)
    except Exception as exc:  # one bad page must not sink the other three
        log.warning("competitor pull failed", url=url, error=str(exc))
        return _Pulled(url=url, error="Couldn't read this page.")


def _competitor(item: _Pulled, rank: int, naming: Naming) -> Competitor:
    host = urlsplit(item.url).hostname or item.url
    label = neutral_label(rank) if naming == "neutral" else (item.name or host)
    if item.error:
        return Competitor(rank=rank, url=item.url, status="failed", error=item.error, label=label)
    names = [n for n in (item.name, item.vendor, site_name(item.url)) if n]

    def clean(text: str | None) -> str | None:
        if text is None:
            return None
        return neutralise(text, names, label) if naming == "neutral" else text

    reviews = [
        review.model_copy(
            update={
                "body": clean(review.body) or review.body,
                "title": clean(review.title),
                "author": review.author if naming == "real" else None,
            }
        )
        for review in item.reviews.reviews
    ]
    return Competitor(
        rank=rank,
        url=item.url,
        status="pulled",
        label=label,
        name=item.name,
        vendor=item.vendor,
        currency=item.currency,
        price=item.price,
        sale_price=item.sale_price,
        image_asset_id=item.image_asset_id,
        image_url=item.image_url,
        summary=clean(item.summary),
        claims=[clean(c) or c for c in item.claims],
        rating=item.reviews.rating,
        rating_best=item.reviews.best,
        rating_count=item.reviews.count,
        reviews=reviews,
        pull_source=item.pull_source,
        warnings=item.warnings,
    )


def pull(org_id: UUID, urls: list[str], naming: Naming) -> list[Competitor]:
    """All four competitors, read at once. Pages that were read take ranks #2 onwards in the
    order given; any that couldn't be read follow, marked failed."""
    with ThreadPoolExecutor(max_workers=len(urls) or 1) as pool:
        futures = [
            pool.submit(contextvars.copy_context().run, _pull_one, org_id, url, naming)
            for url in urls
        ]
        results = [future.result() for future in futures]
    ordered = [r for r in results if not r.error] + [r for r in results if r.error]
    return [_competitor(item, rank, naming) for rank, item in enumerate(ordered, start=2)]


def save(org_id: UUID, build_id: UUID, competitors: list[Competitor]) -> None:
    """Replaces the build's competitors (a re-run of the step pulls them again)."""
    with transaction() as conn:
        conn.execute(
            "delete from build_competitors where build_id = %(b)s and org_id = %(o)s",
            {"b": build_id, "o": org_id},
        )
        for c in competitors:
            conn.execute(
                """
                insert into build_competitors (
                  org_id, build_id, rank, url, status, error, label, name, vendor, currency,
                  price, sale_price, image_asset_id, summary, claims, rating, rating_best,
                  rating_count, reviews, pull_source, warnings
                ) values (
                  %(o)s, %(b)s, %(rank)s, %(url)s, %(status)s, %(error)s, %(label)s, %(name)s,
                  %(vendor)s, %(currency)s, %(price)s, %(sale_price)s, %(image)s, %(summary)s,
                  %(claims)s, %(rating)s, %(best)s, %(count)s, %(reviews)s, %(source)s,
                  %(warnings)s
                )
                """,
                {
                    "o": org_id, "b": build_id, "rank": c.rank, "url": c.url[:2000],
                    "status": c.status, "error": c.error, "label": c.label[:200],
                    "name": (c.name or None) and c.name[:200], "vendor": c.vendor,
                    "currency": c.currency, "price": c.price, "sale_price": c.sale_price,
                    "image": c.image_asset_id, "summary": c.summary,
                    "claims": Jsonb(c.claims), "rating": c.rating, "best": c.rating_best,
                    "count": c.rating_count,
                    "reviews": Jsonb([r.model_dump(mode="json") for r in c.reviews]),
                    "source": c.pull_source, "warnings": Jsonb(c.warnings),
                },
            )  # fmt: skip


def entry(c: Competitor) -> RankEntry:
    """What the page shows for a competitor that was read."""
    review = next((r for r in c.reviews if r.body), None)
    return RankEntry(
        rank=c.rank,
        name=c.label,
        price=format_price(c.sale_price if c.sale_price is not None else c.price, c.currency),
        summary=c.summary,
        rating=c.rating,
        best=c.rating_best,
        count=c.rating_count,
        claims=c.claims,
        quote=review.body if review else None,
        quote_author=review.author if review else None,
        image_url=c.image_url,
    )
