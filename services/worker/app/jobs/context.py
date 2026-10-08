"""What a job handler gets: its job, progress reporting and an interruptible sleep."""

import threading
from dataclasses import dataclass, field
from typing import Any

from app.db import transaction
from app.jobs import queue
from app.jobs.errors import JobInterrupted
from app.jobs.models import EventLevel, Job


@dataclass
class JobContext:
    job: Job
    stopping: threading.Event = field(default_factory=threading.Event)

    def progress(
        self,
        message: str,
        *,
        data: dict[str, Any] | None = None,
        node: str | None = None,
        level: EventLevel = "info",
    ) -> None:
        """Records a progress event the UI shows live. Raises JobInterrupted if the worker is
        stopping, so handlers stop at a clean point and the job resumes elsewhere."""
        self.check_stopping()
        queue.add_event(self.job, message, level=level, node=node, data=data)

    def sleep(self, seconds: float) -> None:
        """Waits, but wakes up (and raises JobInterrupted) as soon as the worker is stopping."""
        if self.stopping.wait(seconds):
            raise JobInterrupted

    def check_stopping(self) -> None:
        if self.stopping.is_set():
            raise JobInterrupted

    def last_progress(self, key: str) -> Any | None:
        """The latest value of `data[key]` this job reported, e.g. the last finished step, so a
        retried or resumed job can continue where the previous attempt stopped."""
        with transaction() as conn:
            row = conn.execute(
                """
                select data -> %(key)s as value from job_events
                where job_id = %(job_id)s and org_id = %(org_id)s and data ? %(key)s
                order by id desc limit 1
                """,
                {"key": key, "job_id": self.job.id, "org_id": self.job.org_id},
            ).fetchone()
        return row["value"] if row else None
