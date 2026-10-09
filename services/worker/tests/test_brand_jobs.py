"""brand_autofetch and brand_assets end to end against the local database, with the network
replaced by the fixture page. Jobs use test-only kind names so a running dev worker ignores
them (it only claims kinds it knows)."""

import io
import uuid
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from app.config import Settings
from app.db import transaction
from app.fetch import browser, ladder
from app.fetch.browser import ColorSample, RenderedSignals
from app.jobs import queue
from app.jobs.kinds import brand_assets, brand_autofetch
from app.jobs.registry import JobKind
from app.jobs.runner import Runner
from app.providers import storage
from tests.conftest import DbUser, job_row, needs_db

pytestmark = needs_db
FIXTURE = (Path(__file__).parent / "fixtures" / "brand_page.html").read_text()

KINDS = {
    "test_brand_autofetch": JobKind(
        "test_brand_autofetch", "Brand fetch", brand_autofetch.run,
        brand_autofetch.BrandAutofetchPayload,
    ),
    "test_brand_assets": JobKind(
        "test_brand_assets", "Brand logo", brand_assets.run, brand_assets.BrandAssetsPayload
    ),
}  # fmt: skip


def run_job(user: DbUser, settings: Settings, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    job, _ = queue.enqueue(org_id=user.org_id, kind=kind, payload=payload, created_by=user.id)
    runner = Runner(settings, kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 2, [kind])
    assert claimed is not None and claimed.id == job.id
    runner.execute(claimed)
    return job_row(job.id)


def test_autofetch_builds_a_draft(
    user: DbUser, fast_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        ladder, "fetch_page",
        lambda url: ladder.FetchedPage("https://www.lumeskin.test/", 200, FIXTURE, "http"),
    )  # fmt: skip
    monkeypatch.setattr(
        browser,
        "render_signals",
        lambda url: RenderedSignals(
            button_colors=[ColorSample(color="rgb(228, 87, 46)", weight=5000)],
            brand_surface_colors=[ColorSample(color="rgb(228, 87, 46)", weight=800)],
            heading_font='"Lume Display", serif',
            body_font='"Lume Sans", sans-serif',
            lang="en-GB",
        ),
    )
    row = run_job(user, fast_settings, "test_brand_autofetch", {"url": "lumeskin.test"})
    assert row["status"] == "succeeded", row["error"]
    draft = row["result"]["draft"]
    assert draft["name"] == "Lumé Skin" and draft["prefix"] == "LS"
    assert draft["palette"]["primary"] == "#e4572e"
    assert draft["palette_candidates"][0]["hex"] == "#e4572e"
    assert draft["fonts"] == {"heading": "Lume Display", "body": "Lume Sans"}
    assert draft["logo_url"] == "https://www.lumeskin.test/images/lume-logo.png"
    assert draft["support_email"] == "hello@lumeskin.test"
    assert draft["ai"] == "mock" and draft["voice"].startswith("(mock)")
    with transaction() as conn:
        ledger = conn.execute(
            "select model, cost_usd, node from ledger_entries where job_id = %(j)s",
            {"j": row["id"]},
        ).fetchall()
    assert [(r["model"], r["node"]) for r in ledger] == [
        ("mock/claude-sonnet-5-5", "brand_profile")
    ]
    assert ledger[0]["cost_usd"] == 0


def test_autofetch_survives_a_failed_rendered_pass(
    user: DbUser, fast_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        ladder, "fetch_page",
        lambda url: ladder.FetchedPage("https://www.lumeskin.test/", 200, FIXTURE, "http"),
    )  # fmt: skip

    def broken(url: str) -> RenderedSignals:
        raise RuntimeError("chromium crashed")

    monkeypatch.setattr(browser, "render_signals", broken)
    row = run_job(user, fast_settings, "test_brand_autofetch", {"url": "https://lumeskin.test"})
    draft = row["result"]["draft"]
    assert draft["palette"]["primary"] == "#e4572e"  # from theme-color and page CSS
    assert any("rendered page" in w for w in draft["warnings"])


def test_autofetch_refuses_private_addresses(user: DbUser, fast_settings: Settings) -> None:
    row = run_job(user, fast_settings, "test_brand_autofetch", {"url": "http://127.0.0.1:54321"})
    assert row["status"] == "failed" and row["error"]["code"] == "unsafe_url"


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 32), (228, 87, 46)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_brand_assets_stores_logo_and_favicon(
    user: DbUser, fast_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    with transaction() as conn:
        brand = conn.execute(
            "insert into brands (org_id, name, prefix) values (%(o)s, 'Lumé', 'LUM') returning id",
            {"o": user.org_id},
        ).fetchone()
    assert brand is not None
    png = _png()
    monkeypatch.setattr(ladder, "fetch_bytes", lambda url: (png, "image/png"))
    row = run_job(
        user, fast_settings, "test_brand_assets",
        {"brand_id": str(brand["id"]), "logo_url": "https://x.test/l.png",
         "favicon_url": "https://x.test/f.png"},
    )  # fmt: skip
    assert row["status"] == "succeeded", row["error"]
    with transaction() as conn:
        saved = conn.execute(
            """select b.logo_asset_id, b.favicon_asset_id, a.path, a.width from brands b
               join assets a on a.id = b.logo_asset_id where b.id = %(id)s""",
            {"id": brand["id"]},
        ).fetchone()
    assert saved is not None and saved["width"] == 64
    assert saved["logo_asset_id"] == saved["favicon_asset_id"]  # same bytes, stored once
    storage.remove("assets", [saved["path"]])


def test_brand_assets_only_touches_brands_in_the_jobs_org(
    user: DbUser, other_org: uuid.UUID, fast_settings: Settings
) -> None:
    with transaction() as conn:
        foreign = conn.execute(
            "insert into brands (org_id, name, prefix) values (%(o)s, 'Theirs', 'THR') "
            "returning id",
            {"o": other_org},
        ).fetchone()
    assert foreign is not None
    row = run_job(user, fast_settings, "test_brand_assets", {"brand_id": str(foreign["id"])})
    assert row["status"] == "failed" and row["error"]["code"] == "brand_missing"
