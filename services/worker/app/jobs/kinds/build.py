"""`build` (BUILD_SPEC §10): runs the pipeline graph for one build.

Each build is a LangGraph thread (thread_id = build id) checkpointed after every node, so a
retried, crashed or restarted job continues after the last finished node instead of starting
over (and never pays twice for work already done). The job is created with its build by
POST /builds; users don't start it directly.
"""

from typing import Any
from uuid import UUID

import structlog
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, ConfigDict

from app.db import transaction
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.pipeline.graph import ORDER, get_graph
from app.pipeline.runtime import BUCKET, PipelineContext
from app.providers import storage

log = structlog.get_logger()
DONE = ("needs_review", "approved", "published")


class BuildPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build_id: UUID


def run(ctx: JobContext) -> dict[str, Any]:
    payload = BuildPayload.model_validate(ctx.job.payload)
    org_id, build_id = ctx.job.org_id, payload.build_id
    with transaction() as conn:
        build = conn.execute(
            """
            select id, origin, status, mock_images from builds
            where id = %(b)s and org_id = %(o)s
            """,
            {"b": build_id, "o": org_id},
        ).fetchone()
        if build is None:
            raise UserFacingError("That build no longer exists.", code="build_missing")
        if build["status"] in DONE:
            return {"build_id": str(build_id), "status": build["status"], "already_done": True}
        conn.execute(
            "update builds set status = 'building' where id = %(b)s and org_id = %(o)s",
            {"b": build_id, "o": org_id},
        )

    graph = get_graph()
    config: RunnableConfig = {"configurable": {"thread_id": str(build_id)}}
    context = PipelineContext(
        job=ctx, org_id=org_id, build_id=build_id, order=ORDER[build["origin"]]
    )
    snapshot = graph.get_state(config)
    if snapshot.next:
        ctx.progress(f"Resuming at {snapshot.next[0]}")
        final = graph.invoke(None, config, context=context, durability="sync")
    elif snapshot.values.get("report"):  # finished before the last attempt could record it
        final = snapshot.values
    else:
        initial = {
            "org_id": str(org_id),
            "build_id": str(build_id),
            "origin": build["origin"],
            "mock_images": build["mock_images"],
            "node_reports": [],
            "warnings": [],
            "rev_paths": [],
        }
        final = graph.invoke(initial, config, context=context, durability="sync")

    report = final["report"]
    _clean_up(build_id, final.get("rev_paths", []))
    return {
        "build_id": str(build_id),
        "status": "needs_review",
        "cost_usd": report["cost"]["total_usd"],
        "mock_images": report["mock_images"],
        "warnings": report["warnings"],
        "compliance": report["compliance"].get("counts", {}),
    }


def _clean_up(build_id: UUID, rev_paths: list[str]) -> None:
    """The intermediate page revisions and the checkpoint thread are only needed to resume an
    unfinished build. Failures here never fail the build."""
    try:
        if rev_paths:
            storage.remove(BUCKET, rev_paths)
        get_graph().checkpointer.delete_thread(str(build_id))  # type: ignore[union-attr]
    except Exception as exc:
        log.warning("build clean-up failed", build=str(build_id), error=str(exc))
