"""Hourly caps on starting work (B1.6c, D94): past the cap the API answers 429 with when to try
again; an identical job that's running already is reused, not counted."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.jobs import queue
from tests.conftest import DbUser, needs_db
from tests.test_api import bearer, cancel_jobs, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)


@pytest.fixture
def capped(monkeypatch: pytest.MonkeyPatch) -> Iterator[Settings]:
    settings = get_settings()
    monkeypatch.setattr(settings, "lp_limit_intake_per_hour", 2)
    yield settings


def start(client: TestClient, user: DbUser, url: str) -> Any:
    return client.post(
        "/jobs",
        json={"org_id": str(user.org_id), "kind": "brand_autofetch", "payload": {"url": url}},
        headers=bearer(user),
    )


@needs_db
def test_past_the_hourly_cap_starting_work_is_refused_with_when_to_try_again(
    client: TestClient, user: DbUser, capped: Settings
) -> None:
    try:
        assert start(client, user, "lume.test").status_code == 201
        assert start(client, user, "bre.test").status_code == 201
        refused = start(client, user, "fouru.test")
        assert refused.status_code == 429
        assert refused.json()["detail"].startswith(
            "This workspace has started 2 brand and product fetches in the last hour, its limit. "
            "Try again in 60 minutes."
        )
        assert 3500 <= int(refused.headers["Retry-After"]) <= 3600
    finally:
        cancel_jobs(user.org_id)


@needs_db
def test_a_reused_identical_job_isnt_counted_and_other_kinds_have_their_own_cap(
    user: DbUser, capped: Settings
) -> None:
    try:
        for _ in range(3):  # the same running job, three times: one job, under the cap
            queue.enqueue(
                org_id=user.org_id,
                kind="product_pull",
                payload={"url": "x"},
                created_by=user.id,
                dedupe_key="pull:x",
            )
        queue.enqueue(
            org_id=user.org_id, kind="product_pull", payload={"url": "y"}, created_by=user.id
        )
        with pytest.raises(queue.RateLimitedError):
            queue.enqueue(
                org_id=user.org_id, kind="product_briefing", payload={}, created_by=user.id
            )
        # Exports have their own cap.
        queue.enqueue(org_id=user.org_id, kind="export", payload={}, created_by=user.id)
    finally:
        cancel_jobs(user.org_id)
