"""SSRF guard, bot-wall detection and the fetch ladder (no live network: httpx MockTransport,
fake DNS answers, and a fake browser step). One test drives real Chromium on local HTML."""

from pathlib import Path

import httpx
import pytest

from app.fetch import browser, ladder, safety

FIXTURE = (Path(__file__).parent / "fixtures" / "brand_page.html").read_text()


@pytest.fixture(autouse=True)
def fake_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    """Hosts ending in .test resolve publicly; everything else is treated as private."""
    monkeypatch.setattr(safety, "_host_is_public", lambda host: host.endswith(".test"))


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:54321/",
        "http://127.0.0.1/",
        "http://10.0.0.5/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "file:///etc/passwd",
        "ftp://brand.test/",
        "https://brand.test:8443/",
        "https://internal.corp/",
    ],
)
def test_private_and_odd_urls_are_refused(url: str) -> None:
    assert not safety.is_public_url(url)
    with pytest.raises(safety.UnsafeUrlError):
        safety.check_public_url(url)


def test_public_urls_are_allowed() -> None:
    assert safety.is_public_url("https://brand.test/products/x")
    assert safety.is_public_url("http://8.8.8.8/")


def test_shopify_nocaptcha_is_not_a_bot_wall() -> None:
    assert not ladder.looks_like_bot_wall(200, FIXTURE + " " * 6000)
    assert ladder.looks_like_bot_wall(200, "<title>Just a moment...</title>" + "x" * 9000)
    assert ladder.looks_like_bot_wall(200, "<p>Please complete the captcha</p>")
    assert ladder.looks_like_bot_wall(403, "anything")


def test_retry_delay_is_capped() -> None:
    assert ladder.retry_delay("3") == 3.0
    assert ladder.retry_delay("120") == 8.0
    assert ladder.retry_delay(None) == 2.0
    assert ladder.retry_delay("Wed, 21 Oct 2026 07:28:00 GMT") == 2.0


def client(handler: httpx.MockTransport) -> httpx.Client:
    return httpx.Client(transport=handler, headers=ladder.HEADERS)


def test_a_plain_fetch_follows_redirects_and_returns_the_page() -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/":
            return httpx.Response(301, headers={"location": "https://www.brand.test/home"})
        assert "accept-language" not in request.headers  # no Shopify Markets localisation
        return httpx.Response(200, text=FIXTURE + " " * 6000)

    page = ladder.fetch_page("https://brand.test/", client=client(httpx.MockTransport(handle)))
    assert page.via == "http" and page.url == "https://www.brand.test/home"
    assert "Lumé Skin" in page.html


def test_a_redirect_to_a_private_address_is_refused() -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://169.254.169.254/"})

    with pytest.raises(safety.UnsafeUrlError):
        ladder.fetch_page("https://brand.test/", client=client(httpx.MockTransport(handle)))


def test_a_429_is_retried_once(monkeypatch: pytest.MonkeyPatch) -> None:
    slept: list[float] = []
    monkeypatch.setattr("app.fetch.ladder.time.sleep", slept.append)
    responses = iter(
        [httpx.Response(429, headers={"retry-after": "1"}), httpx.Response(200, text=FIXTURE * 3)]
    )
    page = ladder.fetch_page(
        "https://brand.test/", client=client(httpx.MockTransport(lambda r: next(responses)))
    )
    assert slept == [1.0] and page.via == "http"


def test_a_blocked_page_falls_back_to_the_browser(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.fetch.ladder.time.sleep", lambda s: None)
    monkeypatch.setattr(
        browser, "fetch_html", lambda url, proxy=None: ("https://brand.test/", 200, FIXTURE * 3)
    )
    page = ladder.fetch_page(
        "https://brand.test/",
        client=client(httpx.MockTransport(lambda r: httpx.Response(403, text="denied"))),
    )
    assert page.via == "browser"


def test_a_bot_wall_in_the_browser_too_is_explained(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.fetch.ladder.time.sleep", lambda s: None)
    monkeypatch.setattr(
        browser, "fetch_html", lambda url, proxy=None: (url, 200, "<title>Just a moment...</title>")
    )
    with pytest.raises(ladder.FetchError, match="bot protection"):
        ladder.fetch_page(
            "https://brand.test/",
            client=client(httpx.MockTransport(lambda r: httpx.Response(403, text="denied"))),
        )


def test_rendered_signals_from_real_chromium() -> None:
    with browser.open_page() as page:
        page.set_content(FIXTURE)
        signals = browser.read_signals(page)
    buttons = [s.color for s in signals.button_colors]
    assert "rgb(228, 87, 46)" in buttons
    assert signals.heading_font is not None and "Lume Display" in signals.heading_font
    assert signals.lang == "en-GB"
