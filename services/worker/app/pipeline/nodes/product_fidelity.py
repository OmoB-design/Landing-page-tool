"""`product_fidelity` (BUILD_SPEC §10.5): replaces generic products in generated scenes with the
real one. Skipped while images are mocked; the pass itself arrives in B1.3."""

from typing import Any

from app.pipeline.runtime import PipelineContext, node
from app.pipeline.state import BuildState


@node("product_fidelity", "Skipped product matching (arrives with real images)")
def product_fidelity(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    reason = "mock_images" if state.get("mock_images", True) else "arrives_in_b1_3"
    images = {**state.get("images", {}), "product_fix": {"skipped": reason}}
    return {"images": images, "_stats": {"skipped": reason}}
