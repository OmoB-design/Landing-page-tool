"""Job queue operations on the `jobs` and `job_events` tables (BUILD_SPEC §6.1, §6.2).

Every state change after a claim is guarded by `locked_by`, so a worker that lost its lease
(its job was reaped and claimed by another worker) cannot overwrite the newer attempt.
"""

from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg.rows import DictRow
from psycopg.types.json import Jsonb

from app.db import transaction
from app.jobs.models import EventLevel, Job, JobEvent

# Recorded on a job whose worker stopped heartbeating after its last allowed attempt.
LOST_MESSAGE = "The worker stopped responding during this job. Try again."
LOST_ERROR: dict[str, Any] = {"code": "worker_lost", "message": LOST_MESSAGE, "user_facing": True}


def enqueue(
    *,
    org_id: UUID,
    kind: str,
    payload: dict[str, Any],
    created_by: UUID | None,
    dedupe_key: str | None = None,
    build_id: UUID | None = None,
    max_attempts: int = 2,
    conn: Connection[DictRow] | None = None,
) -> tuple[Job, bool]:
    """Queues a job. If a queued or running job in the org has the same dedupe key, returns that
    job instead (so one build is never paid for twice). Returns (job, created). With `conn`, the
    insert joins the caller's transaction (e.g. a build and its job are created together)."""
    if conn is not None:
        row = conn.execute(
            """
            insert into jobs (org_id, kind, payload, dedupe_key, build_id, max_attempts, created_by)
            values (%(org_id)s, %(kind)s, %(payload)s, %(dedupe_key)s, %(build_id)s,
                    %(max_attempts)s, %(created_by)s)
            returning *
            """,
            {
                "org_id": org_id, "kind": kind, "payload": Jsonb(payload),
                "dedupe_key": dedupe_key, "build_id": build_id,
                "max_attempts": max_attempts, "created_by": created_by,
            },
        ).fetchone()  # fmt: skip
        assert row is not None
        return Job.model_validate(row), True
    with transaction() as conn:
        row = conn.execute(
            """
            insert into jobs (org_id, kind, payload, dedupe_key, build_id, max_attempts, created_by)
            values (%(org_id)s, %(kind)s, %(payload)s, %(dedupe_key)s, %(build_id)s,
                    %(max_attempts)s, %(created_by)s)
            on conflict (org_id, dedupe_key)
              where status in ('queued', 'running') and dedupe_key is not null
              do nothing
            returning *
            """,
            {
                "org_id": org_id,
                "kind": kind,
                "payload": Jsonb(payload),
                "dedupe_key": dedupe_key,
                "build_id": build_id,
                "max_attempts": max_attempts,
                "created_by": created_by,
            },
        ).fetchone()
        if row is not None:
            return Job.model_validate(row), True
        existing = conn.execute(
            """
            select * from jobs
            where org_id = %(org_id)s and dedupe_key = %(dedupe_key)s
              and status in ('queued', 'running')
            """,
            {"org_id": org_id, "dedupe_key": dedupe_key},
        ).fetchone()
    if existing is None:  # finished between the insert and the select: queue it again
        return enqueue(
            org_id=org_id,
            kind=kind,
            payload=payload,
            created_by=created_by,
            dedupe_key=dedupe_key,
            build_id=build_id,
            max_attempts=max_attempts,
        )
    return Job.model_validate(existing), False


def claim(worker_id: str, org_limit: int, kinds: list[str]) -> Job | None:
    """Claims the oldest runnable job of one of `kinds` (the kinds this worker can run) whose
    org has fewer than `org_limit` jobs running. The org limit is soft: two workers claiming at
    the same instant can exceed it by one."""
    with transaction() as conn:
        row = conn.execute(
            """
            with candidate as (
              select j.id from jobs j
              where j.status = 'queued' and j.run_after <= now()
                and j.kind = any(%(kinds)s)
                and (select count(*) from jobs r
                     where r.org_id = j.org_id and r.status = 'running') < %(org_limit)s
              order by j.created_at
              for update skip locked
              limit 1
            )
            update jobs set
              status = 'running', locked_by = %(worker)s, locked_at = now(),
              heartbeat_at = now(), attempts = jobs.attempts + 1,
              started_at = coalesce(jobs.started_at, now())
            from candidate where jobs.id = candidate.id
            returning jobs.*
            """,
            {"worker": worker_id, "org_limit": org_limit, "kinds": kinds},
        ).fetchone()
    return Job.model_validate(row) if row else None


def heartbeat(worker_id: str, job_ids: list[UUID]) -> None:
    if not job_ids:
        return
    with transaction() as conn:
        conn.execute(
            """
            update jobs set heartbeat_at = now()
            where id = any(%(ids)s) and locked_by = %(worker)s and status = 'running'
            """,
            {"ids": job_ids, "worker": worker_id},
        )


