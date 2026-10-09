"""Org templates (BUILD_SPEC §8.3, D63): "Use template" copies a library template into the org,
and the section editor reorders, removes, duplicates and renames sections with a 12-version
history (undo, redo, restore). Template file operations run here, in the worker, as quick direct
calls (no AI, no job)."""

import uuid
from typing import Any, Literal
from uuid import UUID

from psycopg.types.json import Jsonb

from app.db import transaction
from app.engines.sections import DUPLICATE_KEY, apply_layout, duplicate_section, section_order
from app.engines.template_outline import checks, look, outline, read_minutes
from app.models.template import (
    DuplicateAction,
    EditorSection,
    EditorTemplate,
    EditorVersion,
    LayoutAction,
    RemoveAction,
    RenameAction,
    ReorderAction,
    TemplateEditorState,
)
from app.providers import storage

SECTION_FIELDS = ("key", "role", "label", "position", "removable", "duplicable")
MAX_VERSIONS = 12  # BUILD_SPEC §8.3: keep the last 12 versions for undo
MAX_SECTIONS = 40


class TemplateNotFoundError(Exception):
    pass


class TemplateConflictError(Exception):
    """The template changed (another tab, another person) since the editor loaded it."""


class TemplateEditError(Exception):
    """An edit the template doesn't allow; the message is shown to the user."""


def _free_slug(conn: Any, org_id: UUID, slug: str) -> str:
    taken = {
        r["slug"]
        for r in conn.execute(
            """
            select slug from templates
            where org_id = %(o)s and deleted_at is null and (slug = %(s)s or slug like %(p)s)
            """,
            {"o": org_id, "s": slug, "p": f"{slug}-%"},
        ).fetchall()
    }
    if slug not in taken:
        return slug
    n = 2
    while f"{slug}-{n}" in taken:
        n += 1
    return f"{slug}-{n}"


def use_library_template(org_id: UUID, template_id: UUID, user_id: UUID | None) -> dict[str, Any]:
    """Copies an active library template (HTML, sections, instructions, palette) into the org as
    version 1 of a new org template that remembers its parent."""
    with transaction() as conn:
        library = conn.execute(
            """
            select * from templates
            where id = %(t)s and org_id is null and status = 'active' and deleted_at is null
            """,
            {"t": template_id},
        ).fetchone()
        if library is None:
            raise TemplateNotFoundError
        sections = conn.execute(
            """
            select key, role, label, position, removable, duplicable from template_sections
            where template_id = %(t)s order by position
            """,
            {"t": template_id},
        ).fetchall()
    html = storage.download("library", library["html_path"])
    new_id = uuid.uuid4()
    html_path = f"{org_id}/{new_id}/v1.html"
    storage.upload("templates", html_path, html, "text/html; charset=utf-8", upsert=True)
    snapshot = [
        {k: s[k] for k in ("key", "role", "label", "position", "removable", "duplicable")}
        for s in sections
    ]
    with transaction() as conn:
        row = conn.execute(
            """
            insert into templates (id, org_id, origin, status, slug, name, description, type,
                                   parent_template_id, html_path, instructions, source_palette,
                                   version, created_by)
            values (%(id)s, %(o)s, 'owned', 'active', %(slug)s, %(name)s, %(description)s,
                    %(type)s, %(parent)s, %(path)s, %(instructions)s, %(palette)s, 1, %(user)s)
            returning id, slug, name, type, version
            """,
            {
                "id": new_id, "o": org_id, "slug": _free_slug(conn, org_id, library["slug"]),
                "name": library["name"], "description": library["description"],
                "type": library["type"], "parent": library["id"], "path": html_path,
                "instructions": Jsonb(library["instructions"]),
                "palette": Jsonb(library["source_palette"]), "user": user_id,
            },
        ).fetchone()  # fmt: skip
        assert row is not None
        for s in snapshot:
            conn.execute(
                """
                insert into template_sections (template_id, key, role, label, position,
                                               removable, duplicable)
                values (%(t)s, %(key)s, %(role)s, %(label)s, %(position)s, %(removable)s,
                        %(duplicable)s)
                """,
                {"t": new_id, **s},
            )
        conn.execute(
            """
            insert into template_versions (template_id, version, html_path, sections, reason,
                                           created_by)
            values (%(t)s, 1, %(path)s, %(sections)s, 'Copied from the library', %(user)s)
            """,
            {"t": new_id, "path": html_path, "sections": Jsonb(snapshot), "user": user_id},
        )
    return dict(row)


