"""Cost attribution and ledger recording (BUILD_SPEC §6.3). Provider calls must run inside a
cost context (set by the job runner, and by pipeline nodes for `node`), so every paid call is
recorded against its org, job, build and node. A call outside a context is a programming error.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, replace
from decimal import Decimal
from typing import Literal
from uuid import UUID

from app.db import transaction

LedgerKind = Literal["copy", "vision", "analysis", "image", "edit", "agent", "other"]


@dataclass(frozen=True)
class CostContext:
    org_id: UUID
    job_id: UUID | None = None
    build_id: UUID | None = None
    node: str | None = None


_current: ContextVar[CostContext | None] = ContextVar("cost_context", default=None)


class MissingCostContextError(RuntimeError):
    pass


@contextmanager
def cost_context(
    org_id: UUID,
    *,
    job_id: UUID | None = None,
    build_id: UUID | None = None,
    node: str | None = None,
) -> Iterator[CostContext]:
    ctx = CostContext(org_id=org_id, job_id=job_id, build_id=build_id, node=node)
    token = _current.set(ctx)
    try:
        yield ctx
    finally:
        _current.reset(token)


@contextmanager
def node_context(node: str) -> Iterator[CostContext]:
    """Attributes calls in this block to a pipeline node, inside the current context."""
    ctx = replace(require_context(), node=node)
    token = _current.set(ctx)
    try:
        yield ctx
    finally:
        _current.reset(token)


def require_context() -> CostContext:
    ctx = _current.get()
    if ctx is None:
        raise MissingCostContextError(
            "Provider calls must run inside cost_context() so their cost is recorded."
        )
    return ctx


def record(
    *,
    kind: LedgerKind,
    provider: str,
    model: str,
    cost_usd: Decimal | None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    units: Decimal | int | None = None,
) -> None:
    ctx = require_context()
    with transaction() as conn:
        conn.execute(
            """
            insert into ledger_entries (org_id, build_id, job_id, node, kind, provider, model,
                                        input_tokens, output_tokens, units, cost_usd)
            values (%(org_id)s, %(build_id)s, %(job_id)s, %(node)s, %(kind)s, %(provider)s,
                    %(model)s, %(input_tokens)s, %(output_tokens)s, %(units)s, %(cost_usd)s)
            """,
            {
                "org_id": ctx.org_id,
                "build_id": ctx.build_id,
                "job_id": ctx.job_id,
                "node": ctx.node,
                "kind": kind,
                "provider": provider,
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "units": units,
                "cost_usd": cost_usd,
            },
        )
