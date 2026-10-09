"""`swap_logos` (BUILD_SPEC §10.2): the brand logo in every logo slot."""

from typing import Any

from app.engines.brand_parts import swap_logos as engine
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("swap_logos", "Swapped in the logo")
def swap_logos(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    brand = state["brand"]
    html, stats = engine(read_page(state), logo_url=brand["logo_url"], brand_name=brand["name"])
    warnings = (
        ["The brand has no logo yet, so its name stands in. Add one on the brand."]
        if stats["logos_missing"]
        else []
    )
    return {
        **write_page(state, "swap_logos", html),
        "brand_stats": {**state.get("brand_stats", {}), "logos": stats},
        "_stats": stats,
        "_warnings": warnings,
    }
