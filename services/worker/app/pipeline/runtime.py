"""What every node shares: the run context (job, org, build), the step wrapper that reports
progress and attributes cost, and reading/writing the working page.

Each node writes a new revision of the page and returns its path in state. A node that crashes
after writing re-runs from the previous revision's path (still in the last checkpoint), so
re-running a node never applies its change twice.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from langgraph.runtime import Runtime

from app.jobs.context import JobContext
from app.pipeline.state import BuildState, NodeReport
from app.providers import storage
from app.providers.ledger import cost_context, node_context

BUCKET = "builds"
NodeBody = Callable[[BuildState, "PipelineContext"], dict[str, Any]]
NodeFn = Callable[[BuildState, Runtime["PipelineContext"]], dict[str, Any]]


@dataclass
class PipelineContext:
    job: JobContext
    org_id: UUID
    build_id: UUID
    order: list[str]  # the node order for this build's origin, for step numbers


def build_prefix(org_id: str, build_id: str) -> str:
    return f"{org_id}/{build_id}"


def read_page(state: BuildState) -> str:
    return storage.download(BUCKET, state["html_path"]).decode("utf-8")


def write_page(state: BuildState, node: str, html: str) -> dict[str, Any]:
    """Stores a new revision of the page and returns the state update pointing at it."""
    rev = state.get("html_rev", 0) + 1
    path = f"{build_prefix(state['org_id'], state['build_id'])}/rev/{rev:03d}-{node}.html"
    storage.upload(BUCKET, path, html.encode("utf-8"), "text/html; charset=utf-8", upsert=True)
    return {"html_path": path, "html_rev": rev, "rev_paths": [path]}


def node(name: str, label: str) -> Callable[[NodeBody], NodeFn]:
    """Wraps a node body: stops cleanly if the worker is shutting down, attributes every paid
    call to (org, job, build, node), records a NodeReport and reports the step to the UI.

    A body may return `_stats`, `_warnings` and `_message` alongside its state update."""

    def wrap(body: NodeBody) -> NodeFn:
        def run(state: BuildState, runtime: Runtime[PipelineContext]) -> dict[str, Any]:
            ctx = runtime.context
            ctx.job.check_stopping()
            with (
                cost_context(ctx.org_id, job_id=ctx.job.job.id, build_id=ctx.build_id),
                node_context(name),
            ):
                update = dict(body(state, ctx) or {})
            stats = update.pop("_stats", {})
            warnings = list(update.pop("_warnings", []))
            message = update.pop("_message", label)
            report: NodeReport = {"node": name, "ok": True, "stats": stats, "warnings": warnings}
            update["node_reports"] = [report]
            if warnings:
                update["warnings"] = warnings
            step = ctx.order.index(name) + 1 if name in ctx.order else None
            data: dict[str, Any] = {"node": name, "total": len(ctx.order)}
            if step is not None:
                data["step"] = step
            ctx.job.progress(message, node=name, data=data, check_stop=False)
            return update

        run.__name__ = name
        run.__qualname__ = name
        return run

    return wrap
