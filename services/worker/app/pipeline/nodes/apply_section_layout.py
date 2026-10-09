"""`apply_section_layout` (BUILD_SPEC §10.2): the page's sections in the template's order."""

from typing import Any

from app.engines import sections
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("apply_section_layout", "Arranged the sections")
def apply_section_layout(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    keys = [s["key"] for s in state["template"]["sections"]]
    html, stats = sections.apply_layout(read_page(state), keys)
    update: dict[str, Any] = {"layout": stats, "_stats": stats, "_warnings": stats["warnings"]}
    if not stats["in_order"]:
        update.update(write_page(state, "apply_section_layout", html))
    return update
