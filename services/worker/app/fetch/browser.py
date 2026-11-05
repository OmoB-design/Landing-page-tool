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
from playwright.sync_api import FloatRect, Page, ProxySettings, Route, sync_playwright
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
# Room around a part of a page Lander pictures (B3.1d), in CSS px.
MARGIN = 24


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
        page: Page | None = None
        try:
            context = browser.new_context(
                user_agent=USER_AGENT, viewport={"width": 1440, "height": 900}
            )
            page = context.new_page()
            page.route("**/*", _guard)
            yield page
        finally:
            if page is not None:
                # Requests still in flight when the page closes would otherwise log a cancelled
                # route handler's traceback (harmless, but noisy in the job loop's log).
                with suppress(Exception):
                    page.unroute_all(behavior="ignoreErrors")
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


class NotShownError(ValueError):
    """The part asked for isn't on the screen at that width: hidden (`display: none`), or a
    fixed bar the page only brings in with a script after a scroll or a click. Nothing to
    picture."""


def screenshot_part(
    html: str, selector: str | None, *, width: int = 1280, max_height: int = 1400
) -> bytes:
    """A JPEG of one part of a page (`selector`, else its top) at `width` CSS px, at most
    `max_height` tall and 1000 px wide, for Lander to look at what it changed (B3.1d). Our own
    page, but it still loads its images and fonts through the SSRF guard. Raises NotShownError
    when the part isn't showing at that width (ALL-1's sticky shop bar, hidden until scrolled)."""
    from PIL import Image

    with open_page() as page:
        page.set_viewport_size({"width": width, "height": max_height})
        with suppress(PlaywrightTimeoutError):
            page.set_content(html, wait_until="load", timeout=15_000)
        page.wait_for_timeout(500)  # web fonts and scripted layout
        target = page.locator(selector).first if selector else None
        box = None
        if target is not None and target.count():
            if not target.is_visible():
                raise NotShownError("hidden at this width")
            # A fixed bar parked off the screen can't be scrolled to: then its box says so.
            with suppress(PlaywrightTimeoutError):
                target.scroll_into_view_if_needed(timeout=5_000)
            box = target.bounding_box()
            if box is None or not _on_screen(box, width, max_height):
                raise NotShownError("off the screen")
        if box:
            # The part with a little room around it, inside the viewport it was scrolled into.
            x, y = max(0.0, box["x"] - MARGIN), max(0.0, box["y"] - MARGIN)
            clip: FloatRect = {
                "x": x,
                "y": y,
                "width": min(width - x, box["width"] + 2 * MARGIN),
                "height": min(max_height - y, box["height"] + 2 * MARGIN),
            }
            shot = page.screenshot(clip=clip, animations="disabled")
        else:
            shot = page.screenshot(clip={"x": 0, "y": 0, "width": width, "height": 900})
    image = Image.open(io.BytesIO(shot)).convert("RGB")
    if image.height > max_height:
        image = image.crop((0, 0, image.width, max_height))
    if image.width > 1000:
        image = image.resize((1000, round(image.height * 1000 / image.width)))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=80, optimize=True)
    return out.getvalue()


def _on_screen(box: FloatRect, width: int, height: int) -> bool:
    """Whether at least a 2 px sliver of the box is inside the viewport."""
    return (
        box["width"] >= 2
        and box["height"] >= 2
        and box["x"] < width - 2
        and box["x"] + box["width"] > 2
        and box["y"] < height - 2
        and box["y"] + box["height"] > 2
    )


# ── QA screenshots and the share image (BUILD_SPEC §11.1, B3.3a, D111) ───────────────────────

QA_DESKTOP = 1280
QA_PHONE = 390
QA_MAX_HEIGHT = 12_000  # CSS px: a very long page is cut here
SHARE_SIZE = (1200, 630)


class QaShots(BaseModel):
    """A page's full-length screenshots at desktop and phone widths (JPEG, the phone one at 2x),
    their heights in CSS px, and its share image (the top of the page, 1200 x 630, JPEG)."""

    desktop: bytes
    desktop_height: int
    phone: bytes
    phone_height: int
    share: bytes
    # The phone check's measurements at 390 px (engines/mobile.py PHONE_CHECK_JS; B3.3b).
    phone_measured: dict[str, Any] = Field(default_factory=dict)


