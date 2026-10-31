"""`prepare_media_slots` (BUILD_SPEC §10.2): video and animation slots become image slots. On a
clone the source's images are sorted into slots first, since clones carry no markers (B2.3)."""

from typing import Any

from app.engines.clone_build import mark_images
from app.engines.images import prepare_media_slots as engine
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("prepare_media_slots", "Prepared the image slots")
def prepare_media_slots(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    page = read_page(state)
    sorted_images: dict[str, object] = {}
    if state["origin"] == "cloned":
        template = state["template"]
        rules = template["instructions"]
        page, sorted_images = mark_images(
            page,
            keep=rules.get("keep_images", []),
            generic=rules.get("generic_images", []),
            logo_srcs=template["blueprint"].get("logo_srcs", []),
        )
    html, stats = engine(page)
    images: dict[str, Any] = {"media_slots": stats["media_slots"]}
    if sorted_images:
        images["clone_slots"] = sorted_images
    update: dict[str, Any] = {"images": images, "_stats": {**stats, **sorted_images}}
    if stats["media_slots"] or sorted_images:
        update.update(write_page(state, "prepare_media_slots", html))
    return update
