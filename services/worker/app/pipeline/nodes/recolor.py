"""`recolor` (BUILD_SPEC §10.2): brand colours and fonts on the page."""

from typing import Any

from app.engines import recolor as engine
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("recolor", "Applied the brand colours and fonts")
def recolor(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    brand = state["brand"]
    html, stats = engine.recolor(
        read_page(state),
        source_palette=state["template"].get("source_palette"),
        brand_palette=brand["palette"],
        brand_fonts=brand["fonts"],
    )
    warnings = [str(stats["skipped"])] if stats.get("skipped") else []
    return {
        **write_page(state, "recolor", html),
        "brand_stats": {**state.get("brand_stats", {}), "recolor": stats},
        "_stats": stats,
        "_warnings": warnings,
    }
