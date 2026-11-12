"""Changing the offer pages sell (B7.3a, D147): one page, a batch's pages, or new variants of a
page (one copy per offer); and, once an offer is edited, every page selling it (B7.4, D149). Each
is an `offer_apply` job on the page (jobs/kinds/offer_apply.py), sharing the page's one-at-a-time
key with redrafts and Lander, and saved as one desk change."""

from typing import Any
from uuid import UUID

from psycopg import errors
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from app import builds, desk
from app.db import transaction
from app.jobs import queue

KIND = "offer_apply"


class OfferChangeError(Exception):
    """Why the offer can't be changed, in words for the person asking."""


class OfferNotFoundError(Exception):
    """No such live offer in this org."""


class OfferPageJob(BaseModel):
    """The latest offer change on a page: waiting (its place in line), running (its step), or how
    it ended."""

    id: UUID
    status: str
    step: str | None = None
    waiting: int | None = None
    error: str | None = None
    # Done: the lines it rewrote, and the ones to look at on the page (an old fact left, a price
    # or percent it made up, more dropped than the deal).
    changed: int | None = None
    checks: int | None = None


class OfferPage(BaseModel):
    build_id: UUID
    key: str
    title: str
    product: str
    copy_number: int | None
    status: str
    # Its record of the offer says something the offer no longer does (offer_out_of_date).
    out_of_date: bool
    # Why it can't be updated now (still building, failed, another change running), or None.
    reason: str | None
    job: OfferPageJob | None


class OfferPages(BaseModel):
    offer_id: UUID
    name: str
    pages: list[OfferPage]


def _offer(conn: Any, org_id: UUID, brand_id: UUID, offer_id: UUID | None) -> dict[str, Any] | None:
    try:
        return builds._offer(conn, org_id, brand_id, offer_id)
    except builds.BuildInputsMissingError as exc:
        raise OfferChangeError("That offer isn't available any more.") from exc


