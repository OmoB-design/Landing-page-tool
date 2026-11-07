"""Check that templates keep their layout as editable Shopify pages (B4.3, D122).

    uv run python -m app.cli.shopify_check                 # every template, nothing saved
    uv run python -m app.cli.shopify_check <slug|id> ...   # some templates
    uv run python -m app.cli.shopify_check --write         # also keep each result with its map

For each template, the theme files an editable Shopify page would get are made, Shopify's render
of them is worked out locally and compared with the page in a browser at desktop, tablet and phone,
and the split into Shopify sections is fixed until they match (the same check publishing runs). It
prints how the page was split (one section per LP section, parts kept together, or the whole page
as one section) and whether it matched. Free: no Shopify, no AI. Needs Playwright's Chromium.
Library templates and every workspace's own; nothing in Trash.
"""

import argparse
import sys
from typing import Any

from psycopg.types.json import Jsonb

from app.db import transaction
from app.engines import editor_map, shopify_theme
from app.providers import storage
from app.providers.storage import StorageError
from app.publish import parity


def _templates(targets: list[str]) -> list[dict[str, Any]]:
    with transaction() as conn:
        rows = conn.execute(
            """
            select t.id, t.org_id, t.slug, t.version, t.html_path, t.editor_map,
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
    """Prints one template's layout check (and keeps it with `write`); False unless it matched."""
    scope = "library" if template["org_id"] is None else template["org_name"] or "workspace"
    label = f"{template['slug']} ({scope})"
    bucket = "library" if template["org_id"] is None else "templates"
    try:
        html = storage.download(bucket, template["html_path"]).decode("utf-8")
    except StorageError as exc:
        print(f"{label}: couldn't read its page ({exc})", file=sys.stderr)
        return False
    current = editor_map.effective(template["editor_map"], template["sections"])
    try:
        result = parity.check(html, current, slug=template["slug"] or "page", version=1)
    except shopify_theme.ThemeTooBigError as exc:
        print(f"{label}: {exc}")
        return False
    summary = parity.summary(result, version=template["version"])
    how = {
        "sections": "one Shopify section per LP section",
        "grouped": "parts kept together: " + ", ".join(summary.kept_together),
        "coarse": "the whole page as one section",
    }[summary.mode]
    print(
        f"{label}: {summary.sections} sections, {how} · "
        + ("matches" if summary.matched else "DIFFERS")
        + " ("
        + ", ".join(f"{w} {'ok' if ok else 'off'}" for w, ok in summary.widths.items())
        + ")"
    )
    for difference in summary.differences:
        print(f"  {difference}")
    if write:
        with transaction() as conn:
            conn.execute(
                "update templates set editor_map = %(m)s where id = %(t)s",
                {
                    "m": Jsonb(
                        current.model_copy(update={"layout": summary}).model_dump(mode="json")
                    ),
                    "t": template["id"],
                },
            )
    return summary.matched


def main() -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("targets", nargs="*", help="template slugs or ids (default: all)")
    parser.add_argument("--write", action="store_true", help="keep each result with its map")
    args = parser.parse_args()
    templates = _templates(args.targets)
    if not templates:
        print("No templates found.", file=sys.stderr)
        return 1
    matched = [check(t, write=args.write) for t in templates]
    saved = " (results kept)" if args.write else ""
    print(f"\n{sum(matched)} of {len(matched)} templates keep their layout in Shopify{saved}.")
    return 0 if all(matched) else 1


if __name__ == "__main__":
    sys.exit(main())
