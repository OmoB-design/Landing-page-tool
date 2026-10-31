"""End-to-end check of M1's acceptance (B1.6c, BUILD_SPEC §16, MILESTONES B1.6): a new user signs
up, creates a brand, builds a page from a library template, edits a line, approves, exports, and
reaches Publish (which asks for Vercel), in a real browser against a production build.

    pnpm e2e                      # starts its own servers, runs, stops them (a few minutes)
    pnpm e2e --reuse              # use servers you started (web :3001, worker :8001, mock mode)

No paid calls: the worker and job loop it starts run with LP_MOCK_LLM=1 and LP_MOCK_IMAGES=1 on a
queue of their own, so the live job loop and a developer's `pnpm dev` never see its jobs. The web
app is a production build (`next build`, then `next start` on :3001) pointed at that worker. It
uses the cloud database like the worker tests, and deletes its account, workspace and pages at the
end. The product is added to the database directly: adding one through the app reads a live
product page from the internet, which a test shouldn't depend on.
"""

import argparse
import os
import secrets
import signal
import subprocess
import sys
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKER = ROOT / "services" / "worker"
WEB = ROOT / "apps" / "web"
sys.path.insert(0, str(WORKER))

import httpx  # noqa: E402
from playwright.sync_api import Page, expect, sync_playwright  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import transaction  # noqa: E402

WEB_URL = "http://localhost:3001"
WORKER_URL = "http://localhost:8001"
EDITED = "An end-to-end check edited this line."
BUILD_TIMEOUT_S = 900  # a mock build on a slow machine


def step(message: str) -> None:
    print(f"· {message}", flush=True)


def wait_for(url: str, seconds: float) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if httpx.get(url, timeout=10).status_code < 500:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    raise SystemExit(f"{url} didn't answer in {seconds:.0f} s.")


def port_free(port: int) -> bool:
    import socket

    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) != 0


@contextmanager
def servers() -> Iterator[None]:
    """The worker API, the job loop (mock mode, a queue of their own) and the production web app."""
    for port in (3001, 8001):
        if not port_free(port):
            raise SystemExit(f"Port {port} is in use. Stop what's on it, or run with --reuse.")
    queue = f"e2e-{uuid.uuid4().hex[:8]}"
    env = {**os.environ, "LP_MOCK_LLM": "1", "LP_MOCK_IMAGES": "1", "LP_JOB_QUEUE": queue}
    logs = ROOT / ".e2e-logs"
    logs.mkdir(exist_ok=True)
    processes: list[subprocess.Popen[bytes]] = []

    def start(name: str, command: list[str], cwd: Path, extra: dict[str, str]) -> None:
        log = (logs / f"{name}.log").open("wb")
        processes.append(
            subprocess.Popen(
                command, cwd=cwd, env={**env, **extra}, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        )  # fmt: skip

    try:
        step(f"Starting the worker and job loop (mock mode, queue {queue})")
        start("worker-api", ["uv", "run", "uvicorn", "app.main:app", "--port", "8001"], WORKER, {})
        start("job-loop", ["uv", "run", "python", "worker.py"], WORKER, {})
        step("Building the web app (next build)")
        subprocess.run(
            ["pnpm", "exec", "next", "build"], cwd=WEB, check=True, stdout=subprocess.DEVNULL
        )
        start(
            "web", ["pnpm", "exec", "next", "start", "--port", "3001"], WEB,
            {"WORKER_API_URL": WORKER_URL},
        )  # fmt: skip
        wait_for(f"{WORKER_URL}/health", 120)
        wait_for(f"{WEB_URL}/sign-in", 120)
        yield
    finally:
        for process in processes:
            with suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGTERM)
        for process in processes:
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
        step(f"Servers stopped (logs in {logs.relative_to(ROOT)}/)")


def sign_up(page: Page, email: str, password: str) -> None:
    page.goto(f"{WEB_URL}/sign-up", wait_until="networkidle")
    page.locator("#fullName").fill("End To End")
    page.locator("#email").fill(email)
    page.locator("#password").fill(password)
    page.locator("#password").press("Enter")
    page.wait_for_function(
        "() => location.pathname !== '/sign-up'"
        " || document.body.innerText.includes('Check your email')",
        timeout=60_000,
    )
    if "/home" in page.url:
        step("Signed up and signed in")
        return
    # The project asks new accounts to confirm their email: confirm it as the link would.
    settings = get_settings()
    with transaction() as conn:
        row = conn.execute("select id from auth.users where email = %s", (email,)).fetchone()
    assert row is not None, "the sign-up didn't create an account"
    admin = {"apikey": settings.supabase_secret_key,
             "Authorization": f"Bearer {settings.supabase_secret_key}"}  # fmt: skip
    httpx.put(
        f"{settings.supabase_url}/auth/v1/admin/users/{row['id']}",
        headers=admin, json={"email_confirm": True}, timeout=30,
    ).raise_for_status()  # fmt: skip
    page.goto(f"{WEB_URL}/sign-in", wait_until="networkidle")
    page.locator("#email").fill(email)
    page.locator("#password").fill(password)
    page.locator("#password").press("Enter")
    page.wait_for_url(lambda url: "/home" in url, timeout=60_000)
    step("Signed up, confirmed the email, signed in")


def create_brand(page: Page) -> str:
    page.goto(f"{WEB_URL}/brands/new", wait_until="networkidle")
    page.get_by_role("button", name="Fill by hand").click()
    page.get_by_label("Brand name").fill("End To End Skin")
    page.get_by_label("Key prefix").fill("ETE")
    page.get_by_label("Key prefix").press("Enter")
    page.wait_for_url(lambda url: "/brands/" in url and "/new" not in url, timeout=60_000)
    brand_id = page.url.split("/brands/")[1].split("/")[0].split("?")[0]
    step(f"Created the brand by hand ({brand_id[:8]}…)")
    return brand_id


