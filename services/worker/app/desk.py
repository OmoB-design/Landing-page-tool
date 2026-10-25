"""The review desk (BUILD_SPEC §11.1, D84): copy edits, approval, snapshots and undo for a finished
build, as quick direct calls (no AI, no job).

Each state of a build's page is its own file. A change writes the new page to
`<org>/<build>/pages/v<version>.html`, records the page it replaces as the newest snapshot, and
points the build at the new file, in one transaction, so a failed save never leaves a half-changed
page. Undo points the build back at the newest snapshot's page and drops that snapshot; Restore
makes an older page current as a new change (so it can be undone). The newest 12 snapshots are
kept; files no kept snapshot or the build uses are deleted after the commit.
"""

import re
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from app.db import transaction
from app.engines import compliance, fragments, paragraphs, proof
from app.models.desk import (
    CopyEdit,
    DeskBuild,
    DeskFragment,
    DeskParagraph,
    DeskSnapshot,
    DeskState,
)
from app.providers import storage

BUCKET = "builds"
MAX_SNAPSHOTS = 12  # BUILD_SPEC §11.2: keep 12 snapshots
MAX_EDITED = 300
# A page can be changed on the desk once it is built (not while it builds or after it failed).
EDITABLE = {"needs_review", "approved"}


class DeskNotFoundError(Exception):
    """No such build in this org, or it has no page yet."""


class DeskConflictError(Exception):
    """The page changed (another tab, another person) since the desk loaded it."""


class DeskEditError(Exception):
    """A change the build doesn't allow now; the message is shown to the user."""


def _load(conn: Any, org_id: UUID, build_id: UUID, *, lock: bool = False) -> dict[str, Any]:
    build = conn.execute(
        f"""
        select id, org_id, template_id, status, page_version, working_html_path, approved_at,
               approved_by, report, wizard
        from builds
        where id = %(b)s and org_id = %(o)s and deleted_at is null
        {"for update" if lock else ""}
        """,
        {"b": build_id, "o": org_id},
    ).fetchone()
    if build is None or not build["working_html_path"]:
        raise DeskNotFoundError
    return dict(build)


def _snapshots(conn: Any, build_id: UUID) -> list[dict[str, Any]]:
    return [
        dict(r)
        for r in conn.execute(
            """
            select seq, html_path, reason, created_at, created_by from build_snapshots
            where build_id = %(b)s order by seq desc
            """,
            {"b": build_id},
        ).fetchall()
    ]


def _page(build: dict[str, Any]) -> str:
    return storage.download(BUCKET, build["working_html_path"]).decode("utf-8")


def _labels(conn: Any, template_id: UUID) -> dict[str, str]:
    return {
        r["key"]: r["label"]
        for r in conn.execute(
            "select key, label from template_sections where template_id = %(t)s",
            {"t": template_id},
        ).fetchall()
    }


def _state(
    build: dict[str, Any], snapshots: list[dict[str, Any]], html: str, labels: dict[str, str]
) -> DeskState:
    edited = set((build["report"] or {}).get("desk", {}).get("edited", []))
    paras = paragraphs.paragraphs(html)
    number_of = {fid: p.number for p in paras for fid in p.fragment_ids}
    kind_of = {p.number: p.kind for p in paras}
    return DeskState(
        build=DeskBuild(
            id=build["id"],
            status=build["status"],
            page_version=build["page_version"],
            approved_at=build["approved_at"],
            approved_by=build["approved_by"],
        ),
        fragments=[
            DeskFragment(
                id=f.id,
                text=f.text,
                section=f.section,
                locked=f.locked,
                edited=f.text in edited,
                block=number_of[f.id],
                kind=kind_of[number_of[f.id]],
            )
            for f in fragments.dump(html)
        ],
        paragraphs=[
            DeskParagraph(
                number=p.number,
                kind=p.kind,
                section=p.section,
                text=p.text,
                locked=p.locked,
                locked_parts=list(p.locked_parts),
                edited=p.text in edited,
                fragments=list(p.fragment_ids),
            )
            for p in paras
        ],
        sections=labels,
        snapshots=[
            DeskSnapshot(
                seq=s["seq"],
                reason=s["reason"],
                created_at=s["created_at"],
                created_by=s["created_by"],
            )
            for s in snapshots
        ],
    )