# ── Section editor ────────────────────────────────────────────────────────────


def _load(conn: Any, org_id: UUID, template_id: UUID, *, lock: bool = False) -> dict[str, Any]:
    row = conn.execute(
        f"""
        select t.id, t.org_id, t.name, t.description, t.type, t.version, t.html_path,
               t.instructions, t.updated_at, p.name as parent_name
        from templates t left join templates p on p.id = t.parent_template_id
        where t.id = %(t)s and t.org_id = %(o)s and t.deleted_at is null
        {"for update of t" if lock else ""}
        """,
        {"t": template_id, "o": org_id},
    ).fetchone()
    if row is None:
        raise TemplateNotFoundError
    return dict(row)


def _sections(conn: Any, template_id: UUID) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        select key, role, label, position, removable, duplicable from template_sections
        where template_id = %(t)s order by position
        """,
        {"t": template_id},
    ).fetchall()
    return [dict(r) for r in rows]


def _versions(conn: Any, template_id: UUID) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        select version, html_path, reason, created_at from template_versions
        where template_id = %(t)s order by version desc
        """,
        {"t": template_id},
    ).fetchall()
    return [dict(r) for r in rows]


def _state(
    template: dict[str, Any],
    rows: list[dict[str, Any]],
    versions: list[dict[str, Any]],
    html: str,
) -> TemplateEditorState:
    by_key = {o.key: o for o in outline(html)}
    sections = [
        EditorSection(
            **(by_key[r["key"]].model_dump() if r["key"] in by_key else {"key": r["key"]}),
            role=r["role"],
            label=r["label"],
            removable=r["removable"],
            duplicable=r["duplicable"],
        )
        for r in rows
    ]
    words = sum(s.words for s in sections)
    current = template["version"]
    return TemplateEditorState(
        template=EditorTemplate(
            id=template["id"],
            name=template["name"],
            description=template["description"],
            type=template["type"],
            version=current,
            parent_name=template["parent_name"],
            updated_at=template["updated_at"],
        ),
        sections=sections,
        versions=[
            EditorVersion(
                version=v["version"],
                reason=v["reason"],
                created_at=v["created_at"],
                current=v["version"] == current,
            )
            for v in versions
        ],
        can_undo=any(v["version"] < current for v in versions),
        can_redo=any(v["version"] > current for v in versions),
        issues=checks(
            html,
            [r["key"] for r in rows],
            forbidden_terms=list((template["instructions"] or {}).get("forbidden_terms", [])),
            asset_origins=(storage.public_url("library-assets", ""),),
        ),
        look=look(html),
        words=words,
        read_minutes=read_minutes(words),
    )


def editor_state(org_id: UUID, template_id: UUID) -> TemplateEditorState:
    """Everything the section editor shows for one of the org's templates."""
    with transaction() as conn:
        template = _load(conn, org_id, template_id)
        rows = _sections(conn, template_id)
        versions = _versions(conn, template_id)
    html = storage.download("templates", template["html_path"]).decode("utf-8")
    return _state(template, rows, versions, html)


def _label(rows: list[dict[str, Any]], key: str) -> str:
    row = next((r for r in rows if r["key"] == key), None)
    if row is None:
        raise TemplateEditError("That section isn't in the template any more. Reload the page.")
    return str(row["label"])


def _move_reason(
    old: list[str], new: list[str], rows: list[dict[str, Any]], moved: str | None
) -> str:
    """ "Moved Hero up" when one section moved (preferring the one the user moved, since two
    neighbours swapping reads either way); "Reordered sections" otherwise."""
    for key in [moved, *old] if moved in old else old:
        assert key is not None
        if [k for k in old if k != key] == [k for k in new if k != key]:
            direction = "up" if new.index(key) < old.index(key) else "down"
            return f"Moved {_label(rows, key)} {direction}"
    return "Reordered sections"


