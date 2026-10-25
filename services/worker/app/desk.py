"""The review desk (BUILD_SPEC §11.1, D84, D86): copy edits, recolours, approval, snapshots and undo
for a finished build, as quick direct calls (no AI), and redrafts, which run as a job (`redraft`)
and are saved here when they finish. While a redraft is queued or running, the page's other
changes wait (the redraft would overwrite them).

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

from psycopg import errors
from psycopg.types.json import Jsonb

from app.db import transaction
from app.engines import compliance, fragments, paragraphs, proof
from app.engines import recolor as recolor_engine
from app.jobs import queue
from app.models.desk import (
    CopyEdit,
    DeskBuild,
    DeskColors,
    DeskFragment,
    DeskPalette,
    DeskParagraph,
    DeskRedraft,
    DeskSnapshot,
    DeskState,
    RecolorColors,
    RedraftRequest,
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
        select id, org_id, brand_id, template_id, status, page_version, working_html_path,
               approved_at, approved_by, report, wizard
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


def _redraft(conn: Any, build_id: UUID) -> dict[str, Any] | None:
    """The redraft queued or running on this build, if any."""
    row = conn.execute(
        """
        select id, status, payload from jobs
        where build_id = %(b)s and kind = 'redraft' and status in ('queued', 'running')
        order by created_at desc limit 1
        """,
        {"b": build_id},
    ).fetchone()
    return dict(row) if row else None


def _colors(conn: Any, build: dict[str, Any], html: str) -> DeskColors:
    """The page's four colours (as recorded on it; for pages built before the record, the
    brand's colours the build put on it, or the template's when it wasn't recoloured) and the
    brand's."""
    row = conn.execute(
        """
        select b.palette, t.source_palette from brands b, templates t
        where b.id = %(brand)s and b.org_id = %(o)s and t.id = %(t)s
        """,
        {"brand": build["brand_id"], "o": build["org_id"], "t": build["template_id"]},
    ).fetchone()
    brand = recolor_engine.brand_colors(row["palette"] or {}) if row else None
    brand_palette = recolor_engine.palette_of(brand) if brand else None
    page = recolor_engine.page_palette(html)
    if page is None:
        recoloured = (build["report"] or {}).get("brand", {}).get("recolor", {})
        if recoloured and not recoloured.get("skipped") and brand_palette:
            page = brand_palette
        elif row and (source := recolor_engine.brand_colors(row["source_palette"] or {})):
            page = recolor_engine.palette_of(source)
    full = page if page and set(page) == set(recolor_engine.ROLES) else None
    if page and full is None:
        filled = recolor_engine.brand_colors(page)
        full = recolor_engine.palette_of(filled) if filled else None
    return DeskColors(
        page=DeskPalette(**full) if full else None,
        brand=DeskPalette(**brand_palette) if brand_palette else None,
    )


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
    build: dict[str, Any],
    snapshots: list[dict[str, Any]],
    html: str,
    labels: dict[str, str],
    redraft: dict[str, Any] | None,
    colors: DeskColors,
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
        redraft=DeskRedraft(
            job_id=redraft["id"],
            status=redraft["status"],
            scope=redraft["payload"].get("scope", "page"),
            section=redraft["payload"].get("section"),
            block=redraft["payload"].get("block"),
        )
        if redraft
        else None,
        colors=colors,
    )


def desk_state(org_id: UUID, build_id: UUID) -> DeskState:
    """The desk's view of a finished build: its status and version, every sentence of its page,
    and its snapshots."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id)
        snapshots = _snapshots(conn, build_id)
        labels = _labels(conn, build["template_id"])
        redraft = _redraft(conn, build_id)
        html = _page(build)
        colors = _colors(conn, build, html)
    return _state(build, snapshots, html, labels, redraft, colors)


def proof_html(org_id: UUID, build_id: UUID) -> tuple[str, int]:
    """The page with every sentence marked for the desk's preview, and its version."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id)
    return proof.mark(_page(build)), build["page_version"]


REDRAFTING = "The page is being redrafted. Changes wait until that's done."


def _check(conn: Any, build: dict[str, Any], base_version: int) -> None:
    if build["status"] not in EDITABLE:
        raise DeskEditError("This page can't be changed while it builds or after it failed.")
    if build["page_version"] != base_version:
        raise DeskConflictError
    if _redraft(conn, build["id"]) is not None:
        raise DeskEditError(REDRAFTING)


