"""`product_briefing` (BUILD_SPEC §7.5): the wizard briefing for a product (four audiences plus
benefits, features and objections) from one AI call, cached in `product_strategy` (kind
`briefing`). Running it again refreshes the cache."""

import json
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.config import get_settings
from app.db import transaction
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.models.product import Briefing
from app.providers import anthropic
from app.providers.ledger import node_context

TOTAL = 2
AUDIENCES = 4
MAX_ITEMS = 6

SYSTEM = (
    "You are a direct-response strategist preparing a briefing for a landing page. From the "
    "brand and product facts, write exactly four distinct audiences who would buy this product "
    "(a name of two to five words, and one sentence on who they are and what they want), four "
    "to six benefits (outcomes for the buyer), four to six features (facts about the product) "
    "and four to six objections a buyer might have. Use only the facts given; never invent "
    "claims, results, prices or medical benefits. Plain words, no em dashes. Write in the "
    "brand's language."
)


class ProductBriefingPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: UUID


def dedupe_key(payload: ProductBriefingPayload) -> str:
    return f"product_briefing:{payload.product_id}"


def run(ctx: JobContext) -> dict[str, Any]:
    payload = ProductBriefingPayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    with transaction() as conn:
        row = conn.execute(
            """
            select p.name, p.currency, p.price, p.sale_price, p.description, p.usps, p.specs,
                   p.selling_context, p.variants, p.pricing_lines,
                   b.name as brand_name, b.positioning, b.audience, b.voice, b.language
            from products p join brands b on b.id = p.brand_id and b.org_id = p.org_id
            where p.id = %(id)s and p.org_id = %(org)s and p.deleted_at is null
              and b.deleted_at is null
            """,
            {"id": payload.product_id, "org": org_id},
        ).fetchone()
    if row is None:
        raise UserFacingError("That product no longer exists.", code="product_missing")
    ctx.progress(f"Read {row['name']}", data={"step": 1, "total": TOTAL})

    facts = {
        "brand": {
            "name": row["brand_name"],
            "positioning": row["positioning"],
            "audience": row["audience"],
            "voice": row["voice"],
            "language": row["language"],
        },
        "product": {
            "name": row["name"],
            "currency": row["currency"],
            "price": str(row["price"]) if row["price"] is not None else None,
            "sale_price": str(row["sale_price"]) if row["sale_price"] is not None else None,
            "description": row["description"],
            "selling_points": row["usps"],
            "specs": row["specs"],
            "selling_context": row["selling_context"],
            "variants": [v.get("name") for v in row["variants"][:20] if isinstance(v, dict)],
            "pricing": [p.get("label") for p in row["pricing_lines"][:10] if isinstance(p, dict)],
        },
    }
    with node_context("product_briefing"):
        result = anthropic.generate(
            role="analysis",
            ledger_kind="analysis",
            system=SYSTEM,
            prompt="Brand and product facts (JSON):\n" + json.dumps(facts, ensure_ascii=False),
            max_tokens=2000,
            effort="medium",
            json_schema=anthropic.strict_schema(Briefing),
            mock_text=json.dumps(_mock_briefing()),
        )
    briefing = Briefing.model_validate(result.json())
    briefing.audiences = briefing.audiences[:AUDIENCES]
    briefing.benefits = briefing.benefits[:MAX_ITEMS]
    briefing.features = briefing.features[:MAX_ITEMS]
    briefing.objections = briefing.objections[:MAX_ITEMS]
    data = briefing.model_dump(mode="json")

    with transaction() as conn:
        conn.execute(
            """
            insert into product_strategy (org_id, product_id, kind, data, model)
            values (%(org)s, %(product)s, 'briefing', %(data)s::jsonb, %(model)s)
            on conflict (product_id, kind) do update set
              data = excluded.data, model = excluded.model, created_at = now()
            where product_strategy.org_id = excluded.org_id
            """,
            {
                "org": org_id,
                "product": payload.product_id,
                "data": json.dumps(data),
                "model": result.model,
            },
        )
    ctx.progress("Wrote the briefing", data={"step": 2, "total": TOTAL})
    return {
        "product_id": str(payload.product_id),
        "briefing": data,
        "ai": "mock" if get_settings().lp_mock_llm else "live",
    }


def _mock_briefing() -> dict[str, Any]:
    placeholder = "(mock) Written by the AI pass when mock mode is off."
    return {
        "audiences": [
            {"name": f"(mock) Audience {n}", "description": placeholder} for n in range(1, 5)
        ],
        "benefits": [placeholder],
        "features": [placeholder],
        "objections": [placeholder],
    }
