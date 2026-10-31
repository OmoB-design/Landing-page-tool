"""Job queue operations on the `jobs` and `job_events` tables (BUILD_SPEC §6.1, §6.2).

Every state change after a claim is guarded by `locked_by`, so a worker that lost its lease
(its job was reaped and claimed by another worker) cannot overwrite the newer attempt.
"""

from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg.rows import DictRow
from psycopg.types.json import Jsonb

from app.config import get_settings
from app.db import transaction
from app.jobs.models import EventLevel, Job, JobEvent

# Hourly caps per workspace on starting work (B1.6c, D94): each group's job kinds share a cap
# (LP_LIMIT_<GROUP>_PER_HOUR). Retries of a job and a reused identical job don't count.
LIMIT_GROUPS: dict[str, tuple[tuple[str, ...], str]] = {
    "builds": (("build",), "builds"),
    "redrafts": (("redraft",), "redrafts"),
    "intake": (
        ("brand_autofetch", "brand_assets", "product_pull", "product_briefing"),
        "brand and product fetches",
    ),
    "publishes": (
        ("publish_vercel", "publish_shopify_page", "unpublish_vercel", "unpublish_shopify_page"),
        "publishes",
    ),
    "exports": (("export",), "exports"),
    "clones": (("template_clone",), "page clones"),
    "analyses": (("template_analyze",), "page analyses"),
}


class RateLimitedError(Exception):
    """The workspace has started its hourly cap of this kind of work (the API answers 429)."""

    def __init__(self, message: str, retry_after_seconds: int) -> None:
        super().__init__(message)
        self.message = message
        self.retry_after_seconds = retry_after_seconds


def check_limit(conn: Connection[DictRow], org_id: UUID, kind: str) -> None:
    """Refuses a new job when the workspace started its cap of this group in the last hour; says
    when the oldest of those leaves the hour."""
    group = next(((name, spec) for name, spec in LIMIT_GROUPS.items() if kind in spec[0]), None)
    if group is None:
        return
    name, (kinds, noun) = group
    limit: int = getattr(get_settings(), f"lp_limit_{name}_per_hour")
    if limit <= 0:
        return
    row = conn.execute(
        """
        select ceil(extract(epoch from created_at + interval '1 hour' - now()))::int as wait
        from jobs
        where org_id = %(o)s and kind = any(%(k)s) and created_at > now() - interval '1 hour'
        order by created_at desc offset %(skip)s limit 1
        """,
        {"o": org_id, "k": list(kinds), "skip": limit - 1},
    ).fetchone()
    if row is None:
        return
    wait = max(int(row["wait"]), 1)
    minutes = max(1, -(-wait // 60))
    raise RateLimitedError(
        f"This workspace has started {limit} {noun} in the last hour, its limit. Try again in "
        f"{minutes} minute{'' if minutes == 1 else 's'}.",
        wait,
    )


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
    """Queues a job on this worker's queue (LP_JOB_QUEUE, D85). If a queued or running job in the
    org has the same dedupe key, returns that job instead (so one build is never paid for twice).
    Returns (job, created). With `conn`, the insert joins the caller's transaction (e.g. a build
    and its job are created together)."""
    job_queue = get_settings().lp_job_queue
    if conn is not None:
        check_limit(conn, org_id, kind)
        row = conn.execute(
            """
            insert into jobs (org_id, kind, payload, dedupe_key, build_id, max_attempts, created_by,
                              queue)
            values (%(org_id)s, %(kind)s, %(payload)s, %(dedupe_key)s, %(build_id)s,
                    %(max_attempts)s, %(created_by)s, %(queue)s)
            returning *
            """,
            {
                "org_id": org_id, "kind": kind, "payload": Jsonb(payload),
                "dedupe_key": dedupe_key, "build_id": build_id,
                "max_attempts": max_attempts, "created_by": created_by, "queue": job_queue,
            },
        ).fetchone()  # fmt: skip
        assert row is not None
        return Job.model_validate(row), True
    with transaction() as conn:
        reused = (
            conn.execute(
                "select 1 from jobs where org_id = %(o)s and dedupe_key = %(d)s "
                "and status in ('queued', 'running')",
                {"o": org_id, "d": dedupe_key},
            ).fetchone()
            if dedupe_key
            else None
        )
        if reused is None:  # an identical job running already is returned, not counted
            check_limit(conn, org_id, kind)
        row = conn.execute(
            """
            insert into jobs (org_id, kind, payload, dedupe_key, build_id, max_attempts, created_by,
                              queue)
            values (%(org_id)s, %(kind)s, %(payload)s, %(dedupe_key)s, %(build_id)s,
                    %(max_attempts)s, %(created_by)s, %(queue)s)
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
                "queue": job_queue,
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
    """Claims the oldest runnable job of this worker's queue (D85) and one of `kinds` (the kinds
    this worker can run) whose org has fewer than `org_limit` jobs running. The org limit is soft:
    two workers claiming at the same instant can exceed it by one."""
    with transaction() as conn:
        row = conn.execute(
            """
            with candidate as (
              select j.id from jobs j
              where j.status = 'queued' and j.queue = %(queue)s and j.run_after <= now()
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
            {
                "worker": worker_id,
                "org_limit": org_limit,
                "kinds": kinds,
                "queue": get_settings().lp_job_queue,
            },
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
    """Requeues this queue's running jobs whose heartbeat stopped (crashed or killed worker), or
    fails them when they have used all their attempts. Returns the jobs it changed."""
    with transaction() as conn:
        rows = conn.execute(
            """
            with stale as (
              select id from jobs
              where status = 'running' and queue = %(queue)s
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
            {
                "stale": stale_after_seconds,
                "lost": Jsonb(LOST_ERROR),
                "queue": get_settings().lp_job_queue,
            },
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
