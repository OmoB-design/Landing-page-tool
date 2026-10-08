"""In-app notifications (BUILD_SPEC §15): one per finished job for the user who started it."""

from app.db import transaction
from app.jobs.models import Job

KEEP_PER_USER = 120


def notify_job_finished(job: Job, title: str) -> None:
    if job.created_by is None:
        return
    succeeded = job.status == "succeeded"
    message = (job.error or {}).get("message") if not succeeded else None
    with transaction() as conn:
        conn.execute(
            """
            insert into notifications (org_id, user_id, job_id, build_id, kind, title, body)
            values (%(org_id)s, %(user_id)s, %(job_id)s, %(build_id)s, %(kind)s, %(title)s,
                    %(body)s)
            """,
            {
                "org_id": job.org_id,
                "user_id": job.created_by,
                "job_id": job.id,
                "build_id": job.build_id,
                "kind": "job_succeeded" if succeeded else "job_failed",
                "title": f"{title} {'finished' if succeeded else 'failed'}",
                "body": message,
            },
        )
        conn.execute(
            """
            delete from notifications
            where user_id = %(user_id)s and id not in (
              select id from notifications where user_id = %(user_id)s
              order by created_at desc limit %(keep)s
            )
            """,
            {"user_id": job.created_by, "keep": KEEP_PER_USER},
        )