def _apply(
    rows: list[dict[str, Any]], html: str, action: LayoutAction
) -> tuple[list[dict[str, Any]], str | None, str]:
    """The new section rows, the new page HTML (None when unchanged) and the version's reason."""
    keys = [r["key"] for r in rows]
    if isinstance(action, ReorderAction):
        if sorted(action.keys) != sorted(keys):
            raise TemplateEditError("The sections changed since you loaded them. Reload the page.")
        if action.keys == keys:
            raise TemplateEditError("The sections are already in that order.")
        new_html, _ = apply_layout(html, action.keys)
        if section_order(new_html) != action.keys:
            raise TemplateEditError(
                "That section can't move there: it sits in a different part of the page."
            )
        by_key = {r["key"]: r for r in rows}
        return (
            [by_key[k] for k in action.keys],
            new_html,
            _move_reason(keys, action.keys, rows, action.moved),
        )
    if isinstance(action, RemoveAction):
        label = _label(rows, action.key)
        row = next(r for r in rows if r["key"] == action.key)
        if not row["removable"]:
            raise TemplateEditError(f"{label} can't be removed from this template.")
        if len(rows) == 1:
            raise TemplateEditError("A template needs at least one section.")
        kept = [r for r in rows if r["key"] != action.key]
        new_html, _ = apply_layout(html, [r["key"] for r in kept])
        return kept, new_html, f"Removed {label}"
    if isinstance(action, DuplicateAction):
        label = _label(rows, action.key)
        index = keys.index(action.key)
        row = rows[index]
        if not row["duplicable"]:
            raise TemplateEditError(f"{label} can't be duplicated.")
        if len(rows) >= MAX_SECTIONS:
            raise TemplateEditError(f"A template can have up to {MAX_SECTIONS} sections.")
        match = DUPLICATE_KEY.match(action.key)
        root = match.group("base") if match and match.group("base") in keys else action.key
        taken = set(keys) | set(section_order(html))
        n = 2
        while f"{root}-{n}" in taken:
            n += 1
        copy = {**row, "key": f"{root}-{n}", "label": f"{label} (copy)", "removable": True}
        new_html = duplicate_section(html, action.key, copy["key"])
        return [*rows[: index + 1], copy, *rows[index + 1 :]], new_html, f"Duplicated {label}"
    if isinstance(action, RenameAction):
        old = _label(rows, action.key)
        label = " ".join(action.label.split())
        if not label:
            raise TemplateEditError("Give the section a name.")
        if label == old:
            raise TemplateEditError("That's already the section's name.")
        renamed = [{**r, "label": label} if r["key"] == action.key else r for r in rows]
        return renamed, None, f"Renamed {old} to {label}"
    raise TemplateEditError("Unknown edit.")  # pragma: no cover (the union is exhaustive)


def _write_sections(conn: Any, template_id: UUID, rows: list[dict[str, Any]]) -> None:
    conn.execute("delete from template_sections where template_id = %(t)s", {"t": template_id})
    for position, row in enumerate(rows):
        conn.execute(
            """
            insert into template_sections (template_id, key, role, label, position,
                                           removable, duplicable)
            values (%(t)s, %(key)s, %(role)s, %(label)s, %(position)s, %(removable)s,
                    %(duplicable)s)
            """,
            {"t": template_id, **{k: row[k] for k in SECTION_FIELDS}, "position": position},
        )


def _snapshot(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**{k: r[k] for k in SECTION_FIELDS}, "position": i} for i, r in enumerate(rows)]


def _new_version(
    conn: Any,
    template: dict[str, Any],
    rows: list[dict[str, Any]],
    reason: str,
    user_id: UUID | None,
    *,
    html: str | None = None,
    html_path: str | None = None,
) -> list[str]:
    """Saves the edit as the next version (discarding any redo history and keeping the newest
    12). `html` is new page content to store; otherwise the version reuses `html_path` (or the
    current page). Returns storage paths no version uses any more, to delete after commit."""
    template_id = template["id"]
    versions = _versions(conn, template_id)
    number = max([v["version"] for v in versions], default=template["version"]) + 1
    if html is not None:
        html_path = f"{template['org_id']}/{template_id}/v{number}.html"
        storage.upload(
            "templates", html_path, html.encode(), "text/html; charset=utf-8", upsert=True
        )
    path = html_path or template["html_path"]
    _write_sections(conn, template_id, rows)
    conn.execute(
        """
        insert into template_versions (template_id, version, html_path, sections, reason,
                                       created_by)
        values (%(t)s, %(v)s, %(path)s, %(sections)s, %(reason)s, %(user)s)
        """,
        {
            "t": template_id, "v": number, "path": path, "sections": Jsonb(_snapshot(rows)),
            "reason": reason, "user": user_id,
        },
    )  # fmt: skip
    conn.execute(
        "update templates set html_path = %(path)s, version = %(v)s where id = %(t)s",
        {"path": path, "v": number, "t": template_id},
    )
    # The redo history (versions after the current one) goes, and only the newest 12 stay.
    kept = [v for v in versions if v["version"] <= template["version"]][: MAX_VERSIONS - 1]
    dropped = [v for v in versions if v not in kept]
    if dropped:
        conn.execute(
            "delete from template_versions where template_id = %(t)s and version = any(%(v)s)",
            {"t": template_id, "v": [v["version"] for v in dropped]},
        )
    in_use = {path, *(v["html_path"] for v in kept)}
    return sorted({v["html_path"] for v in dropped} - in_use)