def _change(
    conn: Any,
    build: dict[str, Any],
    *,
    reason: str,
    user_id: UUID | None,
    html: str | None = None,
    html_path: str | None = None,
    edited: list[str] | None = None,
    clear_copy_error: bool = False,
) -> list[str]:
    """Saves a change: the current page becomes the newest snapshot (`reason` says what the change
    does), the build points at the new page (`html` to store, or an existing `html_path`), its
    version goes up, an approval is withdrawn, the claims are checked again and the export is
    marked out of date. `clear_copy_error` drops the build's "copy wasn't rewritten" error (a
    redraft wrote those lines). Returns files to delete after the commit."""
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
    if clear_copy_error and (error := (report.get("copy") or {}).get("error")):
        report["copy"] = {**report["copy"], "error": None}
        report["warnings"] = [w for w in report.get("warnings", []) if w != error]
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
        _check(conn, build, base_version)
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
        if _redraft(conn, build_id) is not None:
            raise DeskEditError(REDRAFTING)
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
        _check(conn, build, base_version)
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
        _check(conn, build, base_version)
        target = next((s for s in _snapshots(conn, build_id) if s["seq"] == seq), None)
        if target is None:
            raise DeskEditError("That snapshot isn't kept any more.")
        stale = _change(
            conn, build, reason=f"Restored the page from before “{target['reason']}”",
            user_id=user_id, html_path=target["html_path"],
        )  # fmt: skip
    return _finish(org_id, build_id, stale)


def recolor(
    org_id: UUID, build_id: UUID, user_id: UUID | None, base_version: int, colors: RecolorColors
) -> DeskState:
    """Recolours the page from the colours on it now to `colors` (exact matches, then the
    primary's hue family; text on brand colours switches to black or white). Fonts stay."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        _check(conn, build, base_version)
        html = _page(build)
        current = _colors(conn, build, html).page
        if current is None:
            raise DeskEditError("This page's colours aren't known, so it can't be recoloured.")
        target = colors.model_dump()
        if target == current.model_dump():
            raise DeskEditError("Those are the page's colours already.")
        new_html, stats = recolor_engine.recolor(
            html, source_palette=current.model_dump(), brand_palette=target, brand_fonts={}
        )
        if not (stats["exact"] or stats["hue_shifted"] or stats["vars_set"]):
            raise DeskEditError("No colours on this page matched, so nothing changed.")
        stale = _change(conn, build, reason="Recoloured the page", user_id=user_id, html=new_html)
    return _finish(org_id, build_id, stale)


def start_redraft(
    org_id: UUID, build_id: UUID, user_id: UUID | None, request: RedraftRequest
) -> DeskState:
    """Queues a redraft of the page, a section, a paragraph or the lines still in the template's
    words. One at a time per page; the desk's other changes wait until it's done."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        _check(conn, build, request.base_version)
        paras = paragraphs.paragraphs(_page(build))
        if request.scope == "section" and not any(p.section == request.section for p in paras):
            raise DeskEditError("That section isn't on the page any more.")
        if request.scope == "paragraph":
            paragraph = next((p for p in paras if p.number == request.block), None)
            if paragraph is None:
                raise DeskConflictError
            if paragraph.locked:
                raise DeskEditError(
                    "That line is filled from the brand or product, so change it there."
                )
        if request.scope == "unwritten" and not (build["report"] or {}).get("copy", {}).get(
            "error"
        ):
            raise DeskEditError("Every line was written, so there's nothing to redraft.")
        payload = {
            "build_id": str(build_id),
            "base_version": request.base_version,
            "scope": request.scope,
            "section": request.section if request.scope == "section" else None,
            "block": request.block if request.scope == "paragraph" else None,
            "note": (request.note or "").strip() or None,
        }
        try:
            queue.enqueue(
                org_id=org_id,
                kind="redraft",
                payload=payload,
                created_by=user_id,
                dedupe_key=f"redraft:{build_id}",
                build_id=build_id,
                max_attempts=1,
                conn=conn,
            )
        except errors.UniqueViolation as exc:
            raise DeskEditError(REDRAFTING) from exc
    return desk_state(org_id, build_id)


def save_redraft(
    org_id: UUID,
    build_id: UUID,
    user_id: UUID | None,
    base_version: int,
    html: str,
    reason: str,
    *,
    clear_copy_error: bool,
) -> int:
    """Saves a finished redraft as one change (the redraft job calls this). Returns the page's new
    version. Refused if the page changed since the redraft started."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        if build["status"] not in EDITABLE or build["page_version"] != base_version:
            raise DeskConflictError
        stale = _change(
            conn, build, reason=reason, user_id=user_id, html=html,
            clear_copy_error=clear_copy_error,
        )  # fmt: skip
        version = int(build["page_version"]) + 1
    _remove(stale)
    return version


def section_labels(org_id: UUID, build_id: UUID) -> dict[str, str]:
    with transaction() as conn:
        build = _load(conn, org_id, build_id)
        return _labels(conn, build["template_id"])