def _jpeg(png: bytes, quality: int) -> bytes:
    from PIL import Image

    image = Image.open(io.BytesIO(png)).convert("RGB")
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue()


def _render(browser: Any, html: str, width: int, height: int, scale: float) -> Page:
    context = browser.new_context(
        user_agent=USER_AGENT,
        viewport={"width": width, "height": height},
        device_scale_factor=scale,
    )
    page: Page = context.new_page()
    page.route("**/*", _guard)
    with suppress(PlaywrightTimeoutError):
        page.set_content(html, wait_until="load", timeout=20_000)
    page.wait_for_timeout(600)  # web fonts and scripted layout
    return page


def _measure(page: Page) -> dict[str, Any]:
    from app.engines.mobile import PHONE_CHECK_JS

    try:
        found = page.evaluate(PHONE_CHECK_JS)
    except Exception as exc:  # a page that breaks the measuring: no check rather than no shots
        log.warning("phone check failed", error=str(exc))
        return {}
    return found if isinstance(found, dict) else {}


def _full(
    browser: Any, html: str, width: int, scale: float, *, measure: bool = False
) -> tuple[bytes, int, dict[str, Any]]:
    page = _render(browser, html, width, 900, scale)
    try:
        # Scroll through once so lazy images load, then back to the top.
        total = int(page.evaluate("() => document.documentElement.scrollHeight"))
        for y in range(0, min(total, QA_MAX_HEIGHT), 800):
            page.evaluate(f"() => window.scrollTo(0, {y})")
            page.wait_for_timeout(60)
        page.evaluate("() => window.scrollTo(0, 0)")
        page.wait_for_timeout(400)
        total = int(page.evaluate("() => document.documentElement.scrollHeight"))
        height = max(1, min(total, QA_MAX_HEIGHT))
        clip: FloatRect = {"x": 0, "y": 0, "width": width, "height": height}
        measured = _measure(page) if measure else {}
        shot = page.screenshot(full_page=True, clip=clip, animations="disabled")
        return _jpeg(shot, 78), height, measured
    finally:
        with suppress(Exception):
            page.unroute_all(behavior="ignoreErrors")
        page.context.close()


def _share(browser: Any, html: str) -> bytes:
    width, height = SHARE_SIZE
    page = _render(browser, html, width, height, 1)
    try:
        clip: FloatRect = {"x": 0, "y": 0, "width": width, "height": height}
        return _jpeg(page.screenshot(clip=clip, animations="disabled"), 88)
    finally:
        with suppress(Exception):
            page.unroute_all(behavior="ignoreErrors")
        page.context.close()


def qa_shots(html: str) -> QaShots:
    """Our own page, rendered in one browser: full length at 1280 px and at 390 px (2x, crisp on
    a retina screen), at most 12,000 px tall, and its share image. Its images and fonts still load
    through the SSRF guard."""
    with _ONE_BROWSER, sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            desktop, desktop_height, _ = _full(browser, html, QA_DESKTOP, 1)
            phone, phone_height, measured = _full(browser, html, QA_PHONE, 2, measure=True)
            share = _share(browser, html)
        finally:
            browser.close()
    return QaShots(
        desktop=desktop,
        desktop_height=desktop_height,
        phone=phone,
        phone_height=phone_height,
        share=share,
        phone_measured=measured,
    )


PHONE_SLICE = 1400
PHONE_SLICES = 6


def phone_look(html: str) -> tuple[list[bytes], dict[str, Any]]:
    """Our page at 390 px for Fix for phone (B3.3b): full length in slices of 1,400 px (at most
    six, so Claude can see them), and the phone check's measurements."""
    from PIL import Image

    with _ONE_BROWSER, sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            shot, _height, measured = _full(browser, html, QA_PHONE, 1, measure=True)
        finally:
            browser.close()
    image = Image.open(io.BytesIO(shot)).convert("RGB")
    slices: list[bytes] = []
    for top in range(0, min(image.height, PHONE_SLICE * PHONE_SLICES), PHONE_SLICE):
        part = image.crop((0, top, image.width, min(image.height, top + PHONE_SLICE)))
        out = io.BytesIO()
        part.save(out, format="JPEG", quality=80, optimize=True)
        slices.append(out.getvalue())
    return slices, measured
