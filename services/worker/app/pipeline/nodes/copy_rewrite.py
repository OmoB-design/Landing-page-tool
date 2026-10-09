"""`copy_rewrite` (BUILD_SPEC §10.3). B0.6a leaves the template's copy as it is; the fragment
system and the AI rewrite arrive in B0.6b."""

from typing import Any

from app.pipeline.runtime import PipelineContext, node
from app.pipeline.state import BuildState

NOT_YET = "The copy rewrite arrives in B0.6b; the template's own copy is kept."


@node("copy_rewrite", "Kept the template's copy (rewrite arrives in B0.6b)")
def copy_rewrite(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    copy = {"rewritten_ratio": 0.0, "skipped": NOT_YET, "warnings": [], "drift_warnings": []}
    return {"copy": copy, "_stats": {"skipped": True}}
