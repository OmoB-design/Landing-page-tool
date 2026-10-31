"""Copies the foreign files a cloned page keeps (woff2 fonts, layout libraries, kept images such
as stars and badges) into the org's public assets, so the page no longer loads anything from the
source (B2.3, D100). One copy per org and file (the asset index dedupes by content). A file that
fails, is too big, or isn't what it claims to be is simply not copied: the purge then drops it."""

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from uuid import UUID

import structlog

from app.fetch.ladder import FetchError, fetch_bytes
from app.fetch.safety import UnsafeUrlError
from app.providers import storage

log = structlog.get_logger()

MAX_FILE = 1_000_000  # bytes
MAX_TOTAL = 8_000_000  # bytes per build
WORKERS = 6
ACCEPT = {
    "font": {"font/woff2", "application/font-woff2", "application/octet-stream"},
    "script": {"text/javascript", "application/javascript", "application/x-javascript"},
    "image": {"image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"},
}
STORED_AS = {"font": "font/woff2", "script": "text/javascript"}

Fetch = Callable[[str], tuple[bytes, str]]


@dataclass
class Budget:
    """What's left of a build's allowance for copied files."""

    remaining: int = MAX_TOTAL


def _download(url: str, fetch: Fetch) -> tuple[str, bytes, str] | None:
    try:
        data, mime = fetch(url)
    except (FetchError, UnsafeUrlError, OSError) as exc:
        log.info("copy_in.skipped", url=url, reason=str(exc)[:200])
        return None
    return url, data, mime


def copy_in(
    org_id: UUID,
    urls: list[str],
    *,
    kind: str,
    budget: Budget,
    fetch: Fetch | None = None,
) -> dict[str, str]:
    """Downloads each URL and stores it; returns {source URL: copy's public URL} for the ones
    that made it."""
    if not urls:
        return {}
    getter: Fetch = fetch or (lambda url: fetch_bytes(url, max_bytes=MAX_FILE))
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(lambda url: _download(url, getter), urls))
    copied: dict[str, str] = {}
    for result in results:
        if result is None:
            continue
        url, data, mime = result
        if mime not in ACCEPT[kind] or not data or len(data) > MAX_FILE:
            continue
        if kind == "font" and not data.startswith(b"wOF2"):
            continue
        if len(data) > budget.remaining:
            log.info("copy_in.over_budget", url=url)
            continue
        budget.remaining -= len(data)
        asset = storage.store_asset(org_id, data, STORED_AS.get(kind, mime), source_url=url)
        copied[url] = asset.url
    return copied
