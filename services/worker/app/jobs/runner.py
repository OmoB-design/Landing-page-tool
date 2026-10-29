"""The job loop (BUILD_SPEC §6.1): claim jobs, run them on a thread pool, heartbeat every few
seconds, requeue jobs whose worker died, and turn handler outcomes into job states.

Nothing it needs lives only in memory (D9): a killed worker's jobs are found by the reaper on
any worker and retried; a worker stopped cleanly gives its jobs back to the queue at once.
"""

import os
import socket
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from uuid import UUID

import psycopg
import structlog
from psycopg_pool import PoolTimeout

from app import trash
from app.config import Settings
from app.jobs import queue
from app.jobs.context import JobContext
from app.jobs.errors import JobInterrupted, UserFacingError
from app.jobs.models import Job
from app.jobs.registry import KINDS, JobKind
from app.notifications import notify_job_finished
from app.providers.ledger import cost_context

log = structlog.get_logger()

REAP_EVERY_SECONDS = 15.0
# Trash (D92): what has been there over 7 days is deleted for good, checked hourly (first an hour
# after the loop starts).
PURGE_EVERY_SECONDS = 3600.0
# The database can drop a connection (a network blip, the pooler restarting). The loop then waits
# and tries again, 1 s, 2 s, 4 s… up to a minute, instead of exiting.
DB_RETRY_FIRST_SECONDS = 1.0
DB_RETRY_MAX_SECONDS = 60.0
DB_ERRORS = (psycopg.OperationalError, psycopg.InterfaceError, PoolTimeout)
RETRY_DELAY_SECONDS = 5.0
GENERIC_FAILURE = "Something went wrong while running this job. Try again."


class Runner:
    def __init__(
        self,
        settings: Settings,
        kinds: dict[str, JobKind] | None = None,
        worker_id: str | None = None,
    ) -> None:
        self.settings = settings
        self.kinds = kinds if kinds is not None else KINDS
        self.worker_id = worker_id or f"{socket.gethostname()}:{os.getpid()}"
        self.stopping = threading.Event()
        self._pool = ThreadPoolExecutor(
            max_workers=settings.lp_worker_concurrency, thread_name_prefix="job"
        )
        self._running: dict[UUID, Future[None]] = {}
        self._lock = threading.Lock()

    # ── loop ──────────────────────────────────────────────────────────────────
    def run_forever(self) -> None:
        log.info("worker started", worker=self.worker_id)
        heartbeat = threading.Thread(target=self._heartbeat_loop, name="heartbeat", daemon=True)
        heartbeat.start()
        last_reap = 0.0
        last_purge = time.monotonic()
        failures = 0
        while not self.stopping.is_set():
            try:
                if time.monotonic() - last_reap >= REAP_EVERY_SECONDS:
                    self.reap()
                    last_reap = time.monotonic()
                if time.monotonic() - last_purge >= PURGE_EVERY_SECONDS:
                    last_purge = time.monotonic()
                    purged = trash.purge_expired()
                    if purged:
                        log.info("emptied trash", items=purged)
                claimed = self._free_slots() > 0 and self.claim_and_submit()
            except DB_ERRORS as exc:
                failures += 1
                delay = min(DB_RETRY_MAX_SECONDS, DB_RETRY_FIRST_SECONDS * 2 ** (failures - 1))
                log.warning("database unreachable; trying again", error=str(exc), retry_in=delay)
                self.stopping.wait(delay)
                continue
            if failures:
                log.info("database reachable again", after=failures)
                failures = 0
            if claimed:
                continue  # look for more work straight away
            self.stopping.wait(self.settings.lp_poll_seconds)
        self._shutdown()

    def stop(self) -> None:
        self.stopping.set()

    def claim_and_submit(self) -> bool:
        job = queue.claim(self.worker_id, self.settings.lp_org_concurrency, list(self.kinds))
        if job is None:
            return False
        with self._lock:
            self._running[job.id] = self._pool.submit(self.execute, job)
        return True

    def reap(self) -> None:
        for job in queue.reap(self.settings.lp_stale_after_seconds):
            if job.status == "queued":
                queue.add_event(job, "The worker stopped responding; retrying.", level="warn")
                log.warning("requeued lost job", job=str(job.id), kind=job.kind)
            else:
                queue.add_event(job, queue.LOST_MESSAGE, level="error")
                notify_job_finished(job, self._title(job))
                log.error("failed lost job", job=str(job.id), kind=job.kind)

    # ── one job ───────────────────────────────────────────────────────────────
    def execute(self, job: Job) -> None:
        """Runs one claimed job to a final state. Never raises."""
        log_ = log.bind(job=str(job.id), kind=job.kind, attempt=job.attempts)
        try:
            kind = self.kinds.get(job.kind)
            if kind is None:
                raise UserFacingError(f"Unknown job kind: {job.kind}.", code="unknown_kind")
            queue.add_event(job, f"Started (attempt {job.attempts} of {job.max_attempts})")
            # Every provider call in the job is recorded against its org, job and build (D13).
            with cost_context(job.org_id, job_id=job.id, build_id=job.build_id):
                result = kind.handler(JobContext(job=job, stopping=self.stopping))
            finished = queue.complete(job, self.worker_id, result)
            if finished:
                queue.add_event(job, "Finished")
                notify_job_finished(finished, kind.title)
                log_.info("job succeeded")
        except JobInterrupted:
            if queue.release(job, self.worker_id):
                queue.add_event(job, "Paused: the worker is restarting. It will resume shortly.")
            log_.info("job released on shutdown")
        except UserFacingError as exc:
            self._fail(job, code=exc.code, message=exc.message, user_facing=True)
            log_.info("job failed", code=exc.code)
        except Exception as exc:
            log_.exception("job crashed")
            if job.attempts < job.max_attempts:
                if queue.retry(
                    job,
                    self.worker_id,
                    code="internal_error",
                    message=str(exc),
                    delay_seconds=RETRY_DELAY_SECONDS * job.attempts,
                ):
                    queue.add_event(job, "Something went wrong; retrying.", level="warn")
            else:
                self._fail(job, code="internal_error", message=GENERIC_FAILURE, user_facing=True)
        finally:
            with self._lock:
                self._running.pop(job.id, None)

    def _fail(self, job: Job, *, code: str, message: str, user_facing: bool) -> None:
        failed = queue.fail(
            job, self.worker_id, code=code, message=message, user_facing=user_facing
        )
        if failed:
            queue.add_event(job, message, level="error")
            notify_job_finished(failed, self._title(job))

    # ── internals ─────────────────────────────────────────────────────────────
    def _title(self, job: Job) -> str:
        kind = self.kinds.get(job.kind)
        return kind.title if kind else job.kind

    def _free_slots(self) -> int:
        with self._lock:
            return self.settings.lp_worker_concurrency - len(self._running)

    def _heartbeat_loop(self) -> None:
        while not self.stopping.wait(self.settings.lp_heartbeat_seconds):
            with self._lock:
                ids = list(self._running)
            try:
                queue.heartbeat(self.worker_id, ids)
            except Exception:
                log.exception("heartbeat failed")

    def _shutdown(self) -> None:
        log.info("worker stopping", running=len(self._running))
        # Handlers see `stopping` at their next progress() or sleep() and release their job.
        self._pool.shutdown(wait=True, cancel_futures=True)
        log.info("worker stopped")
