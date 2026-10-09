"""`prepare_media_slots` (BUILD_SPEC §10.2): video and animation slots become image slots."""

from typing import Any

from app.engines.images import prepare_media_slots as engine
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("prepare_media_slots", "Prepared the image slots")
def prepare_media_slots(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    html, stats = engine(read_page(state))
    update: dict[str, Any] = {"images": {"media_slots": stats["media_slots"]}, "_stats": stats}
    if stats["media_slots"]:
        update.update(write_page(state, "prepare_media_slots", html))
    return update
