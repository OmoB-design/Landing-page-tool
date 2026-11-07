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

The page editor (B3.1a, D104) adds section changes (move, duplicate, remove, by the template's
rules), typing saves that share one undo step per line (`merge_key`), and Redo: Undo keeps the
page it undid as a redo row until the next new change.
"""

import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import UUID

import structlog
from psycopg import errors
from psycopg.types.json import Jsonb

from app import share
from app.db import read, transaction
from app.engines import comparison, formatting, fragments, paragraphs, proof, visibility
from app.engines import recolor as recolor_engine
from app.engines.html import parse
from app.engines.sections import (
    DUPLICATE_KEY,
    apply_layout,
    duplicate_section,
    section_order,
    top_level_sections,
)
from app.jobs import queue
from app.models.desk import (
    CopyEdit,
    DeskBuild,
    DeskColors,
    DeskFragment,
    DeskPalette,
    DeskParagraph,
    DeskRedraft,
    DeskSection,
    DeskSnapshot,
    DeskState,
    FormatRange,
    FormattedLine,
    HideAction,
    RecolorColors,
    RedraftRequest,
    SectionAction,
    TextFormat,
)
from app.models.template import DuplicateAction, RemoveAction, ReorderAction
from app.providers import storage

BUCKET = "builds"
log = structlog.get_logger()
MAX_SNAPSHOTS = 12  # BUILD_SPEC §11.2: keep 12 snapshots (and up to 12 undone pages for Redo)
MAX_SECTIONS = 40
# Typing saves of one line share an undo step while they come at most this far apart (D104).
MERGE_SECONDS = 60
MAX_EDITED = 300
# A page can be changed on the desk once it is built (not while it builds or after it failed). A
# change to an approved or published page sends it back to Needs review (a published page stays
# live as it was until it is published again, D87).
EDITABLE = {"needs_review", "approved", "published"}


class DeskNotFoundError(Exception):
    """No such build in this org, or it has no page yet."""


class DeskConflictError(Exception):
    """The page changed (another tab, another person) since the desk loaded it."""


class DeskEditError(Exception):
    """A change the build doesn't allow now; the message is shown to the user."""


# The template's section rules as one JSON object (key → rule), for a query's select list.
_RULES_JSON = """
    (select coalesce(json_object_agg(s.key, json_build_object(
              'key', s.key, 'label', s.label, 'removable', s.removable,
              'duplicable', s.duplicable)), '{}'::json)
     from template_sections s where s.template_id = b.template_id) as rules
"""


def _load(conn: Any, org_id: UUID, build_id: UUID, *, lock: bool = False) -> dict[str, Any]:
    """The build, with the page job running on it (if any) and its template's section rules, in
    one round trip (B4.5, D124)."""
    build = conn.execute(
        f"""
        select b.id, b.org_id, b.brand_id, b.template_id, b.status, b.page_version,
               b.working_html_path, b.approved_at, b.approved_by, b.report, b.wizard,
               (select j.id from jobs j
                where j.build_id = b.id and j.kind = any(%(kinds)s)
                  and j.status in ('queued', 'running')
                order by j.created_at desc limit 1) as busy_job,
               {_RULES_JSON}
        from builds b
        where b.id = %(b)s and b.org_id = %(o)s and b.deleted_at is null
        {"for update of b" if lock else ""}
        """,
        {"b": build_id, "o": org_id, "kinds": list(PAGE_JOBS)},
    ).fetchone()
    if build is None or not build["working_html_path"]:
        raise DeskNotFoundError
    return dict(build)