def _remove_files(paths: list[str]) -> None:
    if paths:
        storage.remove("templates", paths)


def edit_layout(
    org_id: UUID, template_id: UUID, user_id: UUID | None, base_version: int, action: LayoutAction
) -> TemplateEditorState:
    """Applies one section edit and saves it as a new version. `base_version` is the version the
    editor showed; a different current version means someone else changed it first."""
    with transaction() as conn:
        template = _load(conn, org_id, template_id, lock=True)
        if template["version"] != base_version:
            raise TemplateConflictError
        rows = _sections(conn, template_id)
        html = storage.download("templates", template["html_path"]).decode("utf-8")
        new_rows, new_html, reason = _apply(rows, html, action)
        stale = _new_version(conn, template, new_rows, reason, user_id, html=new_html)
        template = _load(conn, org_id, template_id)
        versions = _versions(conn, template_id)
    _remove_files(stale)
    return _state(template, new_rows, versions, new_html if new_html is not None else html)


def step(
    org_id: UUID,
    template_id: UUID,
    base_version: int,
    direction: Literal["undo", "redo"],
) -> TemplateEditorState:
    """Undo or redo: moves the template to the previous or next saved version."""
    with transaction() as conn:
        template = _load(conn, org_id, template_id, lock=True)
        if template["version"] != base_version:
            raise TemplateConflictError
        target = conn.execute(
            f"""
            select version, html_path, sections from template_versions
            where template_id = %(t)s and version {"<" if direction == "undo" else ">"} %(v)s
            order by version {"desc" if direction == "undo" else "asc"} limit 1
            """,
            {"t": template_id, "v": template["version"]},
        ).fetchone()
        if target is None:
            raise TemplateEditError(f"Nothing to {direction}.")
        rows = sorted(target["sections"], key=lambda r: r["position"])
        _write_sections(conn, template_id, rows)
        conn.execute(
            "update templates set html_path = %(path)s, version = %(v)s where id = %(t)s",
            {"path": target["html_path"], "v": target["version"], "t": template_id},
        )
        template = _load(conn, org_id, template_id)
        versions = _versions(conn, template_id)
    html = storage.download("templates", template["html_path"]).decode("utf-8")
    return _state(template, rows, versions, html)


def restore(
    org_id: UUID, template_id: UUID, user_id: UUID | None, base_version: int, version: int
) -> TemplateEditorState:
    """Makes an earlier version current again, as a new version (so it can be undone)."""
    with transaction() as conn:
        template = _load(conn, org_id, template_id, lock=True)
        if template["version"] != base_version:
            raise TemplateConflictError
        target = conn.execute(
            """
            select version, html_path, sections from template_versions
            where template_id = %(t)s and version = %(v)s
            """,
            {"t": template_id, "v": version},
        ).fetchone()
        if target is None:
            raise TemplateEditError("That version isn't kept any more.")
        if target["version"] == template["version"]:
            raise TemplateEditError("That's the current version.")
        rows = sorted(target["sections"], key=lambda r: r["position"])
        stale = _new_version(
            conn, template, rows, f"Restored version {version}", user_id,
            html_path=target["html_path"],
        )  # fmt: skip
        template = _load(conn, org_id, template_id)
        versions = _versions(conn, template_id)
    _remove_files(stale)
    html = storage.download("templates", template["html_path"]).decode("utf-8")
    return _state(template, rows, versions, html)
