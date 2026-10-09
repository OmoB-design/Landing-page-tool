"""Loads curated library templates (`templates/library/<slug>/`) into storage and the database
(template-onboarding skill, step 7). Safe to re-run: a template whose HTML changed gets a new
version; its section rows are replaced.

    uv run python -m app.cli.seed_library            # every folder in templates/library
    uv run python -m app.cli.seed_library advertorial-fixture
"""

import argparse
import json
import sys
from pathlib import Path

from psycopg.types.json import Jsonb

from app.db import transaction
from app.engines.html import parse
from app.engines.sections import top_level_sections
from app.models.template import TemplateInstructions, TemplateManifest
from app.providers import storage
from app.providers.storage import StorageError

LIBRARY = Path(__file__).resolve().parents[4] / "templates" / "library"


class SeedError(Exception):
    pass


def load_folder(folder: Path) -> tuple[TemplateManifest, TemplateInstructions, str]:
    manifest = TemplateManifest.model_validate_json((folder / "template.json").read_text())
    instructions_file = folder / "instructions.json"
    instructions = TemplateInstructions.model_validate(
        json.loads(instructions_file.read_text()) if instructions_file.exists() else {}
    )
    html = (folder / "index.html").read_text()
    if manifest.slug != folder.name:
        raise SeedError(f"{folder.name}: template.json slug is {manifest.slug}.")
    in_page = [str(s["data-lp-section"]) for s in top_level_sections(parse(html))]
    declared = [s.key for s in manifest.sections]
    if in_page != declared:
        raise SeedError(
            f"{folder.name}: sections in index.html {in_page} don't match template.json {declared}."
        )
    return manifest, instructions, html


def seed(folder: Path) -> str:
    manifest, instructions, html = load_folder(folder)
    html_path = f"{manifest.slug}/index.html"
    try:
        current = storage.download("library", html_path).decode("utf-8")
    except StorageError:
        current = None
    changed = current != html
    if changed:
        storage.upload(
            "library", html_path, html.encode("utf-8"), "text/html; charset=utf-8", upsert=True
        )
    thumb_path = None
    if (folder / "thumb.png").exists():
        thumb_path = f"{manifest.slug}/thumb.png"
        storage.upload(
            "library", thumb_path, (folder / "thumb.png").read_bytes(), "image/png", upsert=True
        )

    fields = {
        "slug": manifest.slug,
        "name": manifest.name,
        "type": manifest.type,
        "description": manifest.description,
        "html_path": html_path,
        "thumb_path": thumb_path,
        "instructions": Jsonb(instructions.model_dump()),
        "source_palette": Jsonb(manifest.source_palette.model_dump(exclude_none=True)),
    }
    with transaction() as conn:
        row = conn.execute(
            "select id, version from templates where org_id is null and slug = %(slug)s",
            {"slug": manifest.slug},
        ).fetchone()
        if row is None:
            row = conn.execute(
                """
                insert into templates (org_id, origin, slug, name, type, description, html_path,
                                       thumb_path, instructions, source_palette)
                values (null, 'owned', %(slug)s, %(name)s, %(type)s, %(description)s,
                        %(html_path)s, %(thumb_path)s, %(instructions)s, %(source_palette)s)
                returning id, version
                """,
                fields,
            ).fetchone()
            state = "added"
        else:
            row = conn.execute(
                """
                update templates set name = %(name)s, type = %(type)s,
                  description = %(description)s, html_path = %(html_path)s,
                  thumb_path = %(thumb_path)s, instructions = %(instructions)s,
                  source_palette = %(source_palette)s,
                  version = version + %(bump)s
                where id = %(id)s
                returning id, version
                """,
                {**fields, "id": row["id"], "bump": 1 if changed else 0},
            ).fetchone()
            state = "updated" if changed else "unchanged"
        assert row is not None
        conn.execute("delete from template_sections where template_id = %(t)s", {"t": row["id"]})
        for position, section in enumerate(manifest.sections):
            conn.execute(
                """
                insert into template_sections (template_id, key, role, label, position,
                                               removable, duplicable)
                values (%(t)s, %(key)s, %(role)s, %(label)s, %(pos)s, %(removable)s,
                        %(duplicable)s)
                """,
                {"t": row["id"], "pos": position, **section.model_dump()},
            )
    return f"{manifest.slug}: {state} (version {row['version']}, {len(manifest.sections)} sections)"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("slugs", nargs="*", help="template folders to load (default: all)")
    parser.add_argument("--root", type=Path, default=LIBRARY)
    args = parser.parse_args()
    folders = [args.root / s for s in args.slugs] or sorted(
        p for p in args.root.iterdir() if (p / "template.json").exists()
    )
    failed = False
    for folder in folders:
        try:
            print(seed(folder))
        except (SeedError, OSError, ValueError) as exc:
            failed = True
            print(f"{folder.name}: {exc}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