def _snapshots(conn: Any, build_id: UUID, *, redo: bool = False) -> list[dict[str, Any]]:
    """The build's undo snapshots (or, with `redo`, the pages undone and kept for Redo), newest
    first. `recent`: taken (or last merged into) within the typing merge window."""
    return [
        dict(r)
        for r in conn.execute(
            """
            select seq, html_path, reason, created_at, created_by, merge_key,
                   created_at > now() - make_interval(secs => %(window)s) as recent
            from build_snapshots
            where build_id = %(b)s and redo = %(redo)s order by seq desc
            """,
            {"b": build_id, "redo": redo, "window": MERGE_SECONDS},
        ).fetchall()
    ]


def _all_snapshots(conn: Any, build_id: UUID) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """The undo snapshots and the pages kept for Redo, newest first, in one round trip."""
    rows = conn.execute(
        """
        select seq, html_path, reason, created_at, created_by, merge_key, redo,
               created_at > now() - make_interval(secs => %(window)s) as recent
        from build_snapshots where build_id = %(b)s order by seq desc
        """,
        {"b": build_id, "window": MERGE_SECONDS},
    ).fetchall()
    undo = [dict(r) for r in rows if not r["redo"]]
    redo = [dict(r) for r in rows if r["redo"]]
    return undo, redo


def _next_seq(conn: Any, build_id: UUID) -> int:
    row = conn.execute(
        "select coalesce(max(seq), 0) + 1 as seq from build_snapshots where build_id = %(b)s",
        {"b": build_id},
    ).fetchone()
    return int(row["seq"])


# Jobs that rewrite the page while the desk waits: a redraft, or a request to Lander (B3.1c, D106).
PAGE_JOBS = ("redraft", "agent_turn")


def _redraft(conn: Any, build_id: UUID) -> dict[str, Any] | None:
    """The redraft (or Lander's request, scope "agent") queued or running on this build, if any."""
    row = conn.execute(
        """
        select id, status, kind, payload from jobs
        where build_id = %(b)s and kind = any(%(kinds)s) and status in ('queued', 'running')
        order by created_at desc limit 1
        """,
        {"b": build_id, "kinds": list(PAGE_JOBS)},
    ).fetchone()
    return dict(row) if row else None


# Jobs that change the page in the background (B5.2, D126): approving waits for them, or they'd
# withdraw the approval a moment later by changing the page.
_BACKGROUND_WAIT = {
    "image_generate": "Wait for the new picture to finish, then approve.",
    "image_edit": "Wait for the picture being edited to finish, then approve.",
    "product_fidelity": "Wait for Match product to finish, then approve.",
    "mobile_optimize": "Wait for the phone fix to finish, then approve.",
}


def _background(conn: Any, build_id: UUID) -> str | None:
    """Why approving must wait: a background job is changing the page (a product check that only
    looks, without fixing, doesn't count)."""
    row = conn.execute(
        """
        select kind from jobs
        where build_id = %(b)s and kind = any(%(kinds)s) and status in ('queued', 'running')
          and (kind <> 'product_fidelity' or coalesce((payload->>'fix')::boolean, false))
        order by created_at desc limit 1
        """,
        {"b": build_id, "kinds": list(_BACKGROUND_WAIT)},
    ).fetchone()
    return _BACKGROUND_WAIT[row["kind"]] if row else None


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
    return _colors_from(build, html, row)


def _colors_from(build: dict[str, Any], html: str, row: dict[str, Any] | None) -> DeskColors:
    """_colors with the brand's palette and the template's source palette already read."""
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


def _rules(conn: Any, template_id: UUID) -> dict[str, dict[str, Any]]:
    """The template's sections: label, and whether each may be removed or duplicated."""
    return {
        r["key"]: dict(r)
        for r in conn.execute(
            """
            select key, label, removable, duplicable from template_sections
            where template_id = %(t)s
            """,
            {"t": template_id},
        ).fetchall()
    }


