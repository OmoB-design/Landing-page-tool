"""`pull_competitors` (BUILD_SPEC §8.7, D53, D102): a Top 5 ranking build reads its four
competitor product pages, stores what they say in `build_competitors`, and fills ranks #2 to #5
of the page from it. Ranking builds only (the graph's fork after `load_inputs`)."""

from typing import Any

from app import competitors as pulling
from app.engines import ranking
from app.jobs.errors import UserFacingError
from app.models.competitor import Naming
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState


@node("pull_competitors", "Read the competitors")
def pull_competitors(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    spec = (state.get("wizard") or {}).get("competitors") or {}
    urls = [str(u) for u in spec.get("urls") or []]
    naming: Naming = "real" if spec.get("naming") == "real" else "neutral"
    if not urls:
        raise UserFacingError(
            "This ranking page has no competitors. Start a new page and add four.",
            code="competitors_missing",
        )
    found = pulling.pull(ctx.org_id, urls, naming)
    pulling.save(ctx.org_id, ctx.build_id, found)
    read = [c for c in found if c.status == "pulled"]
    if not read:
        raise UserFacingError(
            "None of the competitor pages could be read: "
            + "; ".join(f"{c.url} ({c.error})" for c in found),
            code="competitors_unreadable",
        )
    html, stats = ranking.fill_ranking(read_page(state), [pulling.entry(c) for c in read])
    warnings = [f"{c.url} couldn't be read ({c.error}), so the ranking has one less entry."
                for c in found if c.status == "failed"]  # fmt: skip
    warnings += [f"{c.label}: {w}" for c in read for w in c.warnings]
    return {
        **write_page(state, "pull_competitors", html),
        "competitors": [c.model_dump(mode="json") for c in found],
        "_stats": {**stats, "naming": naming, "read": len(read), "failed": len(found) - len(read)},
        "_warnings": warnings,
        "_message": f"Read {len(read)} of {len(found)} competitors",
    }
