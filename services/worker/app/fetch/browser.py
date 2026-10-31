"""Real-browser access with Playwright Chromium: the fetch ladder's last step, and the rendered
pass of brand autofetch (computed colours and fonts, which the raw HTML does not show).

One browser at a time per worker process (the owner's machine has 8 GB). Every request the page
makes is checked by the SSRF guard; requests to private or local addresses are aborted.
"""

import io
import threading
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from typing import Any
from urllib.parse import unquote, urlsplit

import structlog
from playwright.sync_api import Page, ProxySettings, Route, sync_playwright
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from pydantic import BaseModel, Field

from app.fetch.safety import check_public_url, is_public_url

log = structlog.get_logger()

_ONE_BROWSER = threading.Semaphore(1)
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)
NAV_TIMEOUT_MS = 30_000


def _guard(route: Route) -> None:
    url = route.request.url
    if url.startswith(("data:", "blob:")) or is_public_url(url):
        route.continue_()
    else:
        route.abort()


def _proxy_settings(proxy: str) -> ProxySettings:
    """Playwright wants the proxy's server and credentials apart: http://user:pass@host:port."""
    parts = urlsplit(proxy)
    settings: ProxySettings = {
        "server": f"{parts.scheme or 'http'}://{parts.hostname}:{parts.port}"
    }
    if parts.username:
        settings["username"] = unquote(parts.username)
        settings["password"] = unquote(parts.password or "")
    return settings


@contextmanager
def open_page(proxy: str | None = None) -> Iterator[Page]:
    with _ONE_BROWSER, sync_playwright() as playwright:
        browser = playwright.chromium.launch(proxy=_proxy_settings(proxy) if proxy else None)
        try:
            context = browser.new_context(
                user_agent=USER_AGENT, viewport={"width": 1440, "height": 900}
            )
            page = context.new_page()
            page.route("**/*", _guard)
            yield page
        finally:
            browser.close()


def fetch_html(url: str, proxy: str | None = None) -> tuple[str, int, str]:
    """(final url, status, html) as a browser sees them."""
    check_public_url(url)
    with open_page(proxy) as page:
        response = page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        page.wait_for_timeout(1500)  # late redirects and challenge scripts
        return page.url, response.status if response else 0, page.content()


def screenshot_html(html: str) -> bytes:
    """An 800x600 JPEG of the top of a page at desktop width, for a template card. Unlike the
    library's thumbnails (our own pages), this is someone else's page, so every request it makes
    passes the SSRF guard."""
    from PIL import Image

    with open_page() as page:
        page.set_viewport_size({"width": 1280, "height": 960})
        # A slow image or font: take what has drawn.
        with suppress(PlaywrightTimeoutError):
            page.set_content(html, wait_until="load", timeout=NAV_TIMEOUT_MS)
        page.wait_for_timeout(800)  # web fonts and scripted layout
        shot = page.screenshot(clip={"x": 0, "y": 0, "width": 1280, "height": 960})
    image = Image.open(io.BytesIO(shot)).convert("RGB").resize((800, 600))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=82, optimize=True)
    return out.getvalue()


class ColorSample(BaseModel):
    color: str
    weight: float


class RenderedSignals(BaseModel):
    """What the rendered page shows: colours by where they appear, fonts and language."""

    button_colors: list[ColorSample] = Field(default_factory=list)
    brand_surface_colors: list[ColorSample] = Field(default_factory=list)
    text_colors: list[ColorSample] = Field(default_factory=list)
    heading_font: str | None = None
    body_font: str | None = None
    lang: str | None = None


# Runs in the page. Collects background colours of buttons (weighted by area), colours of the
# brand surfaces (header, footer, announcement bars, links, buttons) and text colours.
_COLLECT_JS = """
() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none'
      && Number(s.opacity) > 0.2;
  };
  const add = (map, color, weight) => {
    if (!color || color === 'transparent' || color.startsWith('rgba(0, 0, 0, 0)')) return;
    map[color] = (map[color] || 0) + weight;
  };
  const buttons = {}, surfaces = {}, text = {};
  const buttonSel = 'button, [type=submit], [role=button], a[class*="btn" i], a[class*="button" i]';
  document.querySelectorAll(buttonSel).forEach((el, i) => {
    if (i > 300 || !visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) return;
    const s = getComputedStyle(el);
    add(buttons, s.backgroundColor, Math.min(r.width * r.height, 40000));
    add(surfaces, s.backgroundColor, Math.min(r.width * r.height, 40000));
    add(surfaces, s.borderTopColor, r.width * 2);
  });
  const surfaceSel = 'header, footer, nav, [class*="header" i], [class*="footer" i], '
    + '[class*="announcement" i], [class*="banner" i]';
  document.querySelectorAll(surfaceSel).forEach((el, i) => {
    if (i > 120 || !visible(el)) return;
    const r = el.getBoundingClientRect();
    add(surfaces, getComputedStyle(el).backgroundColor, Math.min(r.width * r.height, 200000) / 4);
  });
  document.querySelectorAll('a').forEach((el, i) => {
    if (i > 400 || !visible(el)) return;
    add(surfaces, getComputedStyle(el).color, (el.textContent || '').trim().length * 4);
  });
  document.querySelectorAll('h1, h2, h3, p, li, span').forEach((el, i) => {
    if (i > 1500 || !visible(el)) return;
    add(text, getComputedStyle(el).color, Math.min((el.textContent || '').trim().length, 400));
  });
  const font = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fontFamily : null;
  };
  const list = (m) => Object.entries(m).map(([color, weight]) => ({ color, weight }))
    .sort((a, b) => b.weight - a.weight).slice(0, 40);
  return {
    button_colors: list(buttons),
    brand_surface_colors: list(surfaces),
    text_colors: list(text),
    heading_font: font('h1') || font('h2'),
    body_font: font('p') || getComputedStyle(document.body).fontFamily,
    lang: document.documentElement.lang || null,
  };
}
"""


def render_signals(url: str) -> RenderedSignals:
    """Loads the page in Chromium and reads computed colours and fonts."""
    check_public_url(url)
    with open_page() as page:
        page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        try:
            page.wait_for_load_state("load", timeout=10_000)
        except Exception:  # slow third-party assets; what has rendered is enough
            log.info("page load slow; reading what rendered", url=url)
        page.wait_for_timeout(1200)
        return read_signals(page)


def read_signals(page: Page) -> RenderedSignals:
    data: dict[str, Any] = page.evaluate(_COLLECT_JS)
    return RenderedSignals.model_validate(data)
