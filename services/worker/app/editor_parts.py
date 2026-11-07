"""The page editor's section tree (B4.4, D123): each section's parts for a build, named as Shopify's
theme editor names its blocks. The map is the build's template's editor map (B4.1); the page is the
build's working page."""

from typing import Any
from uuid import UUID

from app import desk
from app.db import transaction
from app.engines import editor_map
from app.models.editor_map import EditorMap, PageParts


def template_map(conn: Any, template_id: UUID | None) -> EditorMap:
    """A template's editor map brought up to date with its sections (none: worked out from the
    page's markers alone)."""
    if template_id is None:
        return editor_map.effective(None, [])
    template = conn.execute(
        "select editor_map from templates where id = %(t)s", {"t": template_id}
    ).fetchone()
    rows = conn.execute(
        "select key, role, label from template_sections where template_id = %(t)s "
        "order by position",
        {"t": template_id},
    ).fetchall()
    return editor_map.effective(
        template["editor_map"] if template else None, [dict(r) for r in rows]
    )


def page_parts(org_id: UUID, build_id: UUID) -> PageParts:
    """Each section's parts on the build's page now. Raises desk.DeskNotFoundError."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id)
        current = template_map(conn, build["template_id"])
    return PageParts(
        version=build["page_version"], sections=editor_map.parts(desk._page(build), current)
    )