def _rules_of(conn: Any, build: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """The build's template's rules: read with the build by _load, else read now."""
    rules = build.get("rules")
    return dict(rules) if isinstance(rules, dict) else _rules(conn, build["template_id"])


def _labels(conn: Any, template_id: UUID) -> dict[str, str]:
    return {key: rule["label"] for key, rule in _rules(conn, template_id).items()}


def _layout(rules: dict[str, dict[str, Any]], html: str) -> list[DeskSection]:
    """The page's sections in order, with the template's rules. A copy (`hero-2`) is named and
    ruled after its original and can always be removed; a section the template doesn't list (a
    clone's) can be removed but not copied."""
    out: list[DeskSection] = []
    containers: dict[int, int] = {}
    for tag in top_level_sections(parse(html)):
        key = str(tag["data-lp-section"])
        group = containers.setdefault(id(tag.parent), len(containers))
        rule = rules.get(key)
        match = DUPLICATE_KEY.match(key)
        base = rules.get(match.group("base")) if rule is None and match else None
        if rule is not None:
            out.append(DeskSection(key=key, label=rule["label"], removable=rule["removable"],
                                   duplicable=rule["duplicable"], group=group,
                                   hidden=visibility.is_hidden(tag)))  # fmt: skip
        elif base is not None:
            out.append(DeskSection(key=key, label=f"{base['label']} (copy)", removable=True,
                                   duplicable=base["duplicable"], group=group,
                                   hidden=visibility.is_hidden(tag)))  # fmt: skip
        else:
            label = key.replace("-", " ").replace("_", " ").strip().capitalize() or key
            out.append(DeskSection(key=key, label=label, removable=True, duplicable=False,
                                   group=group, hidden=visibility.is_hidden(tag)))  # fmt: skip
    return out


def _state(
    build: dict[str, Any],
    snapshots: list[dict[str, Any]],
    html: str,
    rules: dict[str, dict[str, Any]],
    redraft: dict[str, Any] | None,
    colors: DeskColors,
    redos: list[dict[str, Any]],
) -> DeskState:
    layout = _layout(rules, html)
    labels = {key: rule["label"] for key, rule in rules.items()} | {s.key: s.label for s in layout}
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
            scope="agent"
            if redraft["kind"] == "agent_turn"
            else redraft["payload"].get("scope", "page"),
            section=redraft["payload"].get("section"),
            block=redraft["payload"].get("block"),
        )
        if redraft
        else None,
        colors=colors,
        layout=layout,
        can_redo=bool(redos),
        redo_reason=redos[0]["reason"] if redos else None,
    )


