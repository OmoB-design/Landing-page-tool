"""Check and fill in the Shopify editor maps of templates (B4.1, D120).

    uv run python -m app.cli.editor_map                 # every template: the dry run, nothing saved
    uv run python -m app.cli.editor_map <slug|id> ...   # some templates
    uv run python -m app.cli.editor_map --write         # also save each map

For each template it prints what would become editable in Shopify (sections, texts, pictures,
videos and embeds), what can't be edited there (it still shows on the page), and anything over
Shopify's limits. With --write each map is saved, brought up to date with the template's sections
(a map in an older format is worked out again). Library templates and every workspace's own
templates; nothing in Trash.
"""

import argparse
import sys
from typing import Any

from psycopg.types.json import Jsonb

from app.db import transaction
from app.engines import editor_map
from app.providers import storage
from app.providers.storage import StorageError


def _templates(targets: list[str]) -> list[dict[str, Any]]:
    with transaction() as conn:
        rows = conn.execute(
            """
            select t.id, t.org_id, t.slug, t.name, t.origin, t.html_path, t.editor_map,
                   o.name as org_name
            from templates t left join orgs o on o.id = t.org_id
            where t.deleted_at is null
              and (cardinality(%(targets)s::text[]) = 0
                   or t.slug = any(%(targets)s) or t.id::text = any(%(targets)s))
            order by t.org_id nulls first, t.slug
            """,
            {"targets": targets},
        ).fetchall()
        out = []
        for row in rows:
            sections = conn.execute(
                "select key, role, label from template_sections where template_id = %(t)s "
                "order by position",
                {"t": row["id"]},
            ).fetchall()
            out.append({**row, "sections": [dict(s) for s in sections]})
    return out


def check(template: dict[str, Any], *, write: bool) -> bool:
    """Prints one template's dry run (and saves its map with `write`); False when it has errors."""
    scope = "library" if template["org_id"] is None else template["org_name"] or "workspace"
    label = f"{template['slug']} ({scope})"
    bucket = "library" if template["org_id"] is None else "templates"
    try:
        html = storage.download(bucket, template["html_path"]).decode("utf-8")
    except StorageError as exc:
        print(f"{label}: couldn't read its page ({exc})", file=sys.stderr)
        return False
    current = editor_map.effective(template["editor_map"], template["sections"])
    if template["origin"] == "cloned" and current.source == "markup":
        current = current.model_copy(update={"source": "analysis"})
    summary = editor_map.report(editor_map.plan(html, current, template=True), template["slug"])
    print(
        f"{label}: {len(summary.sections)} sections · {summary.texts} texts · "
        f"{summary.images} pictures"
        + (f" · {summary.media} videos or embeds" if summary.media else "")
        + f" editable · {summary.static} can't be edited in Shopify"
        + ("" if summary.ready else " · NOT READY")
    )
    for issue in summary.issues:
        print(f"  {issue.level}: {issue.message}")
    if write:
        with transaction() as conn:
            conn.execute(
                "update templates set editor_map = %(m)s where id = %(t)s",
                {"m": Jsonb(current.model_dump()), "t": template["id"]},
            )
    return summary.ready


def main() -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("targets", nargs="*", help="template slugs or ids (default: all)")
    parser.add_argument("--write", action="store_true", help="save each template's map")
    args = parser.parse_args()
    templates = _templates(args.targets)
    if not templates:
        print("No templates found.", file=sys.stderr)
        return 1
    ready = [check(t, write=args.write) for t in templates]
    saved = " and saved" if args.write else ""
    print(f"\n{sum(ready)} of {len(ready)} templates ready for Shopify editing{saved}.")
    return 0 if all(ready) else 1


if __name__ == "__main__":
    sys.exit(main())