def add_product(brand_id: str) -> None:
    with transaction() as conn:
        conn.execute(
            """
            insert into products (org_id, brand_id, handle, name, price, currency, description)
            select org_id, id, 'calming-serum', 'Calming serum', 29, 'USD',
                   'A light serum that calms redness in a week.'
            from brands where id = %s
            """,
            (brand_id,),
        )
    step("Added a product (in the database: the app would read a live product page)")


def build_page(page: Page, brand_id: str) -> str:
    page.goto(f"{WEB_URL}/brands/{brand_id}/products", wait_until="networkidle")
    page.get_by_role("link", name="Calming serum").first.click()
    page.get_by_role("link", name="New Page for this product").click()
    page.wait_for_url(lambda url: "/pages/new" in url, timeout=60_000)
    library = page.get_by_role("radiogroup", name="Library templates")
    library.locator("label").first.click()
    step("Chose a library template")
    while page.get_by_role("button", name="Next").count():
        page.get_by_role("button", name="Next").click()
        time.sleep(0.4)
    page.get_by_role("button", name="Build page").click()
    page.wait_for_url(lambda url: "/pages/" in url and "/new" not in url, timeout=120_000)
    build_id = page.url.split("/pages/")[1].split("?")[0]
    step(f"Started the build ({build_id[:8]}…); waiting for the review desk (mock mode)")
    expect(page.get_by_role("button", name="Approve")).to_be_visible(timeout=BUILD_TIMEOUT_S * 1000)
    step("The page is built: the review desk is open")
    return build_id


def edit_a_line(page: Page) -> None:
    page.get_by_role("tab", name="Copy").click()
    rows = page.locator("li[id^='desk-paragraph-'] > button:not([title])")
    expect(rows.first).to_be_visible(timeout=60_000)
    for index in range(min(rows.count(), 12)):
        rows.nth(index).click()
        field = page.get_by_label("Edit this line")
        expect(field).to_be_visible()
        if page.get_by_text("filled from the", exact=False).count():  # holds a price or name
            field.press("Escape")
            continue
        field.fill(EDITED)
        page.get_by_role("button", name="Save", exact=True).click()
        expect(page.get_by_text(EDITED).first).to_be_visible(timeout=60_000)
        step("Edited a line on the review desk")
        return
    raise AssertionError("No plain line to edit on the review desk.")


def approve(page: Page) -> None:
    page.get_by_role("button", name="Approve").click()
    anyway = page.get_by_role("button", name="Approve anyway")
    if anyway.count():
        anyway.click()
    expect(page.get_by_role("button", name="Back to review")).to_be_visible(timeout=60_000)
    step("Approved the page")


def export(page: Page, key: str) -> None:
    with page.expect_download(timeout=300_000) as download:
        page.get_by_role("button", name="Export").click()
    path = download.value.path()
    html = Path(path).read_text(encoding="utf-8") if path else ""
    assert download.value.suggested_filename == f"{key}.html", download.value.suggested_filename
    assert EDITED in html, "the exported page doesn't have the edited line"
    step(f"Exported {key}.html with the edit in it ({len(html) // 1024} KB)")


def reach_publish(page: Page) -> None:
    page.get_by_role("button", name="Publish").click()
    expect(page.get_by_text("Connect your Vercel account first", exact=False)).to_be_visible()
    step("Publish asks to connect Vercel first (the workspace has no connection)")


def run(headed: bool) -> None:
    settings = get_settings()
    email = f"e2e-{uuid.uuid4().hex[:10]}@example.test"
    password = secrets.token_urlsafe(18)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=not headed)
            context = browser.new_context(viewport={"width": 1440, "height": 900},
                                          accept_downloads=True)  # fmt: skip
            page = context.new_page()
            page.set_default_timeout(60_000)
            sign_up(page, email, password)
            brand_id = create_brand(page)
            add_product(brand_id)
            build_id = build_page(page, brand_id)
            with transaction() as conn:
                key = conn.execute("select key from builds where id = %s", (build_id,)).fetchone()
            edit_a_line(page)
            approve(page)
            export(page, key["key"] if key else "")
            reach_publish(page)
            browser.close()
        print("PASS: sign up → brand → build → edit → approve → export → publish", flush=True)
    finally:
        with transaction() as conn:
            user = conn.execute("select id from auth.users where email = %s", (email,)).fetchone()
            if user:
                orgs = "select org_id from org_members where user_id = %(u)s"
                conn.execute(f"delete from builds where org_id in ({orgs})", {"u": user["id"]})
                conn.execute(f"delete from orgs where id in ({orgs})", {"u": user["id"]})
        if user:
            admin = {"apikey": settings.supabase_secret_key,
                     "Authorization": f"Bearer {settings.supabase_secret_key}"}  # fmt: skip
            httpx.delete(
                f"{settings.supabase_url}/auth/v1/admin/users/{user['id']}",
                headers=admin, timeout=30,
            ).raise_for_status()  # fmt: skip
        step("Deleted the test account, its workspace and pages")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--reuse", action="store_true", help="use servers already running")
    parser.add_argument("--headed", action="store_true", help="show the browser")
    args = parser.parse_args()
    started = time.monotonic()
    if args.reuse:
        wait_for(f"{WORKER_URL}/health", 10)
        wait_for(f"{WEB_URL}/sign-in", 30)
        run(args.headed)
    else:
        with servers():
            run(args.headed)
    step(f"Took {time.monotonic() - started:.0f} s")


if __name__ == "__main__":
    main()
