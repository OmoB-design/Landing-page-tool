"""Job queue and runner behaviour against the local database. Test-only job kinds keep these
jobs away from a dev worker that may be running at the same time (it claims only its kinds)."""

import uuid
from decimal import Decimal
from typing import Any

import pytest
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.db import transaction
from app.jobs import queue
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.jobs.kinds import noop_demo
from app.jobs.registry import JobKind
from app.jobs.runner import GENERIC_FAILURE, Runner
from app.providers import storage
from tests.conftest import DbUser, event_messages, job_row, needs_db, notifications_for

pytestmark = needs_db


class Empty(BaseModel):
    pass


def ok_handler(ctx: JobContext) -> dict[str, Any]:
    ctx.progress("Half way", data={"step": 1, "total": 2})
    return {"ok": True}


def user_error_handler(ctx: JobContext) -> None:
    raise UserFacingError("That product URL is not reachable.", code="bad_url")


def crash_handler(ctx: JobContext) -> None:
    raise RuntimeError("boom")


def stop_handler(ctx: JobContext) -> None:
    ctx.stopping.set()  # as if Ctrl+C arrived mid-job
    ctx.progress("never recorded")


def kind(name: str, handler: Any, max_attempts: int = 2) -> JobKind:
    return JobKind(
        name=name, title=name.replace("_", " ").title(), handler=handler,
        payload_model=Empty, max_attempts=max_attempts,
    )  # fmt: skip


KINDS = {
    k.name: k
    for k in [
        kind("test_ok", ok_handler),
        kind("test_user_error", user_error_handler),
        kind("test_crash", crash_handler),
        kind("test_stop", stop_handler),
        kind("test_demo", noop_demo.run),
    ]
}


def make_runner(settings: Settings) -> Runner:
    return Runner(settings, kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:8]}")


def enqueue(user: DbUser, kind_name: str, **extra: Any) -> uuid.UUID:
    job, created = queue.enqueue(
        org_id=user.org_id,
        kind=kind_name,
        payload=extra.pop("payload", {}),
        created_by=user.id,
        **extra,
    )
    assert created
    return job.id


def run_claimed(runner: Runner, job_id: uuid.UUID) -> None:
    """Claims `job_id` (failing the test if another job comes first) and runs it inline."""
    job = queue.claim(runner.worker_id, 2, [job_row(job_id)["kind"]])
    assert job is not None and job.id == job_id
    runner.execute(job)


# ── enqueue and claim ─────────────────────────────────────────────────────────
def test_dedupe_returns_the_active_job(user: DbUser) -> None:
    first, created = queue.enqueue(
        org_id=user.org_id, kind="test_ok", payload={}, created_by=user.id, dedupe_key="k1"
    )
    again, created_again = queue.enqueue(
        org_id=user.org_id, kind="test_ok", payload={}, created_by=user.id, dedupe_key="k1"
    )
    assert created and not created_again
    assert again.id == first.id


def test_dedupe_allows_a_new_job_once_the_old_one_finished(
    user: DbUser, fast_settings: Settings
) -> None:
    first = enqueue(user, "test_ok", dedupe_key="k2")
    run_claimed(make_runner(fast_settings), first)
    second, created = queue.enqueue(
        org_id=user.org_id, kind="test_ok", payload={}, created_by=user.id, dedupe_key="k2"
    )
    assert created and second.id != first


def test_claim_skips_jobs_scheduled_for_later(user: DbUser) -> None:
    job_id = enqueue(user, "test_ok")
    with transaction() as conn:
        conn.execute(
            "update jobs set run_after = now() + interval '1 hour' where id = %(id)s",
            {"id": job_id},
        )
    assert queue.claim("w", 2, ["test_ok"]) is None


def test_claim_respects_the_org_limit(user: DbUser) -> None:
    first = enqueue(user, "test_ok")
    enqueue(user, "test_ok")
    claimed = queue.claim("w", 1, ["test_ok"])
    assert claimed is not None and claimed.id == first
    assert queue.claim("w", 1, ["test_ok"]) is None  # one already running in the org


