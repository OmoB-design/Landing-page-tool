"""The preview check (BUILD_SPEC §11.1, B3.3a, D111): screenshots at desktop and phone widths,
the share image, and the share image written into exports."""

import io
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import qa
from app.config import get_settings
from app.db import transaction
from app.engines import share
from app.engines.html import parse
from app.fetch import browser
from app.providers import storage
from tests.conftest import DbUser, job_row, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (autouse fixture)
from tests.test_desk import desk, edit

SHARE = "https://cdn.example.test/share.jpg"


# ── the share image's tags ────────────────────────────────────────────────────


def test_the_share_image_goes_into_the_page_head() -> None:
    page = (
        '<html><head><title>Glow</title><meta property="og:image" content="https://old/p.jpg">'
        '<meta name="description" content="Calm skin in a week"></head><body></body></html>'
    )
    out = parse(share.with_share_image(page, SHARE))
    assert [m["content"] for m in out.select('meta[property="og:image"]')] == [SHARE]

    def content(selector: str) -> str:
        tag = out.select_one(selector)
        assert tag is not None
        return str(tag["content"])

    assert content('meta[property="og:image:width"]') == "1200"
    assert content('meta[name="twitter:card"]') == "summary_large_image"
    assert content('meta[name="twitter:image"]') == SHARE
    assert share.with_share_image(page, None) == page
    assert share.with_share_image(page, "javascript:alert(1)") == page
    assert share.link_preview(page) == ("Glow", "Calm skin in a week")
    titled = page.replace("<title>", '<meta property="og:title" content="Glow fast"><title>')
    assert share.link_preview(titled)[0] == "Glow fast"


# ── the check, through the API ────────────────────────────────────────────────


def _jpeg(width: int, height: int) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), (uuid.uuid4().int % 255, 200, 180)).save(out, "JPEG")
    return out.getvalue()


@pytest.fixture
def fake_shots(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """The browser's screenshots, faked (fast, no Chromium); records each page it was given."""
    pages: list[str] = []

    def shots(html: str) -> browser.QaShots:
        pages.append(html)
        return browser.QaShots(
            desktop=_jpeg(64, 200), desktop_height=1800,
            phone=_jpeg(32, 400), phone_height=3600, share=_jpeg(120, 63),
        )  # fmt: skip

    monkeypatch.setattr(browser, "qa_shots", shots)
    return pages


def run_qa_job() -> dict[str, Any]:
    from app.jobs import queue
    from app.jobs.registry import KINDS
    from app.jobs.runner import Runner

    runner = Runner(get_settings(), kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, ["qa"])
    assert claimed is not None
    runner.execute(claimed)
    return job_row(claimed.id)


def check(client: TestClient, user: DbUser, build: dict[str, Any], org: str | None = None) -> Any:
    return client.get(
        f"/builds/{build['id']}/qa",
        params={"org_id": org or build["org_id"]},
        headers=bearer(user),
    )


@needs_db
def test_a_check_keeps_screenshots_and_a_share_image_for_the_page_version(
    client: TestClient, user: DbUser, finished: dict[str, Any], fake_shots: list[str]
) -> None:
    empty = check(client, user, finished)
    assert empty.status_code == 200, empty.text
    body = empty.json()
    assert body["version"] is None and body["desktop"] is None and body["running"] is None
    assert body["title"] == "Serum"

    started = client.post(
        f"/builds/{finished['id']}/qa", json={"org_id": finished["org_id"]}, headers=bearer(user)
    )
    assert started.status_code == 200, started.text
    again = client.post(
        f"/builds/{finished['id']}/qa", json={"org_id": finished["org_id"]}, headers=bearer(user)
    )
    assert again.json()["job_id"] == started.json()["job_id"]  # one at a time per page
    assert check(client, user, finished).json()["running"] == started.json()["job_id"]

    job = run_qa_job()
    assert job["status"] == "succeeded", job["error"]
    assert fake_shots and "Glow in 7 days" in fake_shots[0]
    state = check(client, user, finished).json()
    assert state["version"] == state["page_version"] == 1 and state["running"] is None
    assert state["desktop"]["height"] == 1800 and state["desktop"]["width"] == 1280
    assert state["phone"]["height"] == 3600 and state["phone"]["width"] == 390
    assert "token=" in state["desktop"]["url"]  # private: a signed link
    assert "/storage/v1/object/public/assets/" in state["share"]  # public: apps fetch it
    folder = f"{finished['org_id']}/{finished['id']}"
    assert storage.download("builds", f"{folder}/qa-desktop.jpg")[:2] == b"\xff\xd8"

    # The page changes: the screenshots say which version they show.
    edited = edit(
        client, user, finished, desk(client, user, finished), "Is it gentle?", "Is it kind?"
    )
    assert edited.status_code == 200, edited.text
    stale = check(client, user, finished).json()
    assert stale["version"] == 1 and stale["page_version"] == 2

    with transaction() as conn:
        assert qa.share_url(conn, uuid.UUID(finished["id"])) == state["share"]
        # A screenshot path outside this page's folder is never signed.
        conn.execute(
            """
            update builds set report = jsonb_set(report, '{qa,desktop,path}', '"other/x.jpg"')
            where id = %(b)s
            """,
            {"b": finished["id"]},
        )
    assert check(client, user, finished).json()["desktop"] is None
    storage.remove("builds", [f"{folder}/qa-desktop.jpg", f"{folder}/qa-phone.jpg"])


@needs_db
def test_a_finished_build_is_checked_and_other_workspaces_are_refused(
    client: TestClient, user: DbUser, other_org: uuid.UUID, finished: dict[str, Any]
) -> None:
    qa.after_build(uuid.UUID(finished["org_id"]), uuid.UUID(finished["id"]), user.id)
    with transaction() as conn:
        queued = conn.execute(
            "select kind, status from jobs where build_id = %(b)s and kind = 'qa'",
            {"b": finished["id"]},
        ).fetchall()
    assert [(r["kind"], r["status"]) for r in queued] == [("qa", "queued")]
    assert check(client, user, finished, str(other_org)).status_code == 403
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'building' where id = %(b)s", {"b": finished["id"]}
        )
    refused = client.post(
        f"/builds/{finished['id']}/qa", json={"org_id": finished["org_id"]}, headers=bearer(user)
    )
    assert refused.status_code == 422
