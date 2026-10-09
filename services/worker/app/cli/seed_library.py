"""Loads curated library templates (`templates/library/<slug>/`) into storage and the database
(template-onboarding skill, step 7). Safe to re-run: a template whose HTML changed gets a new
version; its section rows are replaced.

    uv run python -m app.cli.seed_library            # every folder in templates/library
    uv run python -m app.cli.seed_library advertorial-fixture
"""

import argparse
import io
import json
import re
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


ASSET_REF = re.compile(r"""(?<=["'(\s,])assets/[\w.-]+""")
MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
    ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif", ".ico": "image/x-icon",
    ".woff2": "font/woff2", ".woff": "font/woff",
}  # fmt: skip


def publish_assets(folder: Path, slug: str, html: str) -> str:
    """Uploads the template's `assets/` files to the public `library-assets` bucket and points
    the HTML at them (the repo copy keeps relative paths so it opens in a browser as-is)."""
    assets = folder / "assets"
    if not assets.is_dir():
        return html
    for file in sorted(assets.iterdir()):
        if file.suffix.lower() in MIME:
            storage.upload(
                "library-assets", f"{slug}/{file.name}", file.read_bytes(),
                MIME[file.suffix.lower()], upsert=True,
            )  # fmt: skip
    return ASSET_REF.sub(
        lambda m: storage.public_url("library-assets", f"{slug}/{m.group(0)[len('assets/') :]}"),
        html,
    )


def render_thumbnail(html: str) -> bytes:
    """An 800x600 JPEG of the top of the page at desktop width (when there's no thumb.png)."""
    from PIL import Image
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 1280, "height": 960})
            page.set_content(html, wait_until="networkidle", timeout=60_000)
            shot = page.screenshot(clip={"x": 0, "y": 0, "width": 1280, "height": 960})
        finally:
            browser.close()
    image = Image.open(io.BytesIO(shot)).convert("RGB").resize((800, 600))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=82, optimize=True)
    return out.getvalue()


def seed(folder: Path, *, thumbnails: bool = True) -> str:
    manifest, instructions, html = load_folder(folder)
    html = publish_assets(folder, manifest.slug, html)
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
    thumb_path = f"{manifest.slug}/thumb.png"
    if (folder / "thumb.png").exists():
        storage.upload(
            "library", thumb_path, (folder / "thumb.png").read_bytes(), "image/png", upsert=True
        )
    else:
        thumb_path = f"{manifest.slug}/thumb.jpg"
        if thumbnails and (changed or not _exists("library", thumb_path)):
            storage.upload("library", thumb_path, render_thumbnail(html), "image/jpeg", upsert=True)
        elif not thumbnails and not _exists("library", thumb_path):
            thumb_path = None  # type: ignore[assignment]

    fields = {
        "slug": manifest.slug,
        "name": manifest.name,
        "type": manifest.type,
        "description": manifest.description,
        "html_path": html_path,
        "thumb_path": thumb_path,
        "instructions": Jsonb(instructions.model_dump()),
        "source_palette": Jsonb(manifest.source_palette.model_dump(exclude_none=True)),
        "status": manifest.status,
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
                                       thumb_path, instructions, source_palette, status)
                values (null, 'owned', %(slug)s, %(name)s, %(type)s, %(description)s,
                        %(html_path)s, %(thumb_path)s, %(instructions)s, %(source_palette)s,
                        %(status)s)
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
                  source_palette = %(source_palette)s, status = %(status)s,
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
    retired = " (retired)" if manifest.status == "retired" else ""
    return (
        f"{manifest.slug}: {state}{retired} (version {row['version']}, "
        f"{len(manifest.sections)} sections)"
    )


def _exists(bucket: str, path: str) -> bool:
    try:
        storage.download(bucket, path)
    except StorageError:
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("slugs", nargs="*", help="template folders to load (default: all)")
    parser.add_argument("--root", type=Path, default=LIBRARY)
    parser.add_argument("--no-thumbnails", action="store_true", help="skip rendering thumbnails")
    args = parser.parse_args()
    folders = [args.root / s for s in args.slugs] or sorted(
        p for p in args.root.iterdir() if (p / "template.json").exists()
    )
    failed = False
    for folder in folders:
        try:
            print(seed(folder, thumbnails=not args.no_thumbnails))
        except (SeedError, OSError, ValueError) as exc:
            failed = True
            print(f"{folder.name}: {exc}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
