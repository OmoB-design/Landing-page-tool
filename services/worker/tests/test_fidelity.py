"""Match product everywhere (BUILD_SPEC §10.5, B3.2c, D116): which pictures are checked, the check
with a fake vision model, the match through the API (one undoable change, a version per picture,
the check kept up to date), the automatic check in the studio, Buddy's tool and the build step."""

import io
import json
import uuid
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import agent, fidelity
from app.config import get_settings
from app.db import transaction
from app.engines import fidelity as engine
from app.engines.html import parse
from app.pipeline.runtime import PipelineContext
from app.providers import anthropic, fal, storage
from tests import test_image_studio
from tests.conftest import DbUser, job_row, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (autouse fixture)
from tests.test_desk import desk, post
from tests.test_image_studio import CDN, PAGE, PHOTOS, page_of, studio

pictured = test_image_studio.pictured

BUSY = (
    "<html><body>"
    '<section data-lp-section="hero">'
    f'<img data-lp-img="1" data-lp-logo src="{CDN}/logo.png">'
    f'<img data-lp-img="2" data-lp-product src="{CDN}/hero.jpg">'
    f'<img data-lp-img="3" data-lp-scene src="{CDN}/bath.jpg" alt="A bath">'
    f'<img data-lp-img="4" data-lp-scene src="{CDN}/bath.jpg">'
    f'<img data-lp-img="5" src="{CDN}/icon.svg">'
    f'<img data-lp-img="6" src="{CDN}/tiny.jpg" width="60" height="60">'
    f'<img data-lp-img="7" data-lp-keep src="{CDN}/stars.png">'
    f'<img data-lp-img="8" data-lp-scene data-lp-generic src="{CDN}/generic.jpg">'
    f'<img data-lp-img="9" data-lp-person src="{CDN}/ana.jpg">'
    f'<img data-lp-img="10" src="{PHOTOS[0]}">'
    f'<img data-lp-img="11" class="lifestyle" src="{CDN}/kitchen.jpg">'
    f'<img data-lp-img="12" src="{CDN}/counter.jpg">'
    "</section></body></html>"
)


# ── which pictures, and the plan ──────────────────────────────────────────────


def test_only_pictures_that_could_show_the_product_are_checked() -> None:
    found, skipped = engine.candidates(BUSY, product_photos=PHOTOS, generic_rules=[".lifestyle"])
    assert [(c.number, c.kind) for c in found] == [
        (3, "scene"), (4, "scene"), (9, "person"), (12, "image"),
    ]  # fmt: skip
    # logo, product slot, kept, generic (marked and by rule), one of the product's own photos
    assert skipped.as_dict() == {"kept": 6, "vector": 1, "small": 1, "over": 0}
    many = "".join(f'<img data-lp-img="{n}" src="{CDN}/{n}.jpg">' for n in range(1, 35))
    more, over = engine.candidates(f"<body>{many}</body>")
    assert len(more) == engine.MAX_CANDIDATES and over.over == 4


def test_the_fingerprint_follows_the_pictures() -> None:
    found, _ = engine.candidates(BUSY)
    changed, _ = engine.candidates(BUSY.replace("counter.jpg", "counter-2.jpg"))
    assert engine.fingerprint(found) != engine.fingerprint(changed)
    assert engine.fingerprint(found) == engine.fingerprint(engine.candidates(BUSY)[0])


def test_a_source_is_fixed_once_and_at_most_ten_per_run() -> None:
    found, _ = engine.candidates(BUSY, product_photos=PHOTOS)
    plan = engine.plan(
        found, {3: ("fix", 2), 4: ("fix", 2), 9: ("no_product", 1), 12: ("fix", 7)}, 2
    )
    assert [(f.src, f.numbers, f.reference) for f in plan.fixes] == [
        (f"{CDN}/bath.jpg", (3, 4), 2),
        (f"{CDN}/counter.jpg", (12,), 1),  # photo 7 doesn't exist: the first
    ]
    many = [engine.Candidate(n, f"{CDN}/{n}.jpg", "scene") for n in range(1, 14)]
    capped = engine.plan(many, {n: ("fix", 1) for n in range(1, 14)}, 1)
    assert len(capped.fixes) == engine.MAX_FIXES and capped.over == 3


