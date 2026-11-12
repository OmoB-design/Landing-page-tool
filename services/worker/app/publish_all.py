"""Approve and publish all (B7.3b, D148): a batch's pages, after an offer change or edits, approved
and put live again where they were live, in one go.

The plan says, page by page, what would happen: approve it and publish it again (to each place it
was live: Vercel, a Shopify draft, editable Shopify sections), approve it only (never live: it
stays unpublished, owner 2026-11-10), publish it again (approved, live with an older version), or
nothing (live and up to date) or why not (still building, failed, a check that can't be passed,
the connection missing). Starting it approves the chosen pages, then sends each brand's Vercel
pages out in one deployment (so they go live together and can't overwrite each other) and each
Shopify page on its own. A page that can't be approved or published says why; the others go on.
"""

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

from app import desk, publishing
from app.db import transaction
from app.models.publishing import GateBlocker

Action = Literal["approve_and_publish", "approve", "publish", "none", "skip"]
DESTINATIONS = ("vercel", "shopify_page", "shopify_editable")
PLACES = {"vercel": "Vercel", "shopify_page": "Shopify", "shopify_editable": "Shopify (editable)"}


class PagePlan(BaseModel):
    build_id: UUID
    key: str
    title: str
    copy_number: int | None
    status: str
    page_version: int
    action: Action
    # Where it goes live again (where it was live), or nowhere.
    destinations: list[str]
    reason: str | None
    gate: list[GateBlocker]


class PublishAllPlan(BaseModel):
    pages: list[PagePlan]
    # Pages to publish that need "Publish anyway" (checks that may be passed).
    needs_override: bool


class PageStarted(BaseModel):
    build_id: UUID
    key: str
    approved: bool
    jobs: dict[str, UUID]  # destination → its publish job
    error: str | None = None


class PublishAllStarted(BaseModel):
    pages: list[PageStarted]


def _live(conn: Any, org_id: UUID, build_id: UUID) -> tuple[dict[str, int | None], bool]:
    """Where the page is live (destination → the page version it shows), and whether a publish
    is under way."""
    rows = conn.execute(
        """
        select destination, status, details from publications
        where build_id = %(b)s and org_id = %(o)s order by created_at desc
        """,
        {"b": build_id, "o": org_id},
    ).fetchall()
    pending = any(r["status"] == "pending" for r in rows)
    live: dict[str, int | None] = {}
    for destination in DESTINATIONS:
        finished = next(
            (
                r
                for r in rows
                if r["destination"] == destination and r["status"] in ("succeeded", "unpublished")
            ),
            None,
        )
        if finished and finished["status"] == "succeeded":
            live[destination] = (finished["details"] or {}).get("page_version")
    return live, pending


def _plan_page(conn: Any, org_id: UUID, build_id: UUID) -> PagePlan:
    build = publishing._load(conn, org_id, build_id)
    row = conn.execute(
        "select title, copy_number from builds where id = %(b)s", {"b": build_id}
    ).fetchone()
    live, pending = _live(conn, org_id, build_id)
    found = publishing._blockers(build)
    blockers = [
        GateBlocker(code=b.code, message=b.message, overridable=b.overridable) for b in found
    ]
    status, version = build["status"], int(build["page_version"])

    def plan(action: Action, destinations: list[str], reason: str | None = None) -> PagePlan:
        return PagePlan(
            build_id=build_id, key=build["key"], title=row["title"] if row else build["key"],
            copy_number=row["copy_number"] if row else None, status=status, page_version=version,
            action=action, destinations=destinations, reason=reason,
            gate=blockers if destinations else [],
        )  # fmt: skip

    if status in ("queued", "building"):
        return plan("skip", [], "Still building.")
    if status == "failed":
        return plan("skip", [], "Its build failed.")
    busy = conn.execute(
        """
        select 1 from jobs where build_id = %(b)s and org_id = %(o)s
          and kind = any(%(kinds)s) and status in ('queued', 'running')
        """,
        {"b": build_id, "o": org_id, "kinds": list(desk.PAGE_JOBS)},
    ).fetchone()
    if busy:
        return plan("skip", [], "It's being changed now.")
    if pending:
        return plan("skip", [], "It's being published now.")
    stale = [d for d, shown in live.items() if shown != version or status != "published"]
    approve = status == "needs_review"
    if not live:
        return plan("approve" if approve else "none", [], None if approve else "Never live.")
    if not stale:
        return plan("none", [], "Live and up to date.")
    # Where it can't go again: the connection is gone, or a check can't be passed.
    reason = None
    usable: list[str] = []
    store = conn.execute(
        "select theme_secret_id from store_connections where brand_id = %(b)s "
        "and org_id = %(o)s and status = 'connected'",
        {"b": build["brand_id"], "o": org_id},
    ).fetchone()
    vercel = conn.execute(
        "select 1 from integrations where org_id = %(o)s and kind = 'vercel'", {"o": org_id}
    ).fetchone()
    for destination in stale:
        if destination == "vercel" and vercel is None:
            reason = "Vercel isn't connected any more."
        elif destination != "vercel" and store is None:
            reason = "The brand's Shopify store isn't connected any more."
        elif destination == "shopify_editable" and not store["theme_secret_id"]:
            reason = "The store's Theme Access password is missing."
        else:
            usable.append(destination)
    stuck = [b for b in found if not b.overridable]
    if stuck:
        usable, reason = [], f"Can't go live: {stuck[0].message}"
    if not usable:
        return plan("approve" if approve else "skip", [], reason)
    return plan("approve_and_publish" if approve else "publish", usable, reason)