def desk_state(org_id: UUID, build_id: UUID) -> DeskState:
    """The desk's view of a finished build: its status and version, every sentence of its page,
    and its snapshots."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id)
        snapshots = _snapshots(conn, build_id)
        labels = _labels(conn, build["template_id"])
    return _state(build, snapshots, _page(build), labels)


def proof_html(org_id: UUID, build_id: UUID) -> tuple[str, int]:
    """The page with every sentence marked for the desk's preview, and its version."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id)
    return proof.mark(_page(build)), build["page_version"]


def _check(build: dict[str, Any], base_version: int) -> None:
    if build["status"] not in EDITABLE:
        raise DeskEditError("This page can't be changed while it builds or after it failed.")
    if build["page_version"] != base_version:
        raise DeskConflictError


def _change(
    conn: Any,
    build: dict[str, Any],
    *,
    reason: str,
    user_id: UUID | None,
    html: str | None = None,
    html_path: str | None = None,
    edited: list[str] | None = None,
) -> list[str]:
    """Saves a change: the current page becomes the newest snapshot (`reason` says what the change
    does), the build points at the new page (`html` to store, or an existing `html_path`), its
    version goes up, an approval is withdrawn, the claims are checked again and the export is
    marked out of date. Returns files to delete after the commit."""
    version = build["page_version"] + 1
    if html is not None:
        html_path = f"{build['org_id']}/{build['id']}/pages/v{version}.html"
        storage.upload(BUCKET, html_path, html.encode(), "text/html; charset=utf-8", upsert=True)
    else:
        assert html_path is not None
        html = storage.download(BUCKET, html_path).decode("utf-8")
    snapshots = _snapshots(conn, build["id"])
    seq = max([s["seq"] for s in snapshots], default=0) + 1
    conn.execute(
        """
        insert into build_snapshots (build_id, seq, html_path, reason, created_by)
        values (%(b)s, %(seq)s, %(path)s, %(reason)s, %(user)s)
        """,
        {
            "b": build["id"], "seq": seq, "path": build["working_html_path"], "reason": reason,
            "user": user_id,
        },
    )  # fmt: skip
    report = dict(build["report"] or {})
    report["compliance"] = compliance.scan(
        html, author_type=(build["wizard"] or {}).get("author_type")
    )
    if edited:
        desk = dict(report.get("desk") or {})
        desk["edited"] = (list(desk.get("edited", [])) + edited)[-MAX_EDITED:]
        report["desk"] = desk
    conn.execute(
        """
        update builds set working_html_path = %(path)s, page_version = %(v)s, report = %(report)s,
               export_html_path = null,
               status = case when status = 'approved' then 'needs_review' else status end,
               approved_at = case when status = 'approved' then null else approved_at end,
               approved_by = case when status = 'approved' then null else approved_by end
        where id = %(b)s and org_id = %(o)s
        """,
        {
            "path": html_path, "v": version, "report": Jsonb(report), "b": build["id"],
            "o": build["org_id"],
        },
    )  # fmt: skip
    kept = [{"seq": seq, "html_path": build["working_html_path"]}, *snapshots][:MAX_SNAPSHOTS]
    dropped = [s for s in snapshots if s["seq"] not in {k["seq"] for k in kept}]
    if dropped:
        conn.execute(
            "delete from build_snapshots where build_id = %(b)s and seq = any(%(s)s)",
            {"b": build["id"], "s": [s["seq"] for s in dropped]},
        )
    in_use = {html_path, *(k["html_path"] for k in kept)}
    return sorted({s["html_path"] for s in dropped} - in_use)


def _remove(paths: list[str]) -> None:
    if paths:
        storage.remove(BUCKET, paths)


def _finish(org_id: UUID, build_id: UUID, stale: list[str]) -> DeskState:
    _remove(stale)
    return desk_state(org_id, build_id)


def _where(sections: list[str | None]) -> str:
    named = sorted({s.replace("-", " ") for s in sections if s})
    return f" in {', '.join(named)}" if len(named) == 1 else ""


