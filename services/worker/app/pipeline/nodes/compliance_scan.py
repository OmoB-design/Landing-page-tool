"""`compliance_scan` (BUILD_SPEC §13.1, both paths): risky claims in the page's text."""

from typing import Any

from app.engines.compliance import scan
from app.pipeline.runtime import PipelineContext, node, read_page
from app.pipeline.state import BuildState


@node("compliance_scan", "Checked the claims")
def compliance_scan(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    result = scan(read_page(state), author_type=state.get("wizard", {}).get("author_type"))
    counts: dict[str, int] = result["counts"]  # type: ignore[assignment]
    message = (
        "Checked the claims: nothing flagged"
        if result["clean"]
        else "Checked the claims: {high} high, {medium} medium, {low} low".format(**counts)
    )
    return {"compliance": result, "_stats": counts, "_message": message}