def desk_state(org_id: UUID, build_id: UUID, *, html: str | None = None) -> DeskState:
    """The desk's view of a finished build: its status and version, every sentence of its page,
    and its snapshots. One query, outside a transaction (B4.5, D124: the build, its snapshots,
    its template's rules, a job running on it, its colours' sources); `html`: the page as it was
    just written, so it isn't downloaded again."""
    with read() as conn:
        row = conn.execute(
            f"""
            select b.id, b.org_id, b.brand_id, b.template_id, b.status, b.page_version,
                   b.working_html_path, b.approved_at, b.approved_by, b.report, b.wizard,
                   coalesce((select json_agg(json_build_object(
                                'seq', s.seq, 'reason', s.reason, 'created_at', s.created_at,
                                'created_by', s.created_by, 'redo', s.redo) order by s.seq desc)
                             from build_snapshots s where s.build_id = b.id), '[]'::json)
                     as snaps,
                   {_RULES_JSON},
                   (select row_to_json(j) from (
                      select id, status, kind, payload from jobs
                      where build_id = b.id and kind = any(%(kinds)s)
                        and status in ('queued', 'running')
                      order by created_at desc limit 1) j) as redraft,
                   (select id from jobs
                    where build_id = b.id and kind = 'product_fidelity'
                      and status in ('queued', 'running')
                      and coalesce((payload->>'fix')::boolean, false)
                    order by created_at desc limit 1) as matching,
                   br.palette, t.source_palette
            from builds b
            left join brands br on br.id = b.brand_id and br.org_id = b.org_id
            left join templates t on t.id = b.template_id
            where b.id = %(b)s and b.org_id = %(o)s and b.deleted_at is null
            """,
            {"b": build_id, "o": org_id, "kinds": list(PAGE_JOBS)},
        ).fetchone()
    if row is None or not row["working_html_path"]:
        raise DeskNotFoundError
    build = dict(row)
    page = html if html is not None else _page(build)
    snaps = list(build["snaps"] or [])
    redraft = build["redraft"]
    colors = _colors_from(
        build,
        page,
        {"palette": build["palette"], "source_palette": build["source_palette"]}
        if build["template_id"] is not None
        else None,
    )
    state = _state(
        build,
        [x for x in snaps if not x["redo"]],
        page,
        build["rules"] or {},
        redraft,
        colors,
        [x for x in snaps if x["redo"]],
    )
    # Match product everywhere running (B3.2c): the editor follows it, whoever started it.
    return state.model_copy(update={"matching": build["matching"]})


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
    busy = build["busy_job"] if "busy_job" in build else _redraft(conn, build["id"])
    if busy is not None:
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
    merge_key: str | None = None,
    keep_redo: bool = False,
) -> list[str]:
    """Saves a change: the current page becomes the newest snapshot (`reason` says what the change
    does), the build points at the new page (`html` to store, or an existing `html_path`), its
    version goes up, an approval is withdrawn, the claims are checked again and the export is
    marked out of date. `clear_copy_error` drops the build's "copy wasn't rewritten" error (a
    redraft wrote those lines). Returns files to delete after the commit.

    A new change drops the pages kept for Redo (`keep_redo` is Redo itself). With `merge_key`
    (typing in the editor, D104), a save that follows the same person's save of the same line
    within a minute joins that undo step instead of taking a new snapshot."""
    version = build["page_version"] + 1
    if html is not None:
        html_path = f"{build['org_id']}/{build['id']}/pages/v{version}.html"
        storage.upload(BUCKET, html_path, html.encode(), "text/html; charset=utf-8", upsert=True)
    else:
        assert html_path is not None
        html = storage.download(BUCKET, html_path).decode("utf-8")
    snapshots, all_redos = _all_snapshots(conn, build["id"])
    redos = [] if keep_redo else all_redos
    if redos:
        conn.execute(
            "delete from build_snapshots where build_id = %(b)s and redo",
            {"b": build["id"]},
        )
    newest = snapshots[0] if snapshots else None
    merged = (
        merge_key is not None
        and newest is not None
        and newest["merge_key"] == merge_key
        and newest["created_by"] == user_id
        and bool(newest["recent"])
    )
    if merged:
        assert newest is not None
        seq = newest["seq"]
        # The page between the two saves isn't anyone's undo step: it goes.
        conn.execute(
            "update build_snapshots set created_at = now() where build_id = %(b)s and seq = %(s)s",
            {"b": build["id"], "s": seq},
        )
        superseded = [build["working_html_path"]]
    else:
        # One past every snapshot left (the pages kept for Redo were just dropped, unless kept).
        seq = (
            max((x["seq"] for x in [*snapshots, *(all_redos if keep_redo else [])]), default=0) + 1
        )
        conn.execute(
            """
            insert into build_snapshots (build_id, seq, html_path, reason, created_by, merge_key)
            values (%(b)s, %(seq)s, %(path)s, %(reason)s, %(user)s, %(merge)s)
            """,
            {
                "b": build["id"], "seq": seq, "path": build["working_html_path"],
                "reason": reason, "user": user_id, "merge": merge_key,
            },
        )  # fmt: skip
        superseded = []
    report = dict(build["report"] or {})
    report["compliance"] = comparison.check_claims(
        html,
        author_type=(build["wizard"] or {}).get("author_type"),
        facts=comparison.facts_from_report(report),
    )
    if edited:
        desk = dict(report.get("desk") or {})
        earlier = list(desk.get("edited", []))
        if merged:  # the line's earlier wording, from the save this one joins
            earlier = earlier[: -len(edited)] if len(earlier) >= len(edited) else []
        desk["edited"] = (earlier + edited)[-MAX_EDITED:]
        report["desk"] = desk
    if clear_copy_error and (error := (report.get("copy") or {}).get("error")):
        report["copy"] = {**report["copy"], "error": None}
        report["warnings"] = [w for w in report.get("warnings", []) if w != error]
    conn.execute(
        """
        update builds set working_html_path = %(path)s, page_version = %(v)s, report = %(report)s,
               export_html_path = null,
               status = case when status in ('approved', 'published')
                             then 'needs_review'::build_status else status end,
               approved_at = case when status in ('approved', 'published') then null
                             else approved_at end,
               approved_by = case when status in ('approved', 'published') then null
                             else approved_by end
        where id = %(b)s and org_id = %(o)s
        """,
        {
            "path": html_path, "v": version, "report": Jsonb(report), "b": build["id"],
            "o": build["org_id"],
        },
    )  # fmt: skip
    if merged:
        kept = snapshots[:MAX_SNAPSHOTS]
    else:
        kept = [{"seq": seq, "html_path": build["working_html_path"]}, *snapshots][:MAX_SNAPSHOTS]
    dropped = [s for s in snapshots if s["seq"] not in {k["seq"] for k in kept}]
    if dropped:
        conn.execute(
            "delete from build_snapshots where build_id = %(b)s and seq = any(%(s)s)",
            {"b": build["id"], "s": [s["seq"] for s in dropped]},
        )
    still_redo = all_redos if keep_redo else []
    in_use = {html_path, *(k["html_path"] for k in kept), *(r["html_path"] for r in still_redo)}
    gone = {s["html_path"] for s in dropped} | {r["html_path"] for r in redos} | set(superseded)
    return sorted(gone - in_use)