def plan(org_id: UUID, batch_id: UUID) -> PublishAllPlan:
    """What Approve and publish all would do with each of the batch's pages."""
    with transaction() as conn:
        ids = [
            r["id"]
            for r in conn.execute(
                """
                select id from builds
                where org_id = %(o)s and batch_id = %(b)s and deleted_at is null
                order by coalesce(parent_build_id, id), copy_number nulls first, created_at
                """,
                {"o": org_id, "b": batch_id},
            ).fetchall()
        ]
    return _plan_pages(org_id, ids)


def plan_offer(org_id: UUID, offer_id: UUID) -> PublishAllPlan:
    """What Approve and publish all would do with the pages selling an offer (B7.4, D149): one
    brand's, from any of its batches, in the order the update window lists them."""
    with transaction() as conn:
        ids = [
            r["id"]
            for r in conn.execute(
                """
                select b.id from builds b
                left join builds r on r.id = b.parent_build_id
                where b.org_id = %(o)s and b.offer_id = %(offer)s and b.deleted_at is null
                order by coalesce(r.created_at, b.created_at), b.copy_number nulls first
                """,
                {"o": org_id, "offer": offer_id},
            ).fetchall()
        ]
    return _plan_pages(org_id, ids)


def _plan_pages(org_id: UUID, ids: list[UUID]) -> PublishAllPlan:
    if not ids:
        raise publishing.PublishNotFoundError
    with transaction() as conn:
        pages = []
        for build_id in ids:
            try:
                pages.append(_plan_page(conn, org_id, build_id))
            except publishing.PublishNotFoundError:
                continue
    needs = any(
        b.overridable
        for p in pages
        if p.action in ("approve_and_publish", "publish")
        for b in p.gate
    )
    return PublishAllPlan(pages=pages, needs_override=needs)


def start(
    org_id: UUID,
    planned: PublishAllPlan,
    user_id: UUID | None,
    build_ids: list[UUID],
    override: bool,
) -> PublishAllStarted:
    """Approves the chosen pages of a plan (a batch's, or an offer's) and sends them live again
    where they were live: each brand's Vercel pages in one deployment, each Shopify page on its
    own. Pages with checks that may be passed go only with `override` (otherwise they're approved
    and stay as they are live). The plan is read just now, so it's the pages as they are."""
    chosen = set(build_ids)
    pages = [p for p in planned.pages if p.build_id in chosen]
    results: dict[UUID, PageStarted] = {
        p.build_id: PageStarted(build_id=p.build_id, key=p.key, approved=False, jobs={})
        for p in pages
    }
    vercel: list[tuple[UUID, int]] = []
    for page in pages:
        result = results[page.build_id]
        if page.action in ("approve", "approve_and_publish"):
            try:
                desk.set_status(org_id, page.build_id, user_id, page.page_version, "approved")
                result.approved = True
            except (desk.DeskEditError, desk.DeskConflictError, desk.DeskNotFoundError) as exc:
                result.error = str(exc) or "It changed in the meantime. Reload the batch."
                continue
        elif page.action in ("none", "skip"):
            result.error = page.reason
            continue
        if page.action not in ("approve_and_publish", "publish"):
            continue
        passable = any(b.overridable for b in page.gate)
        if passable and not override:
            result.error = "Approved; its checks need Publish anyway, so it wasn't published."
            continue
        for destination in page.destinations:
            if destination == "vercel":
                vercel.append((page.build_id, page.page_version))
                continue
            try:
                state = publishing.start_publish(
                    org_id, page.build_id, user_id, page.page_version, override, destination
                )
                if state.job_id:
                    result.jobs[destination] = state.job_id
            except (publishing.PublishError, publishing.PublishConflictError) as exc:
                result.error = str(exc) or "It changed in the meantime."
    if vercel:
        try:
            job_id = publishing.start_vercel_many(org_id, vercel, user_id, override)
            for build_id, _ in vercel:
                results[build_id].jobs["vercel"] = job_id
        except (publishing.PublishError, publishing.PublishConflictError) as exc:
            for build_id, _ in vercel:
                results[build_id].error = str(exc) or "It changed in the meantime."
    return PublishAllStarted(pages=[results[p.build_id] for p in pages])
