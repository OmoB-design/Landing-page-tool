"""`mobile_optimize` (BUILD_SPEC §11.2, B3.3b, D112): Fix for phone. Claude writes phone-only CSS
from the page at 390 px and the phone check, in two rounds (fix, then check), and the result lands
on the page as one undoable change (app/mobile.py). About 5 to 10 cents; one at a time per page."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app import desk, mobile
from app.db import transaction
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError


class PhonePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    build_id: UUID


def dedupe_key(payload: PhonePayload) -> str:
    return f"phone:{payload.build_id}"


def run(ctx: JobContext) -> dict[str, Any]:
    payload = PhonePayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    try:
        with transaction() as conn:
            html = desk._page(desk._load(conn, org_id, payload.build_id))
        css, before, after, note = mobile.fix(html, lambda message: ctx.progress(message))
        ctx.progress("Putting the fixes on the page")
        version = mobile.apply(org_id, payload.build_id, ctx.job.created_by, css, ctx.sleep)
    except (desk.DeskEditError, desk.DeskNotFoundError) as exc:
        raise UserFacingError(str(exc) or "That page isn't available.", code="not_fixed") from exc
    return {
        "build_id": str(payload.build_id),
        "page_version": version,
        "note": note,
        "before": before.as_dict(),
        "after": after.as_dict(),
        "css_rules": css.count("{"),
    }