def test_claim_only_takes_kinds_the_worker_knows(user: DbUser) -> None:
    enqueue(user, "test_ok")
    assert queue.claim("w", 2, ["some_other_kind"]) is None


def test_claim_only_takes_jobs_from_its_own_queue(user: DbUser) -> None:
    live = enqueue(user, "test_ok")
    with transaction() as conn:  # as if the live worker had queued it
        conn.execute("update jobs set queue = 'main' where id = %(id)s", {"id": live})
    assert queue.claim("w", 2, ["test_ok"]) is None
    ours = enqueue(user, "test_ok")
    claimed = queue.claim("w", 2, ["test_ok"])
    assert claimed is not None and claimed.id == ours
    assert claimed.queue == get_settings().lp_job_queue != "main"


# ── runner outcomes ───────────────────────────────────────────────────────────
def test_success_records_events_result_and_a_notification(
    user: DbUser, fast_settings: Settings
) -> None:
    job_id = enqueue(user, "test_ok")
    run_claimed(make_runner(fast_settings), job_id)

    row = job_row(job_id)
    assert row["status"] == "succeeded"
    assert row["result"] == {"ok": True}
    assert row["locked_by"] is None and row["finished_at"] is not None
    assert event_messages(job_id) == ["Started (attempt 1 of 2)", "Half way", "Finished"]
    [note] = notifications_for(user.id)
    assert note["kind"] == "job_succeeded" and note["title"] == "Test Ok finished"


def test_user_facing_error_fails_without_retry(user: DbUser, fast_settings: Settings) -> None:
    job_id = enqueue(user, "test_user_error")
    run_claimed(make_runner(fast_settings), job_id)

    row = job_row(job_id)
    assert row["status"] == "failed" and row["attempts"] == 1
    assert row["error"] == {
        "code": "bad_url",
        "message": "That product URL is not reachable.",
        "user_facing": True,
    }
    [note] = notifications_for(user.id)
    assert note["kind"] == "job_failed"
    assert note["body"] == "That product URL is not reachable."


def test_crash_retries_then_fails_with_a_generic_message(
    user: DbUser, fast_settings: Settings
) -> None:
    job_id = enqueue(user, "test_crash")
    runner = make_runner(fast_settings)
    run_claimed(runner, job_id)

    row = job_row(job_id)
    assert row["status"] == "queued" and row["attempts"] == 1
    assert row["run_after"] > row["created_at"]  # backed off
    assert notifications_for(user.id) == []

    with transaction() as conn:
        conn.execute("update jobs set run_after = now() where id = %(id)s", {"id": job_id})
    run_claimed(runner, job_id)
    row = job_row(job_id)
    assert row["status"] == "failed" and row["attempts"] == 2
    assert row["error"]["message"] == GENERIC_FAILURE
    assert "boom" not in str(row["error"])  # internals stay in the logs
    assert len(notifications_for(user.id)) == 1


def test_shutdown_releases_the_job_without_using_an_attempt(
    user: DbUser, fast_settings: Settings
) -> None:
    job_id = enqueue(user, "test_stop")
    run_claimed(make_runner(fast_settings), job_id)

    row = job_row(job_id)
    assert row["status"] == "queued" and row["attempts"] == 0 and row["locked_by"] is None
    assert event_messages(job_id)[-1].startswith("Paused")


def test_finishing_needs_the_lease(user: DbUser) -> None:
    job_id = enqueue(user, "test_ok")
    job = queue.claim("worker-a", 2, ["test_ok"])
    assert job is not None and job.id == job_id
    assert queue.complete(job, "worker-b", {"stolen": True}) is None
    assert job_row(job_id)["status"] == "running"


