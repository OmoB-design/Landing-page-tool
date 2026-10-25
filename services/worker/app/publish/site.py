"""A brand's site on Vercel (D87). Pure.

One Vercel project per brand; each published page is `<key>.html` (e.g. `bre-12.html`), served at
`/<key>` with clean URLs, so every deployment carries all of the brand's live pages and publishing
one never takes another down. The site's root has no page.
"""

import json
import re


def page_path(build_key: str) -> str:
    """`BRE-12` → `bre-12`."""
    return re.sub(r"[^a-z0-9-]+", "-", build_key.lower()).strip("-")


def project_name(brand_prefix: str) -> str:
    """`BRE` → `lp-bre` (Vercel project names: lowercase letters, digits and dashes)."""
    return f"lp-{page_path(brand_prefix)}"


def files(pages: dict[str, str]) -> dict[str, bytes]:
    """The deployment's files: each page by its key, and the config that serves `/<key>`."""
    out = {f"{page_path(key)}.html": html.encode("utf-8") for key, html in pages.items()}
    out["vercel.json"] = json.dumps({"cleanUrls": True}).encode("utf-8")
    return out
