"""Brand AI budgets (B1.6b, D54, BUILD_SPEC §6.5): spend is recorded against the brand, a paid
call over the budget is refused before any charge, and 80 % and 100 % notify owners and admins
once each per month."""

import uuid
from decimal import Decimal
from typing import Any

import pytest

from app.db import transaction
from app.jobs import queue
from app.providers import anthropic, ledger
from tests.conftest import DbUser, needs_db


def brand_and_product(build: dict[str, Any]) -> tuple[uuid.UUID, uuid.UUID]:
    with transaction() as conn:
        row = conn.execute(
            "select brand_id, product_id from builds where id = %(b)s", {"b": build["id"]}
        ).fetchone()
    assert row is not None
    return row["brand_id"], row["product_id"]


def set_budget(brand_id: uuid.UUID, budget: str | None) -> None:
    with transaction() as conn:
        conn.execute(
            "update brands set monthly_budget_usd = %(v)s where id = %(b)s",
            {"v": budget, "b": brand_id},
        )


def spend(org_id: uuid.UUID, brand_id: uuid.UUID, amount: str) -> None:
    with ledger.cost_context(org_id, brand_id=brand_id, node="test"):
        ledger.record(kind="copy", provider="anthropic", model="test", cost_usd=Decimal(amount))


def notices(user: DbUser) -> list[str]:
    with transaction() as conn:
        rows = conn.execute(
            "select kind from notifications where user_id = %(u)s and kind like 'budget_%%' "
            "order by created_at",
            {"u": user.id},
        ).fetchall()
    return [r["kind"] for r in rows]


@needs_db
def test_the_brand_is_found_from_the_page_or_the_jobs_brand_or_product(
    user: DbUser, finished: dict[str, Any]
) -> None:
    brand_id, product_id = brand_and_product(finished)
    assert ledger.brand_of(user.org_id, None, uuid.UUID(finished["id"])) == brand_id
    for payload in ({"brand_id": str(brand_id), "url": "x"}, {"product_id": str(product_id)}):
        job, _ = queue.enqueue(
            org_id=user.org_id, kind="product_pull", payload=payload, created_by=user.id
        )
        assert ledger.brand_of(user.org_id, job.id, None) == brand_id
        with transaction() as conn:
            conn.execute("update jobs set status = 'cancelled' where id = %(j)s", {"j": job.id})
    assert ledger.brand_of(uuid.uuid4(), None, uuid.UUID(finished["id"])) is None  # other org
    with ledger.cost_context(user.org_id, build_id=uuid.UUID(finished["id"])) as ctx:
        assert ctx.brand_id == brand_id
        ledger.record(kind="copy", provider="anthropic", model="test", cost_usd=Decimal("0.01"))
    with transaction() as conn:
        row = conn.execute(
            "select brand_id from ledger_entries where build_id = %(b)s order by id desc limit 1",
            {"b": finished["id"]},
        ).fetchone()
    assert row is not None and row["brand_id"] == brand_id


@needs_db
def test_a_paid_call_over_the_budget_is_refused_before_any_charge(
    user: DbUser, finished: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    brand_id, _ = brand_and_product(finished)
    with ledger.cost_context(user.org_id, brand_id=brand_id):
        ledger.check_budget()  # no budget: no cap
    set_budget(brand_id, "0")
    with ledger.cost_context(user.org_id, brand_id=brand_id):
        ledger.check_budget()  # 0: no cap either
    set_budget(brand_id, "1.00")
    spend(user.org_id, brand_id, "0.60")
    with ledger.cost_context(user.org_id, brand_id=brand_id):
        ledger.check_budget()  # under it
    spend(user.org_id, brand_id, "0.40")

    def no_call() -> None:
        raise AssertionError("Claude was called over the budget")

    monkeypatch.setattr(anthropic, "_client", no_call)
    with (
        ledger.cost_context(user.org_id, brand_id=brand_id),
        pytest.raises(ledger.BudgetExceededError) as refused,
    ):
        anthropic.generate(role="copy", ledger_kind="copy", prompt="Hi", mock=False)
    assert refused.value.code == "budget"
    assert "Lume has reached its $1.00 monthly AI budget ($1.00 spent" in refused.value.message


@needs_db
def test_owners_hear_at_80_and_100_percent_once_each(
    user: DbUser, finished: dict[str, Any]
) -> None:
    brand_id, _ = brand_and_product(finished)
    set_budget(brand_id, "1.00")
    spend(user.org_id, brand_id, "0.50")
    assert notices(user) == []
    spend(user.org_id, brand_id, "0.30")  # 80 %
    spend(user.org_id, brand_id, "0.05")  # still 80 %: no second notice
    assert notices(user) == ["budget_80"]
    spend(user.org_id, brand_id, "0.20")  # past 100 %
    spend(user.org_id, brand_id, "0.01")
    assert notices(user) == ["budget_80", "budget_100"]
    with transaction() as conn:
        note = conn.execute(
            "select title, body from notifications where user_id = %(u)s and kind = 'budget_100'",
            {"u": user.id},
        ).fetchone()
    assert note is not None and note["title"] == "Lume has used its whole monthly AI budget"
    assert note["body"].startswith("$1.05 of $1.00 this month.")
