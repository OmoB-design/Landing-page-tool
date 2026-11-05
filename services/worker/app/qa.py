"""The preview check (BUILD_SPEC §11.1, B3.3a, D111): how a built page looks at desktop (1280 px)
and phone (390 px) widths, full length, and its share image (the top of the page, 1200 x 630:
the picture apps show when the page's link is shared).

A check is a job (`qa`): queued when a build finishes and from the review desk's Refresh. The
screenshots are kept beside the page (the private builds bucket, shown through signed links) and
the share image with the workspace's assets (public, so apps can fetch it). The build's report
says which page version they show, so the desk can say when the page has changed since. The
working page never changes: exports and publishes write the share image into the page as they
make it (engines/share.py).
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import structlog
from psycopg.types.json import Jsonb

from app import desk
from app.db import transaction
from app.engines import mobile, share
from app.fetch import browser
from app.jobs import queue
from app.models.qa import (
    PhoneCheckOut,
    PhoneExample,
    PhoneIssueOut,
    QaShot,
    QaStarted,
    QaState,
)
from app.providers import storage

log = structlog.get_logger()
KIND = "qa"


def running(conn: Any, build_id: UUID) -> UUID | None:
    row = conn.execute(
        """
        select id from jobs where build_id = %(b)s and kind = %(k)s
          and status in ('queued', 'running')
        order by created_at desc limit 1
        """,
        {"b": build_id, "k": KIND},
    ).fetchone()
    return row["id"] if row else None


def enqueue(conn: Any, org_id: UUID, build_id: UUID, user_id: UUID | None) -> UUID:
    """Queues a check for the page (one at a time per page): the running one if there is one."""
    busy = running(conn, build_id)
    if busy is not None:
        return busy
    job, _ = queue.enqueue(
        org_id=org_id,
        kind=KIND,
        payload={"build_id": str(build_id)},
        created_by=user_id,
        dedupe_key=f"qa:{build_id}",
        build_id=build_id,
        max_attempts=2,
        conn=conn,
    )
    return job.id


def start(org_id: UUID, build_id: UUID, user_id: UUID | None) -> QaStarted:
    """Refresh on the review desk: a new check of the page as it is now."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id)
        if build["status"] not in desk.EDITABLE:
            raise desk.DeskEditError("The page can be checked once it's built.")
        job_id = enqueue(conn, org_id, build_id, user_id)
    return QaStarted(job_id=job_id)


def after_build(org_id: UUID, build_id: UUID, user_id: UUID | None) -> None:
    """A finished build is checked straight away. Never fails the build."""
    try:
        with transaction() as conn:
            enqueue(conn, org_id, build_id, user_id)
    except Exception as exc:
        log.warning("preview check not queued", build=str(build_id), error=str(exc))


def run(org_id: UUID, build_id: UUID) -> dict[str, Any]:
    """Renders the page as it is now, keeps the screenshots and the share image, and records them
    in the report with the page version they show."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id)
        version = int(build["page_version"])
        html = desk._page(build)
    shots = browser.qa_shots(html)
    folder = f"{org_id}/{build_id}"
    desktop_path, phone_path = f"{folder}/qa-desktop.jpg", f"{folder}/qa-phone.jpg"
    storage.upload(desk.BUCKET, desktop_path, shots.desktop, "image/jpeg", upsert=True)
    storage.upload(desk.BUCKET, phone_path, shots.phone, "image/jpeg", upsert=True)
    share_url = storage.store_asset(org_id, shots.share, "image/jpeg").url
    record = {
        "version": version,
        "taken_at": datetime.now(UTC).isoformat(),
        "desktop": {
            "path": desktop_path, "width": browser.QA_DESKTOP, "height": shots.desktop_height,
        },
        "phone": {"path": phone_path, "width": browser.QA_PHONE, "height": shots.phone_height},
        "share": share_url,
        # The phone check at 390 px (B3.3b): what's wider than the screen, small text, small
        # buttons, overlapping text.
        "phone_check": (
            mobile.judge(shots.phone_measured).as_dict() if shots.phone_measured else None
        ),
    }  # fmt: skip
    with transaction() as conn:
        conn.execute(
            """
            update builds set report = jsonb_set(coalesce(report, '{}'::jsonb), '{qa}', %(qa)s)
            where id = %(b)s and org_id = %(o)s
            """,
            {"qa": Jsonb(record), "b": build_id, "o": org_id},
        )
    return {"build_id": str(build_id), **record}


def share_url(conn: Any, build_id: UUID) -> str | None:
    """The page's share image, if a check has made one."""
    row = conn.execute(
        "select report->'qa'->>'share' as share from builds where id = %(b)s", {"b": build_id}
    ).fetchone()
    return row["share"] if row and row["share"] else None


def _shot(record: dict[str, Any] | None, folder: str) -> QaShot | None:
    if not record or not record.get("path"):
        return None
    if not str(record["path"]).startswith(f"{folder}/"):  # only this page's own screenshots
        return None
    try:
        url = storage.signed_url(desk.BUCKET, str(record["path"]))
    except Exception:  # the file is gone: show no screenshot rather than a broken one
        return None
    return QaShot(url=url, width=int(record.get("width") or 0), height=int(record["height"]))


def status(org_id: UUID, build_id: UUID) -> QaState:
    """The page's latest check: its screenshots (signed links), share image, link preview text,
    the version it shows, and whether a check is under way."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id)
        busy = running(conn, build_id)
        fixing = conn.execute(
            """
            select id from jobs where build_id = %(b)s and kind = 'mobile_optimize'
              and status in ('queued', 'running')
            order by created_at desc limit 1
            """,
            {"b": build_id},
        ).fetchone()
        labels = desk._labels(conn, build["template_id"])
        html = desk._page(build)
    record = dict((build["report"] or {}).get("qa") or {})
    title, description = share.link_preview(html)
    taken = record.get("taken_at")
    return QaState(
        version=record.get("version"),
        page_version=int(build["page_version"]),
        taken_at=datetime.fromisoformat(taken) if taken else None,
        desktop=_shot(record.get("desktop"), f"{org_id}/{build_id}"),
        phone=_shot(record.get("phone"), f"{org_id}/{build_id}"),
        share=record.get("share"),
        title=title,
        description=description,
        running=busy,
        phone_check=_phone_check(record.get("phone_check"), labels),
        fixing=fixing["id"] if fixing else None,
    )


def _phone_check(found: dict[str, Any] | None, labels: dict[str, str]) -> PhoneCheckOut | None:
    """The stored phone check, its sections named as the template names them."""
    if not found:
        return None
    issues = []
    for issue in found.get("issues") or []:
        examples = [
            PhoneExample(
                text=str(e.get("text") or ""),
                section=labels.get(str(e.get("section") or ""), e.get("section")),
            )
            for e in issue.get("examples") or []
        ]
        issues.append(
            PhoneIssueOut(
                kind=issue["kind"], title=issue["title"], detail=issue["detail"],
                count=int(issue.get("count") or 0), examples=examples,
            )
        )  # fmt: skip
    return PhoneCheckOut(passed=bool(found.get("passed")), issues=issues)