def test_an_odd_answer_counts_as_fine() -> None:
    reply = {"pictures": [
        {"image": 3, "verdict": "fix", "photo": 2, "note": "  a   generic  bottle "},
        {"image": "x", "verdict": "fix", "photo": 1, "note": ""},
        {"image": 4, "verdict": "maybe", "photo": 1, "note": ""},
        "nonsense",
    ]}  # fmt: skip
    assert engine.read_reply(reply) == {3: ("fix", 2, "a generic bottle")}
    assert engine.read_reply(None) == {}


def _jpeg(colour: tuple[int, int, int] = (200, 40, 40)) -> bytes:
    out = io.BytesIO()
    image = Image.new("RGB", (64, 48), colour)
    for x in range(0, 64, 8):  # a little texture, so it isn't flat
        image.putpixel((x, 10), (10, 10, 10))
    image.save(out, format="JPEG")
    return out.getvalue()


def test_lps_own_placeholders_are_recognised() -> None:
    placeholder = Image.open(io.BytesIO(fal.mock_image(300, 200, label="SCENE")))
    assert fidelity.is_placeholder(placeholder)
    assert not fidelity.is_placeholder(Image.open(io.BytesIO(_jpeg())))


# ── the check, with a fake vision model ───────────────────────────────────────


def _result(reply: dict[str, Any]) -> anthropic.LLMResult:
    return anthropic.LLMResult(
        text=json.dumps(reply), model="vision", requested_model="vision", input_tokens=10,
        output_tokens=10, cost_usd=Decimal("0.02"), stop_reason="end_turn", fell_back=False,
        mock=False,
    )  # fmt: skip


