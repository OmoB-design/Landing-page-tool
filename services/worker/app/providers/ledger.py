"""Cost attribution and ledger recording (BUILD_SPEC §6.3). Provider calls must run inside a
cost context (set by the job runner, and by pipeline nodes for `node`), so every paid call is
recorded against its org, job, build, brand and node. A call outside a context is a programming
error.

Brand budgets (BUILD_SPEC §6.5, D54): before a paid call for a brand, `check_budget` compares its
spend this calendar month (UTC) with its monthly budget; over it, the call is refused and nothing
is charged. After each recorded call, crossing 80 % or 100 % notifies the org's owners and
admins, once each per month. Two calls running at once can both pass just under the cap.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, replace
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from app.db import transaction
from app.jobs.errors import UserFacingError

LedgerKind = Literal["copy", "vision", "analysis", "image", "edit", "agent", "other"]


@dataclass(frozen=True)
class CostContext:
    org_id: UUID
    job_id: UUID | None = None
    build_id: UUID | None = None
    brand_id: UUID | None = None
    node: str | None = None


_current: ContextVar[CostContext | None] = ContextVar("cost_context", default=None)


class MissingCostContextError(RuntimeError):
    pass


class BudgetExceededError(UserFacingError):
    """The brand has spent its monthly AI budget: the job stops before the call (no charge)."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="budget")


def brand_of(org_id: UUID, job_id: UUID | None, build_id: UUID | None) -> UUID | None:
    """The brand a job's calls are for: its page's brand, else its payload's brand or product's."""
    if job_id is None and build_id is None:
        return None
    with transaction() as conn:
        row = conn.execute(
            """
            select coalesce(
              (select b.brand_id from builds b where b.id = %(b)s and b.org_id = %(o)s),
              (select br.id from jobs j join brands br on br.id::text = j.payload->>'brand_id'
               where j.id = %(j)s and br.org_id = %(o)s),
              (select p.brand_id from jobs j
               join products p on p.id::text = j.payload->>'product_id'
               where j.id = %(j)s and p.org_id = %(o)s)
            ) as brand_id
            """,
            {"o": org_id, "j": job_id, "b": build_id},
        ).fetchone()
    return row["brand_id"] if row else None


@contextmanager
def cost_context(
    org_id: UUID,
    *,
    job_id: UUID | None = None,
    build_id: UUID | None = None,
    brand_id: UUID | None = None,
    node: str | None = None,
) -> Iterator[CostContext]:
    """`brand_id` is looked up from the job or build when it isn't given."""
    brand = brand_id or brand_of(org_id, job_id, build_id)
    ctx = CostContext(org_id=org_id, job_id=job_id, build_id=build_id, brand_id=brand, node=node)
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
            insert into ledger_entries (org_id, build_id, job_id, brand_id, node, kind, provider,
                                        model, input_tokens, output_tokens, units, cost_usd)
            values (%(org_id)s, %(build_id)s, %(job_id)s, %(brand_id)s, %(node)s, %(kind)s,
                    %(provider)s, %(model)s, %(input_tokens)s, %(output_tokens)s, %(units)s,
                    %(cost_usd)s)
            """,
            {
                "org_id": ctx.org_id,
                "build_id": ctx.build_id,
                "job_id": ctx.job_id,
                "brand_id": ctx.brand_id,
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

    if ctx.brand_id is not None and cost_usd:
        _notify_thresholds(ctx.org_id, ctx.brand_id)


# This calendar month in UTC, as Postgres sees it.
MONTH_START = "date_trunc('month', now() at time zone 'utc') at time zone 'utc'"


def _budget(conn: Any, org_id: UUID, brand_id: UUID) -> tuple[str, Decimal | None, Decimal]:
    """(the brand's name, its monthly budget or None, its spend this month)."""
    row = conn.execute(
        f"""
        select b.name, b.monthly_budget_usd as budget,
               (select coalesce(sum(l.cost_usd), 0) from ledger_entries l
                where l.brand_id = b.id and l.created_at >= {MONTH_START}) as spent
        from brands b where b.id = %(b)s and b.org_id = %(o)s
        """,
        {"b": brand_id, "o": org_id},
    ).fetchone()
    if row is None:
        return "", None, Decimal(0)
    budget = row["budget"] if row["budget"] else None  # empty or 0: no cap
    return row["name"], budget, Decimal(row["spent"])


def _money(value: Decimal) -> str:
    return f"${value:,.2f}"


def check_budget() -> None:
    """Before a paid call: refuses it when the brand has spent its monthly budget."""
    ctx = require_context()
    if ctx.brand_id is None:
        return
    with transaction() as conn:
        name, budget, spent = _budget(conn, ctx.org_id, ctx.brand_id)
    if budget is not None and spent >= budget:
        raise BudgetExceededError(
            f"{name} has reached its {_money(budget)} monthly AI budget "
            f"({_money(spent)} spent this month). Raise it in the brand's DNA to continue."
        )


def _notify_thresholds(org_id: UUID, brand_id: UUID) -> None:
    """After a paid call: 80 % and 100 % of the budget notify the owners and admins, once each
    per month (`budget_notices`)."""
    with transaction() as conn:
        name, budget, spent = _budget(conn, org_id, brand_id)
        if budget is None:
            return
        for level in (100, 80):
            if spent * 100 < budget * level:
                continue
            first = conn.execute(
                f"""
                insert into budget_notices (brand_id, org_id, month, level)
                values (%(b)s, %(o)s, ({MONTH_START})::date, %(l)s)
                on conflict do nothing returning level
                """,
                {"b": brand_id, "o": org_id, "l": level},
            ).fetchone()
            if first is None:
                break  # sent already this month
            title = (
                f"{name} has used its whole monthly AI budget"
                if level == 100
                else f"{name} has used 80% of its monthly AI budget"
            )
            body = f"{_money(spent)} of {_money(budget)} this month. " + (
                "Paid steps for this brand stop until next month or until the budget is raised."
                if level == 100
                else "Paid steps stop at 100%."
            )
            conn.execute(
                """
                insert into notifications (org_id, user_id, kind, title, body)
                select %(o)s, m.user_id, %(k)s, %(t)s, %(body)s
                from org_members m where m.org_id = %(o)s and m.role in ('owner', 'admin')
                """,
                {"o": org_id, "k": f"budget_{level}", "t": title, "body": body},
            )
            break  # one notice per call: 100 % covers 80 %