def _remove(paths: list[str]) -> None:
    if paths:
        storage.remove(BUCKET, paths)


# Files a change replaced are deleted after the answer, not before it (B4.5): a failure only leaves
# a file behind, which nothing points at.
_CLEANUP = ThreadPoolExecutor(max_workers=2, thread_name_prefix="desk-cleanup")


def _finish(
    org_id: UUID, build_id: UUID, stale: list[str], *, html: str | None = None
) -> DeskState:
    """After a change: the files it replaced go (in the background) and the desk as it is now,
    from `html` when the change just wrote it."""
    if stale:
        _CLEANUP.submit(_remove_quietly, stale)
    return desk_state(org_id, build_id, html=html)


def _remove_quietly(paths: list[str]) -> None:
    try:
        _remove(paths)
    except storage.StorageError:
        log.warning("desk cleanup failed", paths=len(paths))


def _where(sections: list[str | None]) -> str:
    named = sorted({s.replace("-", " ") for s in sections if s})
    return f" in {', '.join(named)}" if len(named) == 1 else ""


def copy_change(html: str, edits: list[CopyEdit]) -> tuple[str, list[str], list[str | None]]:
    """The page with edited paragraphs written in (bold words and links kept), the new texts and
    the sections they're in. Shared by the desk and Buddy (B3.1c). Words filled from data (the
    writer's name, a price) can be changed here, by a person or by Buddy at their request (owner,
    2026-11-06). Raises DeskConflictError when a line no longer reads as the edit expects,
    DeskEditError when it can't take the edit (a line with no words)."""
    sections: list[str | None] = []
    written: list[str] = []
    by_number = {p.number: p for p in paragraphs.paragraphs(html)}
    for edit in edits:
        paragraph = by_number.get(edit.block)
        if paragraph is None:
            raise DeskConflictError
        try:
            # A person's edit (or Buddy's on their behalf) may change words filled from data, like
            # the writer's name (owner, 2026-11-06); the build's own rewrites never do.
            html = paragraphs.rewrite(html, edit.block, edit.original, edit.text, allow_locked=True)
        except paragraphs.ParagraphDriftError as exc:
            raise DeskConflictError from exc
        except paragraphs.ParagraphEditError as exc:
            raise DeskEditError(str(exc)) from exc
        sections.append(paragraph.section)
        written.append(re.sub(r"\s+", " ", edit.text).strip())
    return html, written, sections


