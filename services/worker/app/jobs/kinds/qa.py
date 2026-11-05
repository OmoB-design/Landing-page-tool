"""`qa` (BUILD_SPEC §11.1, B3.3a, D111): the preview check of a built page. Screenshots at
desktop and phone widths and the share image (app/qa.py). Queued when a build finishes and from
the review desk's Refresh; one at a time per page; free (rendering only)."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app import desk, qa
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError


class QaPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    build_id: UUID


def dedupe_key(payload: QaPayload) -> str:
    return f"qa:{payload.build_id}"


def run(ctx: JobContext) -> dict[str, Any]:
    payload = QaPayload.model_validate(ctx.job.payload)
    ctx.progress("Taking the screenshots")
    try:
        return qa.run(ctx.job.org_id, payload.build_id)
    except desk.DeskNotFoundError as exc:
        raise UserFacingError("That page isn't available any more.", code="no_page") from exc