def _enqueue(
    conn: Any,
    org_id: UUID,
    build: dict[str, Any],
    user_id: UUID | None,
    offer_id: UUID | None,
    extra: dict[str, Any] | None = None,
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
                    **(extra or {}),
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
    return _start_each(org_id, user_id, offer_id, rows)


def _start_each(
    org_id: UUID,
    user_id: UUID | None,
    offer_id: UUID | None,
    rows: list[dict[str, Any]],
    *,
    only_out_of_date: bool = False,
) -> list[dict[str, Any]]:
    """Queues the change on each page, each on its own: one that can't take it now says why and
    the others go ahead. `only_out_of_date`: a page whose record already matches the offer is
    left alone (B7.4: nothing to rewrite, nothing to pay for)."""
    started: list[dict[str, Any]] = []
    for row in rows:
        try:
            with transaction() as conn:
                build = desk._load(conn, org_id, row["id"], lock=True)
                if build["status"] not in desk.EDITABLE:
                    raise OfferChangeError("It's still building, or it failed.")
                if build["busy_job"] is not None:
                    raise OfferChangeError(desk.REDRAFTING)
                if only_out_of_date and not _out_of_date(conn, org_id, row["id"]):
                    raise OfferChangeError("It's up to date.")
                job_id = _enqueue(conn, org_id, build, user_id, offer_id)
            started.append({"build_id": row["id"], "key": row["key"], "job_id": job_id})
        except (OfferChangeError, desk.DeskEditError, desk.DeskNotFoundError) as exc:
            reason = str(exc) or "It can't be changed now."
            started.append({"build_id": row["id"], "key": row["key"], "error": reason})
    return started


def _out_of_date(conn: Any, org_id: UUID, build_id: UUID) -> bool:
    row = conn.execute(
        """
        select public.offer_out_of_date(b.offer, o) as stale
        from builds b join offers o on o.id = b.offer_id
        where b.id = %(b)s and b.org_id = %(o)s
        """,
        {"b": build_id, "o": org_id},
    ).fetchone()
    return bool(row and row["stale"])


def _live_offer(conn: Any, org_id: UUID, offer_id: UUID) -> dict[str, Any]:
    row = conn.execute(
        "select id, name from offers where id = %(id)s and org_id = %(o)s and archived_at is null",
        {"id": offer_id, "o": org_id},
    ).fetchone()
    if row is None:
        raise OfferNotFoundError
    return dict(row)


def _why_not(status: str, busy: bool) -> str | None:
    if status in ("queued", "building"):
        return "Still building."
    if status == "failed":
        return "Its build failed."
    if busy:
        return "Another change is running on it."
    return None


def pages_using(org_id: UUID, offer_id: UUID) -> OfferPages:
    """The pages selling an offer (not in Trash), each saying whether it's out of date, whether it
    can be updated now, and its latest offer change (B7.4, D149). Copies follow their original."""
    with transaction() as conn:
        offer = _live_offer(conn, org_id, offer_id)
        rows = conn.execute(
            """
            select b.id, b.key, b.title, b.status, b.copy_number, p.name as product,
                   public.offer_out_of_date(b.offer, o) as out_of_date,
                   exists (select 1 from jobs x
                           where x.build_id = b.id and x.kind = any(%(kinds)s)
                             and x.kind <> %(kind)s and x.status in ('queued', 'running')) as busy,
                   j.id as job_id, j.status as job_status, j.queue as job_queue,
                   j.error->>'message' as job_error, j.result as job_result,
                   (select e.message from job_events e where e.job_id = j.id
                     order by e.ts desc limit 1) as step
            from offers o
            join builds b on b.offer_id = o.id and b.org_id = o.org_id and b.deleted_at is null
            join products p on p.id = b.product_id
            left join builds r on r.id = b.parent_build_id
            left join lateral (
              select id, status, queue, error, result from jobs
              where build_id = b.id and kind = %(kind)s order by created_at desc limit 1
            ) j on true
            where o.id = %(offer)s and o.org_id = %(o)s
            order by coalesce(r.created_at, b.created_at), b.copy_number nulls first
            """,
            {"offer": offer_id, "o": org_id, "kind": KIND, "kinds": list(desk.PAGE_JOBS)},
        ).fetchall()
        waiting = conn.execute(
            """
            select id, queue from jobs where org_id = %(o)s and status = 'queued'
            order by created_at, id
            """,
            {"o": org_id},
        ).fetchall()
    line: dict[UUID, int] = {}
    places: dict[str, int] = {}
    for w in waiting:  # a page's place among its workspace's jobs waiting in the same queue
        places[w["queue"]] = places.get(w["queue"], 0) + 1
        line[w["id"]] = places[w["queue"]]
    pages = []
    for r in rows:
        job = None
        if r["job_id"] is not None:
            result = r["job_result"] if r["job_status"] == "succeeded" else None
            job = OfferPageJob(
                id=r["job_id"],
                status=r["job_status"],
                step=r["step"] if r["job_status"] == "running" else None,
                waiting=line.get(r["job_id"]) if r["job_status"] == "queued" else None,
                error=r["job_error"] if r["job_status"] == "failed" else None,
                changed=len(result.get("changed") or []) if result else None,
                checks=sum(len(result.get(k) or []) for k in ("leftovers", "invented", "overreach"))
                if result
                else None,
            )
        page = OfferPage(
            build_id=r["id"], key=r["key"], title=r["title"], product=r["product"],
            copy_number=r["copy_number"], status=r["status"], out_of_date=bool(r["out_of_date"]),
            reason=_why_not(r["status"], bool(r["busy"])), job=job,
        )  # fmt: skip
        pages.append(page)
    return OfferPages(offer_id=offer_id, name=offer["name"], pages=pages)


def update_pages(
    org_id: UUID, offer_id: UUID, user_id: UUID | None, build_ids: list[UUID]
) -> list[dict[str, Any]]:
    """Updates the chosen pages selling an offer to the offer as it is now (B7.4, D149): the same
    change as Change offer, from the page's record of the offer to the offer's current terms. A
    page that's up to date, building or busy says why; the others go ahead."""
    with transaction() as conn:
        _live_offer(conn, org_id, offer_id)
        rows = conn.execute(
            """
            select id, key from builds
            where org_id = %(o)s and offer_id = %(offer)s and id = any(%(ids)s)
              and deleted_at is null
            order by created_at
            """,
            {"o": org_id, "offer": offer_id, "ids": build_ids},
        ).fetchall()
    if not rows:
        raise OfferChangeError("None of those pages sell this offer any more.")
    return _start_each(org_id, user_id, offer_id, rows, only_out_of_date=True)


def variants(
    org_id: UUID, build_id: UUID, user_id: UUID | None, offer_ids: list[UUID]
) -> list[dict[str, Any]]:
    """One copy of the page per offer (Duplicate, B7.1), each then changed to its offer. A copy
    names its offer at once, so the lists say "Copy 2 · Ten off" while its page is changed (owner,
    2026-11-11); the job is told the deal the page still states, and puts the copy's offer back to
    it if the change doesn't happen."""
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
        with transaction() as conn:
            build = desk._load(conn, org_id, copy["id"], lock=True)
            desk._check(conn, build, 1)
            stated = conn.execute(
                "select offer from builds where id = %(b)s and org_id = %(o)s",
                {"b": copy["id"], "o": org_id},
            ).fetchone()
            offer = _offer(conn, org_id, build["brand_id"], offer_id)
            conn.execute(
                "update builds set offer_id = %(oid)s, offer = %(offer)s "
                "where id = %(b)s and org_id = %(o)s",
                {
                    "oid": offer["id"] if offer else None,
                    "offer": Jsonb(offer) if offer else None,
                    "b": copy["id"], "o": org_id,
                },
            )  # fmt: skip
            job_id = _enqueue(
                conn, org_id, build, user_id, offer_id,
                extra={"from_offer": stated["offer"] if stated else None},
            )  # fmt: skip
        made.append({**copy, "job_id": job_id, "offer_id": offer_id})
    return made


def put_back(org_id: UUID, build_id: UUID, offer: dict[str, Any] | None) -> None:
    """A copy whose offer change didn't happen names the deal its page still states again (its
    offer by id only while that offer is still there)."""
    with transaction() as conn:
        desk.put_offer(conn, org_id, build_id, {"offer": offer})


def save(
    org_id: UUID,
    build_id: UUID,
    user_id: UUID | None,
    base_version: int,
    html: str,
    reason: str,
    offer: dict[str, Any] | None,
    report_offer: dict[str, Any] | None,
    before: dict[str, Any] | None = None,
) -> int:
    """Saves the change (the job calls this) as one desk change, with the page's new offer and
    the report's record of it. Returns the page's new version; refused if the page changed.

    Its undo step keeps the page's offer as it was (B7.4, D149), so Undo puts it back: the page's
    own record, or `before` for a copy that already names its new offer (Duplicate with offers)."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id, lock=True)
        if build["status"] not in desk.EDITABLE or build["page_version"] != base_version:
            raise desk.DeskConflictError
        kept = {**desk.offer_record(build), **(before or {})}
        stale = desk._change(conn, build, reason=reason, user_id=user_id, html=html, offer=kept)
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