def edit_copy(
    org_id: UUID,
    build_id: UUID,
    user_id: UUID | None,
    base_version: int,
    edits: list[CopyEdit],
    *,
    typing: bool = False,
) -> DeskState:
    """Writes edited paragraphs into the page, keeping their bold words, links and locked parts.
    Each edit names the paragraph and the text the desk showed; if any no longer reads that way,
    nothing is saved. `typing` (the page editor's saves while you type, D104): saves of one line
    share an undo step."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        _check(conn, build, base_version)
        html, written, sections = copy_change(_page(build), edits)
        count = len(written)
        reason = f"Edited {'a line' if count == 1 else f'{count} lines'}{_where(sections)}"
        merge = f"line:{edits[0].block}" if typing and count == 1 else None
        stale = _change(
            conn, build, reason=reason, user_id=user_id, html=html, edited=written,
            merge_key=merge,
        )  # fmt: skip
    return _finish(org_id, build_id, stale, html=html)


def format_text(
    org_id: UUID,
    build_id: UUID,
    user_id: UUID | None,
    base_version: int,
    ranges: list[FormatRange],
    fmt: TextFormat,
) -> DeskState:
    """Formats exactly the selected characters (B3.1g, D118), in one line or across several, as
    one undoable change: "Made 6 words bold in hero"."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        _check(conn, build, base_version)
        change = formatting.Format(**fmt.model_dump())
        try:
            result = formatting.apply(
                _page(build),
                [formatting.Range(r.block, r.start, r.end) for r in ranges],
                change,
            )
        except formatting.FormatError as exc:
            raise DeskEditError(str(exc)) from exc
        stale = _change(
            conn, build, reason=formatting.reason(change, result), user_id=user_id,
            html=result.html,
        )  # fmt: skip
    state = _finish(org_id, build_id, stale, html=result.html)
    marked = proof.lines(result.html, {r.block for r in ranges})
    state.lines = [FormattedLine(block=n, html=h) for n, h in marked.items()]
    return state


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
        if status == "approved" and (waiting := _background(conn, build_id)) is not None:
            raise DeskEditError(waiting)
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
        if status == "approved":
            # What the client link shows from now on (B3.6, D119), until the next Approve.
            share.stamp(conn, build)
    return desk_state(org_id, build_id)


