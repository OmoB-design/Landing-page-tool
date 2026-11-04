"""`compliance_scan` (BUILD_SPEC §13.1, both paths): risky claims in the page's text, and on a
Top 5 ranking page the comparison rules and the trace check (D103)."""

from typing import Any

from app.engines import comparison
from app.models.template import RANKING_TYPE
from app.pipeline.runtime import PipelineContext, node, read_page
from app.pipeline.state import BuildState


@node("compliance_scan", "Checked the claims")
def compliance_scan(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    ranking = (state.get("template") or {}).get("type") == RANKING_TYPE
    # A ranking page also traces every competitor fact back to what was read (D103), against
    # the facts the comparison was written from.
    facts = None
    if ranking:
        facts = comparison.facts_from_report({"comparison": state.get("comparison")})
        if facts is None:
            facts = comparison.facts_by_rank(state["product"], state.get("competitors") or [])
    result = comparison.check_claims(
        read_page(state), author_type=state.get("wizard", {}).get("author_type"), facts=facts
    )
    counts: dict[str, int] = result["counts"]  # type: ignore[assignment]
    message = (
        "Checked the claims: nothing flagged"
        if result["clean"]
        else "Checked the claims: {high} high, {medium} medium, {low} low".format(**counts)
    )
    return {"compliance": result, "_stats": counts, "_message": message}
