"""Org templates (BUILD_SPEC §8.3, D61): "Use template" copies a library template into the org.
Template file operations run here, in the worker, as quick direct calls (no AI, no job)."""

import uuid
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from app.db import transaction
from app.providers import storage

SECTION_FIELDS = ("key", "role", "label", "position", "removable", "duplicable")


class TemplateNotFoundError(Exception):
    pass


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
