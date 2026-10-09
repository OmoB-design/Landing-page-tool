"""The fetch ladder (BUILD_SPEC §8.4, used by brand autofetch now and cloning in M2):

1. a plain GET with a desktop Chrome user agent (no Accept-Language, so Shopify Markets does not
   localise prices to the fetcher's country);
2. on 403/429, one retry after Retry-After, capped at 8 s;
3. a real browser (Playwright Chromium) when the response is blocked or looks like a bot wall.

The residential proxy step is M2 and off by default (D4). Every URL, including each redirect,
passes the SSRF guard.
"""

import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urljoin, urlsplit

import httpx
import structlog

from app.config import get_settings
from app.fetch import browser
from app.fetch.safety import check_public_url
from app.jobs.errors import UserFacingError

log = structlog.get_logger()

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
WALL_MARKERS = ("just a moment", "cf-chl", "captcha", "access denied", "attention required")
MAX_REDIRECTS = 5


@dataclass(frozen=True)
class FetchedPage:
    url: str  # after redirects
    status: int
    html: str
    via: Literal["http", "browser"]


class FetchError(UserFacingError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="fetch_failed")


def looks_like_bot_wall(status: int, html: str) -> bool:
    """A challenge page, not the site. The markers are only trusted in the <title> or on a small
    page: Shopify themes ship `data-nocaptcha` in their scripts (docs/TEMPLATE_GUIDE.md)."""
    if status in (403, 429, 503):
        return True
    lower = html.lower()
    title = lower.split("<title", 1)[1].split("</title>", 1)[0] if "<title" in lower else ""
    if any(marker in title for marker in WALL_MARKERS):
        return True
    return len(html) < 5_000 and any(marker in lower for marker in WALL_MARKERS)


@contextmanager
def _client(client: httpx.Client | None) -> Iterator[httpx.Client]:
    if client is not None:
        yield client
        return
    with httpx.Client(
        headers=HEADERS, timeout=get_settings().lp_fetch_timeout_seconds
    ) as new_client:
        yield new_client


def _get(client: httpx.Client, url: str, max_bytes: int) -> tuple[str, int, bytes, httpx.Headers]:
    """GET following redirects by hand, so each hop is checked. Returns (final url, status,
    body capped at max_bytes, response headers)."""
    current = check_public_url(url)
    for _ in range(MAX_REDIRECTS + 1):
        with client.stream("GET", current, follow_redirects=False) as response:
            if response.is_redirect and "location" in response.headers:
                current = check_public_url(urljoin(current, response.headers["location"]))
                continue
            body = b""
            for chunk in response.iter_bytes():
                body += chunk
                if len(body) > max_bytes:
                    raise FetchError("That page is too large to read.")
            return current, response.status_code, body, response.headers
    raise FetchError("That address redirects too many times.")


def fetch_page(
    url: str, *, client: httpx.Client | None = None, use_browser: bool = True
) -> FetchedPage:
    """The page's HTML, from a plain request or, if that is blocked, a real browser."""
    check_public_url(url)
    host = urlsplit(url).hostname or url
    max_bytes = get_settings().lp_fetch_max_bytes
    reason = ""
    try:
        with _client(client) as http:
            final, status, body, headers = _get(http, url, max_bytes)
            if status in (403, 429):
                time.sleep(retry_delay(headers.get("retry-after")))
                final, status, body, headers = _get(http, url, max_bytes)
            html = body.decode("utf-8", errors="replace")
            if 200 <= status < 300 and not looks_like_bot_wall(status, html):
                return FetchedPage(final, status, html, "http")
            reason = f"status {status}"
    except httpx.HTTPError as exc:
        reason = type(exc).__name__
    log.info("plain fetch blocked; trying a browser", url=url, reason=reason)

    if use_browser:
        final, status, html = browser.fetch_html(url)
        if 200 <= status < 300 and not looks_like_bot_wall(status, html):
            return FetchedPage(final, status, html, "browser")
        if looks_like_bot_wall(status, html):
            raise FetchError(
                f"{host} blocked automated access (bot protection). Try again later, or fill "
                "in the details by hand."
            )
        reason = f"status {status}"
    raise FetchError(f"Couldn't load {host} ({reason}). Check the address and try again.")


def retry_delay(retry_after: str | None) -> float:
    """Seconds to wait before the one retry: the server's Retry-After (in seconds), capped at
    8 s; 2 s when it is missing or a date."""
    try:
        return min(max(float(retry_after or ""), 0.0), 8.0)
    except ValueError:
        return 2.0


def fetch_bytes(
    url: str, *, max_bytes: int = 5_000_000, client: httpx.Client | None = None
) -> tuple[bytes, str]:
    """Downloads a small file (logo, favicon, product image). Returns (bytes, content type)."""
    with _client(client) as http:
        try:
            _, status, body, headers = _get(http, url, max_bytes)
        except httpx.HTTPError as exc:
            raise FetchError(f"Couldn't download {url} ({type(exc).__name__}).") from exc
    if not 200 <= status < 300:
        raise FetchError(f"Couldn't download {url} (status {status}).")
    return body, headers.get("content-type", "").split(";", 1)[0].strip().lower()
