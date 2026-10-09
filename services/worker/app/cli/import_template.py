"""Imports a live page as a draft library template folder (template-onboarding skill, "live
websites"): `templates/library/<slug>/` with index.html, assets/, and draft template.json and
instructions.json. The section and slot markup is then finished by hand before seeding.

    uv run python -m app.cli.import_template https://example.vercel.app/ my-advertorial \\
        --type advertorial --name "30-day wear test"
"""

import argparse
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from app.cli.seed_library import LIBRARY
from app.engines.html import parse
from app.engines.template_import import asset_name, import_page, relink
from app.fetch import ladder

MAX_PAGE_BYTES = 20_000_000
RECOMPRESS_OVER = 250_000  # bytes: large photos become JPEGs at most 1600 px wide
MAX_WIDTH = 1600


def recompress(data: bytes, mime: str) -> tuple[bytes, str]:
    if len(data) <= RECOMPRESS_OVER or mime not in ("image/png", "image/jpeg", "image/webp"):
        return data, mime
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.mode in ("RGBA", "LA", "P"):
                lowest = source.convert("RGBA").getchannel("A").getextrema()[0]
                if float(lowest) < 255:  # type: ignore[arg-type]
                    return data, mime  # has transparency: keep it lossless
            photo: Image.Image = source.convert("RGB")
            if photo.width > MAX_WIDTH:
                photo = photo.resize((MAX_WIDTH, round(photo.height * MAX_WIDTH / photo.width)))
            out = io.BytesIO()
            photo.save(out, format="JPEG", quality=82, optimize=True, progressive=True)
    except (UnidentifiedImageError, OSError):
        return data, mime
    return (out.getvalue(), "image/jpeg") if out.tell() < len(data) else (data, mime)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("url")
    parser.add_argument("slug")
    parser.add_argument("--type", default="other")
    parser.add_argument("--name")
    parser.add_argument("--root", type=Path, default=LIBRARY)
    args = parser.parse_args()
    folder: Path = args.root / args.slug
    if folder.exists():
        print(f"{folder} already exists; remove it to import again.", file=sys.stderr)
        return 1

    page = ladder.fetch_page(args.url, max_bytes=MAX_PAGE_BYTES)
    result = import_page(page.html)
    html = result.html
    files = dict(result.files)

    downloaded: dict[str, str] = {}
    for url in result.external_images:
        try:
            data, mime = ladder.fetch_bytes(url, max_bytes=15_000_000)
        except ladder.FetchError as exc:
            print(f"  skipped {url}: {exc.message}")
            continue
        name = asset_name(data, mime)
        files[name] = (data, mime)
        downloaded[url] = name
    html = relink(html, downloaded)

    folder.mkdir(parents=True)
    (folder / "assets").mkdir()
    saved = 0
    for name, (data, mime) in files.items():
        small, small_mime = recompress(data, mime)
        final = name if small_mime == mime else re.sub(r"\.[a-z0-9]+$", ".jpg", name)
        if final != name:
            html = html.replace(name, final)
        (folder / final).write_bytes(small)
        saved += len(small)
    (folder / "index.html").write_text(html)

    soup = parse(html)
    title = soup.title.get_text(strip=True) if soup.title else args.slug
    site = soup.find("meta", attrs={"property": "og:site_name"})
    manifest = {
        "slug": args.slug,
        "name": args.name or title,
        "type": args.type,
        "description": "",
        "source_palette": {"primary": "#000000"},
        "sections": [],
    }
    instructions = {
        "copy_rules": "",
        "length_caps": [],
        "image_rules": "",
        "generic_images": [],
        "keep_images": [],
        "forbidden_terms": [str(site["content"])] if site and site.get("content") else [],
        "notes": (
            f"Imported from {args.url}. Finish the markup (template-onboarding skill) "
            "before seeding."
        ),
    }
    (folder / "template.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (folder / "instructions.json").write_text(json.dumps(instructions, indent=2) + "\n")
    print(
        f"{args.slug}: {len(page.html) // 1024} KB page -> {len(html.encode()) // 1024} KB html "
        f"+ {len(files)} files ({saved // 1024} KB); {result.stats}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
