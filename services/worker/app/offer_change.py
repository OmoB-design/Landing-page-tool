"""Changing the offer pages sell (B7.3a, D147): one page, a batch's pages, or new variants of a
page (one copy per offer). Each is an `offer_apply` job on the page (jobs/kinds/offer_apply.py),
sharing the page's one-at-a-time key with redrafts and Lander, and saved as one desk change."""

from typing import Any
from uuid import UUID

from psycopg import errors
from psycopg.types.json import Jsonb

from app import builds, desk
from app.db import transaction
from app.jobs import queue

KIND = "offer_apply"


class OfferChangeError(Exception):
    """Why the offer can't be changed, in words for the person asking."""


def _offer(conn: Any, org_id: UUID, brand_id: UUID, offer_id: UUID | None) -> dict[str, Any] | None:
    try:
        return builds._offer(conn, org_id, brand_id, offer_id)
    except builds.BuildInputsMissingError as exc:
        raise OfferChangeError("That offer isn't available any more.") from exc


def _enqueue(
    conn: Any, org_id: UUID, build: dict[str, Any], user_id: UUID | None, offer_id: UUID | None
) -> UUID:
    try:
        with conn.transaction():  # a savepoint: another page job started this moment wins
            job, _ = queue.enqueue(
                org_id=org_id,
                kind=KIND,
                payload={
                    "build_id": str(build["id"]),
                    "base_version": build["page_version"],
                    "offer_id": str(offer_id) if offer_id else None,
                },
                created_by=user_id,
                dedupe_key=f"redraft:{build['id']}",
                build_id=build["id"],
                max_attempts=1,
                conn=conn,
            )
    except errors.UniqueViolation as exc:
        raise OfferChangeError(desk.REDRAFTING) from exc
    return job.id


def start(
    org_id: UUID, build_id: UUID, user_id: UUID | None, offer_id: UUID | None, base_version: int
) -> UUID:
    """Queues the change on one page (None: no offer). Refused while the page builds, changed
    since it was shown, or has another page job running."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id, lock=True)
        desk._check(conn, build, base_version)
        _offer(conn, org_id, build["brand_id"], offer_id)
        return _enqueue(conn, org_id, build, user_id, offer_id)


def start_batch(
    org_id: UUID,
    batch_id: UUID,
    user_id: UUID | None,
    offer_id: UUID | None,
    build_ids: list[UUID],
) -> list[dict[str, Any]]:
    """Queues the change on the chosen pages of a batch, each on its own: a page that can't take
    it now (building, busy) says why and the others go ahead."""
    with transaction() as conn:
        rows = conn.execute(
            """
            select id, key, brand_id from builds
            where org_id = %(o)s and batch_id = %(batch)s and id = any(%(ids)s)
              and deleted_at is null
            order by created_at
            """,
            {"o": org_id, "batch": batch_id, "ids": build_ids},
        ).fetchall()
        if not rows:
            raise OfferChangeError("None of those pages are in this batch.")
        _offer(conn, org_id, rows[0]["brand_id"], offer_id)
    started: list[dict[str, Any]] = []
    for row in rows:
        try:
            with transaction() as conn:
                build = desk._load(conn, org_id, row["id"], lock=True)
                if build["status"] not in desk.EDITABLE:
                    raise OfferChangeError("It's still building, or it failed.")
                if build["busy_job"] is not None:
                    raise OfferChangeError(desk.REDRAFTING)
                job_id = _enqueue(conn, org_id, build, user_id, offer_id)
            started.append({"build_id": row["id"], "key": row["key"], "job_id": job_id})
        except (OfferChangeError, desk.DeskEditError, desk.DeskNotFoundError) as exc:
            reason = str(exc) or "It can't be changed now."
            started.append({"build_id": row["id"], "key": row["key"], "error": reason})
    return started


def variants(
    org_id: UUID, build_id: UUID, user_id: UUID | None, offer_ids: list[UUID]
) -> list[dict[str, Any]]:
    """One copy of the page per offer (Duplicate, B7.1), each then changed to its offer."""
    with transaction() as conn:
        brand = conn.execute(
            "select brand_id from builds where id = %(b)s and org_id = %(o)s",
            {"b": build_id, "o": org_id},
        ).fetchone()
        if brand is None:
            raise builds.BuildNotFoundError
        for offer_id in offer_ids:
            _offer(conn, org_id, brand["brand_id"], offer_id)
    made: list[dict[str, Any]] = []
    for offer_id in dict.fromkeys(offer_ids):
        copy = builds.duplicate_build(org_id=org_id, build_id=build_id, created_by=user_id)
        job_id = start(org_id, copy["id"], user_id, offer_id, base_version=1)
        made.append({**copy, "job_id": job_id, "offer_id": offer_id})
    return made


def save(
    org_id: UUID,
    build_id: UUID,
    user_id: UUID | None,
    base_version: int,
    html: str,
    reason: str,
    offer: dict[str, Any] | None,
    report_offer: dict[str, Any] | None,
) -> int:
    """Saves the change (the job calls this) as one desk change, with the page's new offer and
    the report's record of it. Returns the page's new version; refused if the page changed."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id, lock=True)
        if build["status"] not in desk.EDITABLE or build["page_version"] != base_version:
            raise desk.DeskConflictError
        stale = desk._change(conn, build, reason=reason, user_id=user_id, html=html)
        conn.execute(
            """
            update builds set offer_id = %(oid)s, offer = %(offer)s,
                   report = case when %(record)s::jsonb is null
                     then report #- '{finalize,offer}'
                     else jsonb_set(report, '{finalize}',
                            coalesce(report->'finalize', '{}'::jsonb)
                            || jsonb_build_object('offer', %(record)s::jsonb))
                   end
            where id = %(b)s and org_id = %(o)s
            """,
            {
                "oid": offer["id"] if offer else None,
                "offer": Jsonb(offer) if offer else None,
                "record": Jsonb(report_offer) if report_offer else None,
                "b": build_id, "o": org_id,
            },
        )  # fmt: skip
        version = int(build["page_version"]) + 1
    desk._remove(stale)
    return version