def complete(job: Job, worker_id: str, result: dict[str, Any] | None) -> Job | None:
    """Marks a running job succeeded. Returns None if this worker no longer holds the lease."""
    return _finish(
        job,
        worker_id,
        "status = 'succeeded', result = %(result)s, error = null",
        {"result": Jsonb(result) if result is not None else None},
    )


def fail(job: Job, worker_id: str, *, code: str, message: str, user_facing: bool) -> Job | None:
    """Marks a running job failed for good."""
    error = {"code": code, "message": message, "user_facing": user_facing}
    return _finish(job, worker_id, "status = 'failed', error = %(error)s", {"error": Jsonb(error)})


def retry(job: Job, worker_id: str, *, code: str, message: str, delay_seconds: float) -> Job | None:
    """Puts a failed attempt back in the queue to run again after a delay."""
    with transaction() as conn:
        row = conn.execute(
            """
            update jobs set
              status = 'queued', locked_by = null, locked_at = null, heartbeat_at = null,
              run_after = now() + make_interval(secs => %(delay)s), error = %(error)s
            where id = %(id)s and locked_by = %(worker)s and status = 'running'
            returning *
            """,
            {
                "id": job.id,
                "worker": worker_id,
                "delay": delay_seconds,
                "error": Jsonb({"code": code, "message": message, "user_facing": False}),
            },
        ).fetchone()
    return Job.model_validate(row) if row else None


def release(job: Job, worker_id: str) -> Job | None:
    """Gives an interrupted job back to the queue (worker shutdown). The interrupted attempt
    does not count against max_attempts."""
    with transaction() as conn:
        row = conn.execute(
            """
            update jobs set
              status = 'queued', locked_by = null, locked_at = null, heartbeat_at = null,
              run_after = now(), attempts = greatest(jobs.attempts - 1, 0)
            where id = %(id)s and locked_by = %(worker)s and status = 'running'
            returning *
            """,
            {"id": job.id, "worker": worker_id},
        ).fetchone()
    return Job.model_validate(row) if row else None


def reap(stale_after_seconds: float) -> list[Job]:
    """Requeues running jobs whose heartbeat stopped (crashed or killed worker), or fails them
    when they have used all their attempts. Returns the jobs it changed."""
    with transaction() as conn:
        rows = conn.execute(
            """
            with stale as (
              select id from jobs
              where status = 'running'
                and heartbeat_at < now() - make_interval(secs => %(stale)s)
              for update skip locked
            )
            update jobs j set
              status = (case when j.attempts < j.max_attempts then 'queued' else 'failed' end)
                       ::job_status,
              locked_by = null, locked_at = null, heartbeat_at = null, run_after = now(),
              finished_at = case when j.attempts < j.max_attempts then null else now() end,
              error = case when j.attempts < j.max_attempts then j.error else %(lost)s end
            from stale where j.id = stale.id
            returning j.*
            """,
            {"stale": stale_after_seconds, "lost": Jsonb(LOST_ERROR)},
        ).fetchall()
    return [Job.model_validate(row) for row in rows]


def add_event(
    job: Job,
    message: str,
    *,
    level: EventLevel = "info",
    node: str | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    with transaction() as conn:
        conn.execute(
            """
            insert into job_events (job_id, org_id, level, node, message, data)
            values (%(job_id)s, %(org_id)s, %(level)s, %(node)s, %(message)s, %(data)s)
            """,
            {
                "job_id": job.id,
                "org_id": job.org_id,
                "level": level,
                "node": node,
                "message": message,
                "data": Jsonb(data) if data is not None else None,
            },
        )


def events(job_id: UUID, org_id: UUID) -> list[JobEvent]:
    with transaction() as conn:
        rows = conn.execute(
            """
            select * from job_events
            where job_id = %(job_id)s and org_id = %(org_id)s order by id
            """,
            {"job_id": job_id, "org_id": org_id},
        ).fetchall()
    return [JobEvent.model_validate(row) for row in rows]


def get(job_id: UUID, org_id: UUID) -> Job | None:
    with transaction() as conn:
        row = conn.execute(
            "select * from jobs where id = %(id)s and org_id = %(org_id)s",
            {"id": job_id, "org_id": org_id},
        ).fetchone()
    return Job.model_validate(row) if row else None


def _finish(job: Job, worker_id: str, set_sql: str, params: dict[str, Any]) -> Job | None:
    with transaction() as conn:
        row = conn.execute(
            f"""
            update jobs set {set_sql},
              finished_at = now(), locked_by = null, locked_at = null, heartbeat_at = null
            where id = %(id)s and locked_by = %(worker)s and status = 'running'
            returning *
            """,  # set_sql is one of two literals in this module, never user input
            {"id": job.id, "worker": worker_id, **params},
        ).fetchone()
    return Job.model_validate(row) if row else None