@pytest.fixture
def seen(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Pictures "download" without the network: bath.jpg is a placeholder, ana.jpg won't download,
    the rest are pictures; the vision model says bath and counter need fixing."""
    calls: dict[str, Any] = {"asked": []}

    def thumbnail(src: str, side: int = fidelity.THUMB) -> fidelity.Thumb:
        if "placeholder" in src:
            return fidelity.Thumb(None, placeholder=True)
        if "ana.jpg" in src:
            return fidelity.Thumb(None)
        return fidelity.Thumb(_jpeg())

    def generate(**kwargs: Any) -> anthropic.LLMResult:
        content = kwargs["messages"][0]["content"]
        calls["asked"].append([b["text"] for b in content if b["type"] == "text"])
        calls["system"] = kwargs["system"]
        return _result({"pictures": [
            {"image": 3, "verdict": "fix", "photo": 2, "note": "A different bottle"},
            {"image": 12, "verdict": "fix", "photo": 1, "note": "Generic jar"},
        ]})  # fmt: skip

    monkeypatch.setattr(fidelity, "thumbnail", thumbnail)
    monkeypatch.setattr(anthropic, "generate", generate)
    return calls


def test_the_check_asks_once_about_what_it_can_see(seen: dict[str, Any]) -> None:
    page = BUSY.replace(f"{CDN}/bath.jpg", f"{CDN}/placeholder.jpg")
    found = fidelity.check(page, PHOTOS, image_rules="Never show the product in a bathroom.")
    assert len(seen["asked"]) == 1
    texts = seen["asked"][0]
    assert texts[:3] == ["The real product's photos:", "Product photo 1", "Product photo 2"]
    assert "Image 12" in texts and "Image 3" not in texts  # placeholders aren't sent
    assert "TEMPLATE IMAGE RULES:\nNever show the product in a bathroom." in texts[-1]
    verdicts = {i.number: (i.verdict, i.photo) for i in found.items}
    assert verdicts == {
        3: ("placeholder", None), 4: ("placeholder", None), 9: ("unreadable", None),
        11: ("ok", None), 12: ("fix", 1),
    }  # fmt: skip
    assert found.photos == 2 and found.reason is None and found.mock is False
    assert [f.numbers for f in fidelity.fixes_for(page, PHOTOS, found)] == [(12,)]


def test_nothing_is_asked_without_product_photos_or_pictures(seen: dict[str, Any]) -> None:
    assert fidelity.check(BUSY, []).reason == "no_product_photos"
    only_kept = '<body><img data-lp-img="1" data-lp-keep src="https://x.test/a.png"></body>'
    found = fidelity.check(only_kept, PHOTOS)
    assert found.items == [] and seen["asked"] == []


# ── through the API ───────────────────────────────────────────────────────────


def run_fidelity_job() -> dict[str, Any]:
    from app.jobs import queue
    from app.jobs.registry import KINDS
    from app.jobs.runner import Runner

    runner = Runner(get_settings(), kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, ["product_fidelity"])
    assert claimed is not None
    runner.execute(claimed)
    return job_row(claimed.id)


def match(client: TestClient, user: DbUser, build: dict[str, Any]) -> Any:
    return client.post(
        f"/builds/{build['id']}/images/match",
        json={"org_id": build["org_id"]},
        headers=bearer(user),
    )


@pytest.fixture
def bath_is_wrong(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    """No network: every picture is a picture; the vision model says image 3 (the bath) shows a
    different product, to be fixed with product photo 2."""
    asked = {"n": 0}

    def generate(**kwargs: Any) -> anthropic.LLMResult:
        asked["n"] += 1
        return _result({"pictures": [
            {"image": 3, "verdict": "fix", "photo": 2, "note": "Not our serum"},
        ]})  # fmt: skip

    monkeypatch.setattr(fidelity, "thumbnail", lambda src, side=0: fidelity.Thumb(_jpeg()))
    monkeypatch.setattr(anthropic, "generate", generate)
    return asked


@needs_db
def test_the_check_is_automatic_and_the_match_is_one_undoable_change(
    client: TestClient, user: DbUser, pictured: dict[str, Any], bath_is_wrong: dict[str, int]
) -> None:
    # Opening the studio checks the pictures (the page has no check yet).
    first = studio(client, user, pictured, 3).json()["match"]
    assert first["status"] == "checking" and first["job_id"] and first["mock"] is True
    checked = run_fidelity_job()
    assert checked["status"] == "succeeded", checked["error"]
    assert checked["result"]["to_fix"] == 1 and bath_is_wrong["n"] == 1
    ready = studio(client, user, pictured, 3).json()["match"]
    assert ready["status"] == "ready" and ready["to_fix"] == 1 and ready["checked"] == 1
    assert ready["price"] == "0.15" and ready["job_id"] is None  # nothing queued again: up to date

    version = desk(client, user, pictured)["build"]["page_version"]
    started = match(client, user, pictured)
    assert started.status_code == 200, started.text
    assert desk(client, user, pictured)["matching"] == started.json()["job_id"]
    twice = match(client, user, pictured)
    assert twice.status_code == 422 and "already being matched" in twice.json()["detail"]
    done = run_fidelity_job()
    assert done["status"] == "succeeded", done["error"]
    assert done["result"]["fixed"] == 1 and done["result"]["mock"] is True
    assert done["result"]["page_version"] == version + 1
    assert bath_is_wrong["n"] == 1  # the match used the check it had

    state = desk(client, user, pictured)
    assert state["snapshots"][0]["reason"].startswith("Matched the product in 1 picture")
    assert state["matching"] is None
    src = test_image_studio.img(page_of(pictured), 3)["src"]
    assert "/storage/v1/object/public/assets/" in src
    after = studio(client, user, pictured, 3).json()
    assert [(v["source"], v["current"]) for v in after["versions"]] == [
        ("edited", True),
        ("original", False),
    ]
    assert after["match"]["status"] == "ready" and after["match"]["to_fix"] == 0
    assert after["match"]["fixed"] == 1
    with transaction() as conn:
        row = conn.execute(
            "select report->'images'->'product_fix' as pf, mock_images from builds "
            "where id = %(b)s",
            {"b": pictured["id"]},
        ).fetchone()
    assert row is not None and row["mock_images"] is True  # the publish gate's
    assert [i["verdict"] for i in row["pf"]["items"]] == ["fixed"]

    # Undo puts the old picture back, and the check notices it's out of date.
    undone = post(client, user, pictured, "undo", base_version=version + 1)
    assert undone.status_code == 200, undone.text
    assert test_image_studio.img(page_of(pictured), 3)["src"] == f"{CDN}/bath.jpg"
    assert studio(client, user, pictured, 3).json()["match"]["status"] == "checking"


@needs_db
def test_match_during_a_check_follows_it_and_needs_product_photos(
    client: TestClient, user: DbUser, pictured: dict[str, Any], bath_is_wrong: dict[str, int]
) -> None:
    checking = studio(client, user, pictured, 3).json()["match"]
    started = match(client, user, pictured)
    assert started.json()["job_id"] == checking["job_id"]  # the check becomes the match
    done = run_fidelity_job()
    assert done["result"]["fixed"] == 1 and bath_is_wrong["n"] == 1
    with transaction() as conn:
        conn.execute(
            "update products set images = '[]'::jsonb "
            "where id = (select product_id from builds where id = %(b)s)",
            {"b": pictured["id"]},
        )
    assert studio(client, user, pictured, 3).json()["match"]["status"] == "unavailable"
    refused = match(client, user, pictured)
    assert refused.status_code == 422 and "no photos" in refused.json()["detail"]


# ── Buddy, and the build step ─────────────────────────────────────────────────


def test_buddy_starts_the_match_once() -> None:
    started: list[int] = []

    def matcher() -> str:
        started.append(1)
        return "Started."

    work = agent.Work(html=PAGE, rules={}, colors=None, matcher=matcher)
    told, _, step = work.run("match_product", {})
    again, _, _ = work.run("match_product", {})
    assert told == "Started." and step.label == "Started matching the product in the pictures"
    assert "Already" in again and started == [1] and work.changes == []
    assert work.doing("match_product", {})[0] == "Matching the product"
    assert any(t["name"] == "match_product" for t in agent.TOOLS)


@needs_db
def test_the_build_step_fixes_pictures_once_they_are_live(
    finished: dict[str, Any], monkeypatch: pytest.MonkeyPatch, bath_is_wrong: dict[str, int]
) -> None:
    from app.pipeline.nodes.product_fidelity import product_fidelity

    made: list[list[str]] = []

    def edit_image(**kwargs: Any) -> fal.ImageResult:
        made.append(kwargs["image_urls"])
        return fal.ImageResult(
            data=_jpeg((20, 120, 200)), mime="image/jpeg", width=64, height=48, model="edit",
            cost_usd=Decimal("0.15"), mock=False,
        )  # fmt: skip

    monkeypatch.setattr(fal, "edit_image", edit_image)
    path = f"{finished['org_id']}/{finished['id']}/rev/900-test.html"
    storage.upload("builds", path, PAGE.encode(), "text/html", upsert=True)
    job = SimpleNamespace(
        job=SimpleNamespace(id=uuid.uuid4()),
        check_stopping=lambda: None,
        progress=lambda *a, **k: None,
    )
    ctx = PipelineContext(
        job=job,  # type: ignore[arg-type]
        org_id=finished["org_id"],
        build_id=finished["id"],
        order=[],
    )
    state: dict[str, Any] = {
        "org_id": str(finished["org_id"]), "build_id": str(finished["id"]), "html_path": path,
        "html_rev": 900, "product": {"images": PHOTOS},
        "template": {"instructions": {"image_rules": "", "generic_images": []}},
        "wizard": {"ai_images": True}, "images": {"mock": False},
    }  # fmt: skip
    mocked = product_fidelity(state | {"mock_images": True}, SimpleNamespace(context=ctx))  # type: ignore[arg-type]
    assert "html_path" not in mocked and made == []  # mock mode: checked, not fixed
    assert mocked["images"]["product_fix"]["items"][0]["verdict"] == "fix"

    live = product_fidelity(state | {"mock_images": False}, SimpleNamespace(context=ctx))  # type: ignore[arg-type]
    assert made == [[f"{CDN}/bath.jpg", PHOTOS[1]]]
    html = storage.download("builds", live["html_path"]).decode()
    src = parse(html).select_one('img[data-lp-img="3"]')["src"]  # type: ignore[index]
    assert "/storage/v1/object/public/assets/" in src
    assert live["images"]["product_fix"]["items"][0]["verdict"] == "fixed"
    assert live["node_reports"][0]["stats"]["fixed"] == 1
    with transaction() as conn:
        versions = conn.execute(
            "select source::text, src from image_versions where build_id = %(b)s and slot = 3 "
            "order by seq",
            {"b": finished["id"]},
        ).fetchall()
    assert [v["source"] for v in versions] == ["original", "edited"]
    assert versions[1]["src"] == src