def edit_copy(
    org_id: UUID, build_id: UUID, user_id: UUID | None, base_version: int, edits: list[CopyEdit]
) -> DeskState:
    """Writes edited paragraphs into the page, keeping their bold words, links and locked parts.
    Each edit names the paragraph and the text the desk showed; if any no longer reads that way,
    nothing is saved."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        _check(build, base_version)
        html = _page(build)
        sections: list[str | None] = []
        written: list[str] = []
        by_number = {p.number: p for p in paragraphs.paragraphs(html)}
        for edit in edits:
            paragraph = by_number.get(edit.block)
            if paragraph is None:
                raise DeskConflictError
            if paragraph.locked:
                raise DeskEditError(
                    "That line is filled from the brand or product, so change it there."
                )
            try:
                html = paragraphs.rewrite(html, edit.block, edit.original, edit.text)
            except paragraphs.ParagraphDriftError as exc:
                raise DeskConflictError from exc
            except paragraphs.ParagraphEditError as exc:
                raise DeskEditError(str(exc)) from exc
            sections.append(paragraph.section)
            written.append(re.sub(r"\s+", " ", edit.text).strip())
        count = len(written)
        reason = f"Edited {'a line' if count == 1 else f'{count} lines'}{_where(sections)}"
        stale = _change(conn, build, reason=reason, user_id=user_id, html=html, edited=written)
    return _finish(org_id, build_id, stale)


def set_status(
    org_id: UUID, build_id: UUID, user_id: UUID | None, base_version: int, status: str
) -> DeskState:
    """Approve (Needs review → Approved) or Back to review (Approved → Needs review). The version
    check means you approve the page you looked at."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        if build["page_version"] != base_version:
            raise DeskConflictError
        allowed = {"approved": "needs_review", "needs_review": "approved"}
        if build["status"] != allowed[status]:
            raise DeskEditError(
                "Only a page that needs review can be approved."
                if status == "approved"
                else "Only an approved page can go back to review."
            )
        conn.execute(
            """
            update builds set status = %(s)s::build_status,
                   approved_at = case when %(s)s::build_status = 'approved' then now() end,
                   approved_by = case when %(s)s::build_status = 'approved' then %(u)s::uuid end
            where id = %(b)s and org_id = %(o)s
            """,
            {"s": status, "u": user_id, "b": build_id, "o": org_id},
        )
    return desk_state(org_id, build_id)


def undo(org_id: UUID, build_id: UUID, base_version: int) -> DeskState:
    """Puts back the page before the last change and drops its snapshot."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        _check(build, base_version)
        snapshots = _snapshots(conn, build_id)
        if not snapshots:
            raise DeskEditError("Nothing to undo.")
        newest = snapshots[0]
        html = storage.download(BUCKET, newest["html_path"]).decode("utf-8")
        report = dict(build["report"] or {})
        report["compliance"] = compliance.scan(
            html, author_type=(build["wizard"] or {}).get("author_type")
        )
        conn.execute(
            "delete from build_snapshots where build_id = %(b)s and seq = %(s)s",
            {"b": build_id, "s": newest["seq"]},
        )
        conn.execute(
            """
            update builds set working_html_path = %(path)s, page_version = page_version + 1,
                   report = %(report)s, export_html_path = null,
                   status = case when status = 'approved' then 'needs_review' else status end,
                   approved_at = case when status = 'approved' then null else approved_at end,
                   approved_by = case when status = 'approved' then null else approved_by end
            where id = %(b)s and org_id = %(o)s
            """,
            {"path": newest["html_path"], "report": Jsonb(report), "b": build_id, "o": org_id},
        )
        in_use = {newest["html_path"], *(s["html_path"] for s in snapshots[1:])}
        abandoned = build["working_html_path"]
        stale = [] if abandoned in in_use else [abandoned]
    return _finish(org_id, build_id, stale)


def restore(
    org_id: UUID, build_id: UUID, user_id: UUID | None, base_version: int, seq: int
) -> DeskState:
    """Makes an older page current again, as a new change (so it can be undone)."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        _check(build, base_version)
        target = next((s for s in _snapshots(conn, build_id) if s["seq"] == seq), None)
        if target is None:
            raise DeskEditError("That snapshot isn't kept any more.")
        stale = _change(
            conn, build, reason=f"Restored the page from before “{target['reason']}”",
            user_id=user_id, html_path=target["html_path"],
        )  # fmt: skip
    return _finish(org_id, build_id, stale)
