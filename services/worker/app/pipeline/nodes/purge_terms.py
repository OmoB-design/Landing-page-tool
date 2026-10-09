"""`purge_terms` (BUILD_SPEC §8.5, §10.2): the template's forbidden terms come out."""

from typing import Any

from app.engines.purge import purge_terms as engine
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("purge_terms", "Removed forbidden terms")
def purge_terms(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    terms = state["template"]["instructions"].get("forbidden_terms", [])
    html, stats = engine(read_page(state), terms)
    purged = list(stats["purged_terms"])  # type: ignore[call-overload]
    copy = {**state.get("copy", {}), "purged_terms": purged}
    update: dict[str, Any] = {"copy": copy, "_stats": {"purged": len(purged)}}
    if purged:
        update.update(write_page(state, "purge_terms", html))
    return update
