"""`brand_assets`: after a brand is saved, download its logo and favicon (or store its inline SVG
logo) into the `assets` bucket and link them to the brand (BUILD_SPEC §7.3 step 5)."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.db import transaction
from app.fetch import ladder
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.providers import storage

TOTAL = 2
IMAGE_TYPES = {
    "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/x-icon",
    "image/vnd.microsoft.icon",
}  # fmt: skip


class BrandAssetsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand_id: UUID
    logo_url: str | None = Field(default=None, max_length=2000)
    logo_svg: str | None = Field(default=None, max_length=100_000)
    favicon_url: str | None = Field(default=None, max_length=2000)


def run(ctx: JobContext) -> dict[str, Any]:
    payload = BrandAssetsPayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    with transaction() as conn:
        brand = conn.execute(
            "select id from brands where id = %(id)s and org_id = %(org)s and deleted_at is null",
            {"id": payload.brand_id, "org": org_id},
        ).fetchone()
    if brand is None:
        raise UserFacingError("That brand no longer exists.", code="brand_missing")

    warnings: list[str] = []
    logo_id = None
    if payload.logo_svg and payload.logo_svg.lstrip().startswith("<svg"):
        logo_id = storage.store_asset(org_id, payload.logo_svg.encode(), "image/svg+xml").id
    elif payload.logo_url:
        logo_id = _download(org_id, payload.logo_url, warnings, "logo")
    ctx.progress("Saved the logo" if logo_id else "No logo saved", data={"step": 1, "total": TOTAL})

    favicon_id = (
        _download(org_id, payload.favicon_url, warnings, "favicon") if payload.favicon_url else None
    )
    ctx.progress(
        "Saved the favicon" if favicon_id else "No favicon saved", data={"step": 2, "total": TOTAL}
    )

    with transaction() as conn:
        conn.execute(
            """
            update brands set
              logo_asset_id = coalesce(%(logo)s, logo_asset_id),
              favicon_asset_id = coalesce(%(favicon)s, favicon_asset_id)
            where id = %(id)s and org_id = %(org)s
            """,
            {"logo": logo_id, "favicon": favicon_id, "id": payload.brand_id, "org": org_id},
        )
    return {
        "logo_asset_id": str(logo_id) if logo_id else None,
        "favicon_asset_id": str(favicon_id) if favicon_id else None,
        "warnings": warnings,
    }


def _download(org_id: UUID, url: str | None, warnings: list[str], what: str) -> UUID | None:
    if not url:
        return None
    try:
        data, content_type = ladder.fetch_bytes(url)
    except UserFacingError as exc:
        warnings.append(f"Couldn't download the {what}: {exc.message}")
        return None
    if content_type not in IMAGE_TYPES:
        warnings.append(f"The {what} isn't an image ({content_type or 'unknown type'}).")
        return None
    mime = "image/x-icon" if content_type == "image/vnd.microsoft.icon" else content_type
    return storage.store_asset(org_id, data, mime, source_url=url).id
