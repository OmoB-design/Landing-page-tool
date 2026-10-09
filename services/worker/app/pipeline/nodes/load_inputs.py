"""`load_inputs` (BUILD_SPEC §10.2): the template, the brand view for the product and the
wizard; the template's HTML becomes the build's first page revision."""

from typing import Any
from uuid import UUID

from app.db import transaction
from app.jobs.errors import UserFacingError
from app.models.template import TemplateInstructions
from app.pipeline.runtime import PipelineContext, node, write_page
from app.pipeline.state import BuildState
from app.providers import storage


def _asset_urls(conn: Any, org_id: UUID, ids: list[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = conn.execute(
        "select id, bucket, path from assets where org_id = %(org)s and id = any(%(ids)s::uuid[])",
        {"org": org_id, "ids": ids},
    ).fetchall()
    return {str(r["id"]): storage.public_url(r["bucket"], r["path"]) for r in rows}


def _money(value: Any) -> str | None:
    return None if value is None else f"{value:.2f}"


@node("load_inputs", "Loaded the template, brand and product")
def load_inputs(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    org = ctx.org_id
    with transaction() as conn:
        build = conn.execute(
            "select * from builds where id = %(id)s and org_id = %(org)s",
            {"id": ctx.build_id, "org": org},
        ).fetchone()
        if build is None:
            raise UserFacingError("That build no longer exists.", code="build_missing")
        template = conn.execute(
            """
            select * from templates
            where id = %(id)s and (org_id is null or org_id = %(org)s) and deleted_at is null
            """,
            {"id": build["template_id"], "org": org},
        ).fetchone()
        brand = conn.execute(
            "select * from brands where id = %(id)s and org_id = %(org)s",
            {"id": build["brand_id"], "org": org},
        ).fetchone()
        product = conn.execute(
            "select * from products where id = %(id)s and org_id = %(org)s",
            {"id": build["product_id"], "org": org},
        ).fetchone()
        if template is None or brand is None or product is None:
            raise UserFacingError(
                "The template, brand or product for this build is gone.", code="inputs_missing"
            )
        sections = conn.execute(
            """
            select key, role, label from template_sections
            where template_id = %(t)s order by position
            """,
            {"t": template["id"]},
        ).fetchall()
        image_ids = [i["asset_id"] for i in product["images"] if i.get("asset_id")]
        variant_ids = [v["image_asset_id"] for v in product["variants"] if v.get("image_asset_id")]
        brand_ids = [str(a) for a in (brand["logo_asset_id"], brand["favicon_asset_id"]) if a]
        urls = _asset_urls(conn, org, [*image_ids, *variant_ids, *brand_ids])

    bucket = "library" if template["org_id"] is None else "templates"
    html = storage.download(bucket, template["html_path"]).decode("utf-8")
    instructions = TemplateInstructions.model_validate(template["instructions"] or {})

    images = [
        urls.get(str(i.get("asset_id"))) or i["source_url"]
        for i in product["images"]
        if i.get("asset_id") or i.get("source_url")
    ]
    update: dict[str, Any] = {
        "template": {
            "id": str(template["id"]),
            "slug": template["slug"],
            "name": template["name"],
            "type": template["type"],
            "version": template["version"],
            "source_palette": template["source_palette"],
            "sections": [dict(s) for s in sections],
            "instructions": instructions.model_dump(),
        },
        "brand": {
            "id": str(brand["id"]),
            "name": brand["name"],
            "url": brand["url"],
            "tagline": brand["tagline"],
            "positioning": brand["positioning"],
            "audience": brand["audience"],
            "voice": brand["voice"],
            "language": brand["language"] or "en",
            "palette": brand["palette"] or {},
            "fonts": brand["fonts"] or {},
            "logo_url": urls.get(str(brand["logo_asset_id"])) if brand["logo_asset_id"] else None,
            "favicon_url": urls.get(str(brand["favicon_asset_id"]))
            if brand["favicon_asset_id"]
            else None,
            "support_email": brand["support_email"],
            "cta_text": brand["cta_text"],
            "sale_percent": brand["sale_percent"],
            "promo_text": brand["promo_text"],
            "meta_title": brand["meta_title"],
            "meta_description": brand["meta_description"],
        },
        "product": {
            "id": str(product["id"]),
            "name": product["name"],
            "url": product["url"],
            "currency": product["currency"],
            "price": _money(product["price"]),
            "sale_price": _money(product["sale_price"]),
            "description": product["description"],
            "usps": [u for u in product["usps"] if isinstance(u, str)],
            "images": images,
            "variants": [
                {
                    "name": v.get("name") or "",
                    "price": v.get("price"),
                    "image_url": urls.get(str(v.get("image_asset_id")))
                    if v.get("image_asset_id")
                    else None,
                }
                for v in product["variants"]
            ],
        },
        "wizard": build["wizard"] or {},
        "targeting": build["targeting"] or {},
        **write_page({**state, "html_rev": 0}, "template", html),
        "_stats": {
            "template": template["slug"],
            "sections": len(sections),
            "product_images": len(images),
        },
        "_message": f"Loaded {template['name']} for {product['name']}",
    }
    return update
