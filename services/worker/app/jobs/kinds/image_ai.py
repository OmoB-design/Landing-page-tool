"""`image_generate` and `image_edit` (BUILD_SPEC §11.2, B3.2b, D110): one AI picture for one image
of a built page, from the image studio. Makes the picture (fal, or a free placeholder in mock
mode), stores it as one of the workspace's assets and puts it on the page as it is then, as one
undoable change and a new version of the image (app/image_ai.py). One at a time per image.
"""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app import desk, image_ai
from app.db import transaction
from app.engines import image_edits
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.models.images import MAX_REFERENCES, PROMPT_MAX
from app.providers import fal, storage
from app.providers.ledger import node_context


class ImagePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    build_id: UUID
    number: int = Field(ge=1)
    prompt: str = Field(min_length=1, max_length=PROMPT_MAX)
    # The product photos to keep the product true to, as their addresses.
    references: list[str] = Field(default_factory=list, max_length=MAX_REFERENCES)


def dedupe_key(payload: ImagePayload) -> str:
    return f"image:{payload.build_id}:{payload.number}"


def run_generate(ctx: JobContext) -> dict[str, Any]:
    return _run(ctx, "generate")


def run_edit(ctx: JobContext) -> dict[str, Any]:
    return _run(ctx, "edit")


def _run(ctx: JobContext, mode: image_ai.Mode) -> dict[str, Any]:
    payload = ImagePayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    number = payload.number
    info = {"number": number, "mode": mode}
    ctx.progress(
        "Making a new picture" if mode == "generate" else "Editing the picture",
        data={"image": {**info, "step": "making"}},
    )
    try:
        with transaction() as conn:
            html = desk._page(desk._load(conn, org_id, payload.build_id))
        image = next((i for i in image_edits.page_images(html) if i.number == number), None)
        if image is None:
            raise desk.DeskEditError(f"Image {number} isn't on the page any more.")
        width, height = image_ai.size_for(html, number)
        with node_context("image_studio"):
            data, mime, mock = image_ai.make(
                mode, payload.prompt, image.src, payload.references, width, height
            )
        asset = storage.store_asset(org_id, data, mime)
        ctx.progress("Putting it on the page", data={"image": {**info, "step": "placing"}})
        version = image_ai.apply(
            org_id, payload.build_id, ctx.job.created_by, number, src=asset.url,
            asset_id=asset.id, mode=mode, prompt=payload.prompt, mock=mock, wait=ctx.sleep,
        )  # fmt: skip
    except (desk.DeskEditError, desk.DeskNotFoundError) as exc:
        message = str(exc) or "That page isn't available."
        raise UserFacingError(message, code="image_not_placed") from exc
    except fal.ImagesNotConfiguredError as exc:
        raise UserFacingError(
            "Real pictures need a fal key on the worker (FAL_KEY).", code="images_not_configured"
        ) from exc
    return {
        "build_id": str(payload.build_id),
        "number": number,
        "mode": mode,
        "src": asset.url,
        "page_version": version,
        "mock": mock,
    }