@pytest.mark.parametrize(("attempts", "expected"), [(1, "queued"), (2, "failed")])
def test_reaper_requeues_or_fails_jobs_whose_worker_died(
    user: DbUser, fast_settings: Settings, attempts: int, expected: str
) -> None:
    job_id = enqueue(user, "test_ok")
    with transaction() as conn:
        conn.execute(
            """
            update jobs set status = 'running', locked_by = 'dead-worker', attempts = %(a)s,
              heartbeat_at = now() - interval '5 minutes'
            where id = %(id)s
            """,
            {"id": job_id, "a": attempts},
        )
    make_runner(fast_settings).reap()

    row = job_row(job_id)  # assert on the row: a dev worker's reaper may get there first
    assert row["status"] == expected and row["locked_by"] is None
    if expected == "failed":
        assert row["error"]["code"] == "worker_lost"
        assert len(notifications_for(user.id)) == 1


def test_heartbeat_keeps_a_running_job_alive(user: DbUser) -> None:
    job_id = enqueue(user, "test_ok")
    job = queue.claim("worker-a", 2, ["test_ok"])
    assert job is not None
    with transaction() as conn:
        conn.execute(
            "update jobs set heartbeat_at = now() - interval '5 minutes' where id = %(id)s",
            {"id": job_id},
        )
    queue.heartbeat("worker-a", [job_id])
    queue.reap(60)
    assert job_row(job_id)["status"] == "running"


# ── noop_demo ────────────────────────────────────────────────────────────────
def test_demo_job_reports_each_step(user: DbUser, fast_settings: Settings) -> None:
    job_id = enqueue(user, "test_demo", payload={"steps": 5, "step_seconds": 0})
    run_claimed(make_runner(fast_settings), job_id)
    messages = event_messages(job_id)
    steps = [m for m in messages if m.startswith("Step")]
    assert steps == [f"Step {n} of 5 done" for n in range(1, 6)]
    assert "Asked the AI (mock/claude-haiku-5-5): Mock reply from claude-haiku-5-5." in messages
    result = job_row(job_id)["result"]
    try:
        assert result["steps"] == 5
        assert result["ledger_rows"] == 2 and Decimal(result["cost_usd"]) == 0  # mock AI + image
        assert result["image_url"].endswith(".jpg")
    finally:
        if result.get("image_url"):
            storage.remove("assets", [result["image_url"].split("/public/assets/", 1)[1]])


def test_demo_job_resumes_after_the_last_finished_step(
    user: DbUser, fast_settings: Settings
) -> None:
    job_id = enqueue(user, "test_demo", payload={"steps": 5, "step_seconds": 0})
    job = queue.get(job_id, user.org_id)
    assert job is not None
    queue.add_event(job, "Step 3 of 5 done", data={"step": 3, "total": 5})

    run_claimed(make_runner(fast_settings), job_id)
    messages = event_messages(job_id)
    assert "Resuming after step 3" in messages
    assert "Step 4 of 5 done" in messages and "Step 5 of 5 done" in messages
    assert messages.count("Step 3 of 5 done") == 1


def test_demo_job_can_fail_on_purpose(user: DbUser, fast_settings: Settings) -> None:
    job_id = enqueue(user, "test_demo", payload={"steps": 5, "step_seconds": 0, "fail_at": 2})
    run_claimed(make_runner(fast_settings), job_id)
    row = job_row(job_id)
    assert row["status"] == "failed" and row["error"]["code"] == "demo_failure"


def test_runner_loop_claims_and_finishes_jobs(user: DbUser, fast_settings: Settings) -> None:
    import threading
    import time

    job_ids = [enqueue(user, "test_ok") for _ in range(3)]
    runner = make_runner(fast_settings)
    thread = threading.Thread(target=runner.run_forever)
    thread.start()
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if all(job_row(j)["status"] == "succeeded" for j in job_ids):
                break
            time.sleep(0.1)
    finally:
        runner.stop()
        thread.join(timeout=10)
    assert [job_row(j)["status"] for j in job_ids] == ["succeeded"] * 3