def undo(org_id: UUID, build_id: UUID, user_id: UUID | None, base_version: int) -> DeskState:
    """Puts back the page before the last change and drops its snapshot. The page it undid is
    kept for Redo (B3.1a) until the next new change."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        _check(conn, build, base_version)
        snapshots = _snapshots(conn, build_id)
        if not snapshots:
            raise DeskEditError("Nothing to undo.")
        newest = snapshots[0]
        html = storage.download(BUCKET, newest["html_path"]).decode("utf-8")
        report = dict(build["report"] or {})
        report["compliance"] = comparison.check_claims(
            html,
            author_type=(build["wizard"] or {}).get("author_type"),
            facts=comparison.facts_from_report(report),
        )
        conn.execute(
            "delete from build_snapshots where build_id = %(b)s and seq = %(s)s",
            {"b": build_id, "s": newest["seq"]},
        )
        conn.execute(
            """
            insert into build_snapshots (build_id, seq, html_path, reason, created_by, redo)
            values (%(b)s, %(seq)s, %(path)s, %(reason)s, %(user)s, true)
            """,
            {
                "b": build_id, "seq": _next_seq(conn, build_id),
                "path": build["working_html_path"], "reason": newest["reason"], "user": user_id,
            },
        )  # fmt: skip
        redos = _snapshots(conn, build_id, redo=True)
        pruned = redos[MAX_SNAPSHOTS:]
        if pruned:
            conn.execute(
                "delete from build_snapshots where build_id = %(b)s and seq = any(%(s)s)",
                {"b": build_id, "s": [r["seq"] for r in pruned]},
            )
        conn.execute(
            """
            update builds set working_html_path = %(path)s, page_version = page_version + 1,
                   report = %(report)s, export_html_path = null,
                   status = case when status in ('approved', 'published')
                             then 'needs_review'::build_status else status end,
                   approved_at = case when status in ('approved', 'published') then null
                             else approved_at end,
                   approved_by = case when status in ('approved', 'published') then null
                             else approved_by end
            where id = %(b)s and org_id = %(o)s
            """,
            {"path": newest["html_path"], "report": Jsonb(report), "b": build_id, "o": org_id},
        )
        in_use = {
            newest["html_path"],
            *(s["html_path"] for s in snapshots[1:]),
            *(r["html_path"] for r in redos[:MAX_SNAPSHOTS]),
        }
        stale = sorted({r["html_path"] for r in pruned} - in_use)
    return _finish(org_id, build_id, stale)


def redo(org_id: UUID, build_id: UUID, user_id: UUID | None, base_version: int) -> DeskState:
    """Puts back the change Undo took off last (B3.1a), as a change of its own (undoable)."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        _check(conn, build, base_version)
        redos = _snapshots(conn, build_id, redo=True)
        if not redos:
            raise DeskEditError("Nothing to redo.")
        top = redos[0]
        conn.execute(
            "delete from build_snapshots where build_id = %(b)s and seq = %(s)s",
            {"b": build_id, "s": top["seq"]},
        )
        stale = _change(
            conn, build, reason=top["reason"], user_id=user_id, html_path=top["html_path"],
            keep_redo=True,
        )  # fmt: skip
    return _finish(org_id, build_id, stale)


def _move_reason(old: list[str], new: list[str], labels: dict[str, str], moved: str | None) -> str:
    """ "Moved Hero up" when one section moved (the one the user moved, if they said); otherwise
    "Reordered sections"."""
    for key in [moved, *old] if moved in old else old:
        assert key is not None
        if [k for k in old if k != key] == [k for k in new if k != key]:
            direction = "up" if new.index(key) < old.index(key) else "down"
            return f"Moved {labels.get(key, key)} {direction}"
    return "Reordered sections"


def edit_sections(
    org_id: UUID, build_id: UUID, user_id: UUID | None, base_version: int, action: SectionAction
) -> DeskState:
    """The page editor's section changes (B3.1a, D104): move, duplicate or remove a section of
    the page, by the template's rules (a ranking's competitor entries can't be removed), as one
    undoable change."""
    with transaction() as conn:
        build = _load(conn, org_id, build_id, lock=True)
        _check(conn, build, base_version)
        html = _page(build)
        new_html, reason = section_change(html, _layout(_rules_of(conn, build), html), action)
        stale = _change(conn, build, reason=reason, user_id=user_id, html=new_html)
    return _finish(org_id, build_id, stale, html=new_html)


