"""Clone-only nodes (BUILD_SPEC §10.2), reached only when origin is `cloned` (M2). Owned builds
never run them; until M2 they pass the page through unchanged. M2 gives each its own module."""

from typing import Any

from app.pipeline.runtime import PipelineContext, node
from app.pipeline.state import BuildState

NOT_YET = {"skipped": "clone path arrives in M2"}


@node("strip_chrome", "Stripped store chrome")
def strip_chrome(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    return {"_stats": NOT_YET}


@node("scrub_source_brand", "Removed the source brand")
def scrub_source_brand(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    return {"_stats": NOT_YET}


@node("scrub_scripts", "Cleaned up scripts")
def scrub_scripts(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    return {"blueprint_stats": {}, "_stats": NOT_YET}


@node("rewrite_links", "Rewrote links")
def rewrite_links(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    return {"_stats": NOT_YET}


@node("purge_foreign_assets", "Removed foreign assets")
def purge_foreign_assets(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    return {"_stats": NOT_YET}


@node("residue_scan", "Scored source residue")
def residue_scan(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    residue: dict[str, Any] = {
        "score": None,
        "clean": None,
        "counts": {},
        "findings": [],
        **NOT_YET,
    }
    return {"residue": residue, "_stats": NOT_YET}
