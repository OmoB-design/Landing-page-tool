"""Analytics (B1.6b): spend over time and by brand, template and kind, and the pages built, for one
workspace and a period, through the API."""

from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient

from app.db import transaction
from app.providers import ledger
from tests.conftest import DbUser, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)


@needs_db
def test_analytics_sums_the_ledger_and_counts_the_pages(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    import uuid

    with ledger.cost_context(user.org_id, build_id=uuid.UUID(finished["id"]), node="copy"):
        ledger.record(kind="copy", provider="anthropic", model="t", cost_usd=Decimal("0.30"))
        ledger.record(kind="image", provider="fal", model="t", cost_usd=Decimal("0.10"))
    with transaction() as conn:
        conn.execute(  # an old entry, outside 30 days
            "insert into ledger_entries (org_id, kind, provider, model, cost_usd, created_at) "
            "values (%(o)s, 'copy', 'anthropic', 't', 5, now() - interval '60 days')",
            {"o": user.org_id},
        )
    response = client.get(
        "/analytics", params={"org_id": str(user.org_id), "range": "30d"}, headers=bearer(user)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["bucket"] == "day" and len(body["spend_over_time"]) in (31, 32)
    assert Decimal(body["spend_usd"]) == Decimal("0.40")
    assert Decimal(body["spend_over_time"][-1]["spend_usd"]) == Decimal("0.40")
    assert [s["label"] for s in body["by_brand"]] == ["Lume"]
    assert {s["label"]: Decimal(s["spend_usd"]) for s in body["by_kind"]} == {
        "Copy": Decimal("0.30"),
        "Images": Decimal("0.10"),
    }
    assert body["pages_built"] == 1 and body["pages_published"] == 0
    assert Decimal(body["average_page_cost_usd"]) == Decimal("0.40")
    assert body["pages_by_status"] == [{"status": "needs_review", "count": 1}]

    year = client.get(
        "/analytics", params={"org_id": str(user.org_id), "range": "12m"}, headers=bearer(user)
    ).json()
    assert year["bucket"] == "month" and Decimal(year["spend_usd"]) == Decimal("5.40")
    assert [s["label"] for s in year["by_brand"]] == ["No brand", "Lume"]