def section_change(html: str, layout: list[DeskSection], action: SectionAction) -> tuple[str, str]:
    """The page with a section moved, copied or removed by the template's rules (`layout`), and
    what the change did ("Moved Hero up"). Shared by the editor and Lander (B3.1c)."""
    keys = [s.key for s in layout]
    by_key = {s.key: s for s in layout}
    labels = {s.key: s.label for s in layout}
    if isinstance(action, ReorderAction):
        if sorted(action.keys) != sorted(keys):
            raise DeskConflictError
        if action.keys == keys:
            raise DeskEditError("The sections are already in that order.")
        new_html, _ = apply_layout(html, action.keys)
        if section_order(new_html) != action.keys:
            raise DeskEditError(
                "That section can't move there: it sits in a different part of the page."
            )
        reason = _move_reason(keys, action.keys, labels, action.moved)
    elif isinstance(action, RemoveAction):
        section = by_key.get(action.key)
        if section is None:
            raise DeskConflictError
        if not section.removable:
            raise DeskEditError(f"{section.label} can't be removed from this page.")
        if len(keys) == 1:
            raise DeskEditError("A page needs at least one section.")
        new_html, _ = apply_layout(html, [k for k in keys if k != action.key])
        reason = f"Removed {section.label}"
    elif isinstance(action, DuplicateAction):
        section = by_key.get(action.key)
        if section is None:
            raise DeskConflictError
        if not section.duplicable:
            raise DeskEditError(f"{section.label} can't be duplicated.")
        if len(keys) >= MAX_SECTIONS:
            raise DeskEditError(f"A page can have up to {MAX_SECTIONS} sections.")
        match = DUPLICATE_KEY.match(action.key)
        root = match.group("base") if match and match.group("base") in by_key else action.key
        n = 2
        while f"{root}-{n}" in by_key:
            n += 1
        new_html = duplicate_section(html, action.key, f"{root}-{n}")
        reason = f"Duplicated {section.label}"
    elif isinstance(action, HideAction):
        new_html, reason = _hide(html, by_key, action)
    else:  # pragma: no cover (the union is exhaustive)
        raise DeskEditError("Unknown change.")
    return new_html, reason


def _hide(html: str, by_key: dict[str, DeskSection], action: HideAction) -> tuple[str, str]:
    """Hides or shows a section, a line or a picture (B4.4, Shopify's eye): "Hid The problem",
    "Showed a line in Hero"."""
    if sum(x is not None for x in (action.key, action.block, action.image)) != 1:
        raise DeskEditError("Choose one section, line or picture to hide or show.")
    if action.key is not None and action.key not in by_key:
        raise DeskConflictError
    try:
        new_html, owner, changed = visibility.toggle(
            html, hidden=action.hidden, key=action.key, block=action.block, image=action.image
        )
    except visibility.NotOnPageError as exc:
        raise DeskEditError("That isn't on the page any more. Reload the page.") from exc
    verb = "Hid" if action.hidden else "Showed"
    if not changed:
        raise DeskEditError(f"That's already {'hidden' if action.hidden else 'showing'}.")
    if action.key is not None:
        return new_html, f"{verb} {by_key[action.key].label}"
    where = by_key[owner].label if owner in by_key else "the page"
    thing = "a line" if action.block is not None else "a picture"
    return new_html, f"{verb} {thing} in {where}"


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
        new_html = recolor_change(html, _colors(conn, build, html).page, colors.model_dump())
        stale = _change(conn, build, reason="Recoloured the page", user_id=user_id, html=new_html)
    return _finish(org_id, build_id, stale, html=new_html)


def recolor_change(
    html: str, current: DeskPalette | None, target: dict[str, str], *, literals: bool = True
) -> str:
    """The page recoloured from its colours now (`current`) to `target`. Shared by the desk and
    Lander (B3.1c), which sets only the colour variables when the page has them
    (`literals=False`)."""
    if current is None:
        raise DeskEditError("This page's colours aren't known, so it can't be recoloured.")
    if target == current.model_dump():
        raise DeskEditError("Those are the page's colours already.")
    new_html, stats = recolor_engine.recolor(
        html,
        source_palette=current.model_dump(),
        brand_palette=target,
        brand_fonts={},
        literals=literals,
    )
    if not (stats["exact"] or stats["hue_shifted"] or stats["vars_set"]):
        raise DeskEditError("No colours on this page matched, so nothing changed.")
    return str(new_html)


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
