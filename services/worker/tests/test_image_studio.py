"""The image studio (BUILD_SPEC §11.2, B3.2a, D109): the pure image edits, Lander's image tools,
and replacing, cropping, describing and restoring an image through the API."""

import base64
import io
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import agent
from app.config import get_settings
from app.db import transaction
from app.engines import image_edits
from app.engines.html import parse
from app.providers import anthropic, storage
from tests.conftest import DbUser, needs_db
from tests.test_agent import Script, ask, call, run_agent
from tests.test_api import bearer, fake_jwks  # noqa: F401 (autouse fixture)
from tests.test_desk import desk

CDN = "https://cdn.example.test"
PAGE = (
    "<html><head><title>Serum</title></head><body>"
    '<section data-lp-section="hero">'
    f'<img data-lp-img="1" data-lp-logo src="{CDN}/logo.png" alt="Lume">'
    "<h1>Glow in 7 days</h1>"
    f'<picture><source srcset="{CDN}/hero.webp" type="image/webp">'
    f'<img data-lp-img="2" data-lp-product src="{CDN}/hero.jpg" srcset="{CDN}/hero-2x.jpg 2x" '
    'alt="The serum"></picture></section>'
    '<section data-lp-section="faq"><p>Is it gentle?</p>'
    f'<img data-lp-img="3" data-lp-scene src="{CDN}/bath.jpg" alt=""></section>'
    "</body></html>"
)
PHOTOS = [f"{CDN}/serum-front.jpg", f"{CDN}/serum-side.jpg"]


def img(html: str, number: int) -> Any:
    tag = parse(html).select_one(f'img[data-lp-img="{number}"]')
    assert tag is not None
    return tag


# ── the engine ────────────────────────────────────────────────────────────────


def test_the_page_lists_its_images_with_kind_section_and_shape() -> None:
    found = image_edits.page_images(PAGE)
    assert [(i.number, i.kind, i.section) for i in found] == [
        (1, "logo", "hero"),
        (2, "product", "hero"),
        (3, "scene", "faq"),
    ]
    assert found[1].alt == "The serum" and found[1].ratio == "original" and found[1].fit == "cover"


def test_a_new_picture_drops_what_would_win_over_it() -> None:
    html, before = image_edits.set_src(PAGE, 2, PHOTOS[0])
    assert before == f"{CDN}/hero.jpg"
    tag = img(html, 2)
    assert tag["src"] == PHOTOS[0] and not tag.has_attr("srcset")
    assert parse(html).select("picture source") == []
    with pytest.raises(image_edits.ImageEditError, match="logo"):
        image_edits.set_src(PAGE, 1, PHOTOS[0])
    with pytest.raises(image_edits.ImageEditError, match="no image 9"):
        image_edits.set_src(PAGE, 9, PHOTOS[0])
    with pytest.raises(image_edits.ImageEditError, match="web address"):
        image_edits.set_src(PAGE, 2, "javascript:alert(1)")
    with pytest.raises(image_edits.ImageEditError, match="already"):
        image_edits.set_src(PAGE, 3, f"{CDN}/bath.jpg")


def test_shape_fit_focus_and_alt_are_set_and_read_back() -> None:
    html = image_edits.set_shape(PAGE, 3, ratio="4:3", focus="top")
    style = img(html, 3)["style"]
    assert "aspect-ratio: 4 / 3" in style and "object-fit: cover" in style
    assert "object-position: 50% 0%" in style and "height: auto" in style
    shaped = next(i for i in image_edits.page_images(html) if i.number == 3)
    assert (shaped.ratio, shaped.fit, shaped.focus) == ("4:3", "cover", "top")

    fitted = image_edits.set_shape(html, 3, ratio="original", fit="contain")
    back = next(i for i in image_edits.page_images(fitted) if i.number == 3)
    assert (back.ratio, back.fit) == ("original", "contain")
    assert "aspect-ratio" not in img(fitted, 3)["style"]

    described = image_edits.set_alt(PAGE, 3, "  A  bath  " + "x" * 300)
    assert img(described, 3)["alt"].startswith("A bath x") and len(img(described, 3)["alt"]) == 250


def test_original_puts_the_image_back_as_the_build_made_it() -> None:
    """The owner's ALL-1 profile photo: cropped, restored, and still stretched to its box."""
    own = f'<img data-lp-img="4" src="{CDN}/me.jpg" style="width:64px;border-radius:50%">'
    page = PAGE.replace("</section></body>", own + "</section></body>")
    cropped = image_edits.set_shape(page, 4, ratio="1:1", focus="top")
    assert img(cropped, 4)[image_edits.OWN_STYLE] == "width:64px;border-radius:50%"
    fitted = image_edits.set_shape(cropped, 4, fit="contain")
    back = image_edits.set_shape(fitted, 4, ratio="original")
    tag = img(back, 4)
    assert tag["style"] == "width:64px;border-radius:50%"
    assert not tag.has_attr(image_edits.OWN_STYLE)
    # Shaped before the studio kept the image's own style: it comes from the page's history.
    legacy = page.replace(
        'style="width:64px;border-radius:50%"',
        'style="width: 100%; height: auto; object-fit: cover"',
    )
    fixed = image_edits.set_shape(legacy, 4, ratio="original", own_style="width:64px")
    assert img(fixed, 4)["style"] == "width:64px"
    # With nothing to go back to, only the crop's ratio comes off.
    bare = image_edits.set_shape(image_edits.set_shape(PAGE, 3, ratio="4:3"), 3, ratio="original")
    assert not img(bare, 3).has_attr("style") or "aspect-ratio" not in img(bare, 3)["style"]


# ── Lander's image tools ──────────────────────────────────────────────────────


def lander(html: str = PAGE) -> agent.Work:
    return agent.Work(html=html, rules={}, colors=None, product_photos=list(PHOTOS))


def test_lander_sees_the_images_and_product_photos() -> None:
    outline = lander().outline()
    assert 'image 2: product in Hero, alt "The serum"' in outline
    assert "image 3: scene in Faq, no alt text" in outline
    assert "image 1" not in outline  # the logo comes from the brand
    assert "Product photos: 1 to 2" in outline


def test_lander_swaps_and_adjusts_an_image() -> None:
    w = lander()
    out, failed, step = w.run("replace_image", {"number": 3, "product": 2})
    assert not failed and "Replaced image 3 in Faq with a product photo" in out
    assert img(w.html, 3)["src"] == PHOTOS[1]
    assert step.change is not None and step.change["before"] == f"{CDN}/bath.jpg"

    out, failed, _ = w.run("replace_image", {"number": 2, "image": 3})
    assert not failed and img(w.html, 2)["src"] == PHOTOS[1]

    out, failed, step = w.run("adjust_image", {"number": 2, "ratio": "1:1", "alt": "The serum"})
    assert not failed and "ratio 1:1, alt text" in out
    assert step.change is not None and "before" not in step.change

    for args, why in (
        ({"number": 1, "product": 1}, "logo"),
        ({"number": 2, "product": 7}, "no product photo 7"),
        ({"number": 2}, "Say which"),
    ):
        out, failed, _ = w.run("replace_image", args)
        assert failed and why in out
    assert [c["kind"] for c in w.changes] == ["image", "image", "image"]


# ── the studio, through the API ───────────────────────────────────────────────


@pytest.fixture
def pictured(finished: dict[str, Any]) -> dict[str, Any]:
    """The finished build with PAGE as its page and two product photos."""
    path = f"{finished['org_id']}/{finished['id']}/working.html"
    storage.upload("builds", path, PAGE.encode(), "text/html", upsert=True)
    with transaction() as conn:
        conn.execute(
            """
            update products set images = %(images)s::jsonb
            where id = (select product_id from builds where id = %(b)s)
            """,
            {
                "images": "[" + ",".join(f'{{"source_url": "{u}"}}' for u in PHOTOS) + "]",
                "b": finished["id"],
            },
        )
    return finished


def studio(client: TestClient, user: DbUser, build: dict[str, Any], number: int) -> Any:
    return client.get(
        f"/builds/{build['id']}/images/{number}",
        params={"org_id": build["org_id"]},
        headers=bearer(user),
    )


def change(
    client: TestClient, user: DbUser, build: dict[str, Any], number: int, action: str, **body: Any
) -> Any:
    version = desk(client, user, build)["build"]["page_version"]
    return client.post(
        f"/builds/{build['id']}/images/{number}/{action}",
        json={"org_id": build["org_id"], "base_version": version, **body},
        headers=bearer(user),
    )


def page_of(build: dict[str, Any]) -> str:
    with transaction() as conn:
        row = conn.execute(
            "select working_html_path from builds where id = %(b)s", {"b": build["id"]}
        ).fetchone()
    assert row is not None
    return storage.download("builds", row["working_html_path"]).decode()


@needs_db
def test_the_studio_offers_product_photos_and_the_pages_other_images(
    client: TestClient, user: DbUser, pictured: dict[str, Any]
) -> None:
    response = studio(client, user, pictured, 3)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["image"]["kind"] == "scene" and body["image"]["section"] == "faq"
    assert [p["src"] for p in body["product_photos"]] == PHOTOS
    assert [(p["number"], p["src"]) for p in body["page_images"]] == [(2, f"{CDN}/hero.jpg")]
    assert body["versions"] == []
    assert studio(client, user, pictured, 9).status_code == 404


@needs_db
def test_a_replace_is_one_undoable_change_with_a_history_to_restore(
    client: TestClient, user: DbUser, pictured: dict[str, Any]
) -> None:
    version = desk(client, user, pictured)["build"]["page_version"]
    replaced = change(client, user, pictured, 3, "replace", src=PHOTOS[0], source="product")
    assert replaced.status_code == 200, replaced.text
    state = replaced.json()
    assert state["build"]["page_version"] == version + 1
    assert state["snapshots"][0]["reason"].startswith("Replaced an image in ")
    assert state["snapshots"][0]["reason"].endswith(" with a product photo")
    assert img(page_of(pictured), 3)["src"] == PHOTOS[0]

    again = change(client, user, pictured, 3, "replace", src=f"{CDN}/hero.jpg", source="reused")
    assert again.status_code == 200, again.text
    versions = studio(client, user, pictured, 3).json()["versions"]
    assert [(v["seq"], v["source"], v["current"]) for v in versions] == [
        (3, "reused", True),
        (2, "product", False),
        (1, "original", False),
    ]

    restored = change(client, user, pictured, 3, "restore", version_id=versions[-1]["id"])
    assert restored.status_code == 200, restored.text
    assert restored.json()["snapshots"][0]["reason"].startswith("Restored an earlier image")
    assert img(page_of(pictured), 3)["src"] == f"{CDN}/bath.jpg"
    again = change(client, user, pictured, 3, "restore", version_id=versions[-1]["id"])
    assert again.status_code == 422 and "already" in again.json()["detail"]
    after = studio(client, user, pictured, 3).json()["versions"]
    assert [v["current"] for v in after] == [False, False, True]

    # Undo brings back the picture before the restore, and the history follows the page.
    undone = client.post(
        f"/builds/{pictured['id']}/undo",
        json={"org_id": pictured["org_id"], "base_version": version + 3},
        headers=bearer(user),
    )
    assert undone.status_code == 200, undone.text
    assert [v["current"] for v in studio(client, user, pictured, 3).json()["versions"]] == [
        True,
        False,
        False,
    ]


@needs_db
def test_only_known_pictures_and_real_changes_are_taken(
    client: TestClient, user: DbUser, other_org: uuid.UUID, pictured: dict[str, Any]
) -> None:
    stranger = change(client, user, pictured, 3, "replace", src=f"{CDN}/other.jpg", source="reused")
    assert stranger.status_code == 422 and "isn't one LP stores" in stranger.json()["detail"]
    logo = change(client, user, pictured, 1, "replace", src=PHOTOS[0], source="product")
    assert logo.status_code == 422 and "logo" in logo.json()["detail"]
    nothing = change(client, user, pictured, 3, "adjust")
    assert nothing.status_code == 422
    stale = client.post(
        f"/builds/{pictured['id']}/images/3/adjust",
        json={"org_id": pictured["org_id"], "base_version": 99, "alt": "A bath"},
        headers=bearer(user),
    )
    assert stale.status_code == 409
    foreign = client.get(
        f"/builds/{pictured['id']}/images/3",
        params={"org_id": str(other_org)},
        headers=bearer(user),
    )
    assert foreign.status_code == 403


@needs_db
def test_crop_and_alt_text_are_desk_changes(
    client: TestClient, user: DbUser, pictured: dict[str, Any]
) -> None:
    cropped = change(client, user, pictured, 2, "adjust", ratio="16:9", focus="bottom")
    assert cropped.status_code == 200, cropped.text
    assert cropped.json()["snapshots"][0]["reason"].startswith("Cropped an image in ")
    described = change(client, user, pictured, 3, "adjust", alt="A warm bath with the serum")
    assert described.status_code == 200, described.text
    assert described.json()["snapshots"][0]["reason"].startswith("Changed an image's alt text")
    page = page_of(pictured)
    assert "aspect-ratio: 16 / 9" in img(page, 2)["style"]
    assert img(page, 3)["alt"] == "A warm bath with the serum"
    shown = studio(client, user, pictured, 2).json()["image"]
    assert (shown["ratio"], shown["focus"]) == ("16:9", "bottom")
    back = change(client, user, pictured, 2, "adjust", ratio="original")
    assert back.status_code == 200, back.text
    assert not img(page_of(pictured), 2).has_attr("style")  # as the build made it


def _png() -> str:
    out = io.BytesIO()
    Image.new("RGB", (4, 4), (uuid.uuid4().int % 255, 120, 80)).save(out, "PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


@needs_db
def test_an_upload_is_stored_and_can_become_the_image(
    client: TestClient, user: DbUser, pictured: dict[str, Any]
) -> None:
    def upload(data_url: str) -> Any:
        return client.post(
            f"/builds/{pictured['id']}/images/upload",
            json={"org_id": pictured["org_id"], "data_url": data_url},
            headers=bearer(user),
        )

    stored = upload(_png())
    assert stored.status_code == 200, stored.text
    body = stored.json()
    assert body["url"].startswith(get_settings().supabase_url.rstrip("/"))
    used = change(
        client, user, pictured, 3, "replace", src=body["url"], source="uploaded",
        asset_id=body["asset_id"],
    )  # fmt: skip
    assert used.status_code == 200, used.text
    assert used.json()["snapshots"][0]["reason"].endswith("with an upload")
    assert upload("data:image/gif;base64,R0lGODlhAQABAAAAACw=").status_code == 422
    assert upload("data:image/png;base64,bm90IGEgcGljdHVyZQ==").status_code == 422


@needs_db
def test_lander_swaps_an_image_and_it_joins_the_history(
    client: TestClient, user: DbUser, pictured: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    script = Script(
        [
            {"type": "text", "text": "I'll use the front photo in the FAQ."},
            call("replace_image", number=3, product=1),
        ],
        [{"type": "text", "text": "Done: the FAQ shows the serum from the front."}],
    )
    monkeypatch.setattr(anthropic, "generate", script)
    version = desk(client, user, pictured)["build"]["page_version"]
    started = ask(client, user, pictured, version, "Use a product photo in the FAQ")
    assert started.status_code == 200, started.text
    job = run_agent()
    assert job["status"] == "succeeded", job["error"]
    assert [c["kind"] for c in job["result"]["changes"]] == ["image"]
    first = script.calls[0]["messages"][0]["content"][-1]["text"]  # the list grows as it runs
    assert "Product photos: 1 to 2" in first
    assert img(page_of(pictured), 3)["src"] == PHOTOS[0]
    versions = studio(client, user, pictured, 3).json()["versions"]
    assert [(v["source"], v["current"]) for v in versions] == [
        ("product", True),
        ("original", False),
    ]


# ── AI pictures (B3.2b, D110), in mock mode ───────────────────────────────────


def test_ai_pictures_are_asked_for_plainly_and_sized_to_the_image() -> None:
    from app import image_ai

    assert image_ai.prompt_for("generate", "A bath at dusk.", False).startswith(
        "A bath at dusk. A natural, photographic picture"
    )
    assert "reference photos" in image_ai.prompt_for("edit", "Put the bottle on the edge", True)
    square = image_edits.set_shape(PAGE, 3, ratio="1:1")
    assert image_ai.size_for(square, 3) == (1024, 1024)
    wide = image_edits.set_shape(PAGE, 3, ratio="16:9")
    assert image_ai.size_for(wide, 3) == (1024, 576)


def run_image_job() -> dict[str, Any]:
    from app.jobs import queue
    from app.jobs.registry import KINDS
    from app.jobs.runner import Runner
    from tests.conftest import job_row

    runner = Runner(get_settings(), kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, ["image_generate", "image_edit"])
    assert claimed is not None
    runner.execute(claimed)
    return job_row(claimed.id)


def make_picture(
    client: TestClient, user: DbUser, build: dict[str, Any], number: int, **body: Any
) -> Any:
    return client.post(
        f"/builds/{build['id']}/images/{number}/ai",
        json={"org_id": build["org_id"], **body},
        headers=bearer(user),
    )


@needs_db
def test_a_new_picture_is_a_job_that_lands_as_one_undoable_change(
    client: TestClient, user: DbUser, pictured: dict[str, Any]
) -> None:
    shown = studio(client, user, pictured, 3).json()
    assert shown["ai"] == {"mock": True, "price": "0.15"} and shown["making"] is None
    version = desk(client, user, pictured)["build"]["page_version"]
    started = make_picture(client, user, pictured, 3, mode="generate", prompt="A warm bath at dusk")
    assert started.status_code == 200, started.text
    assert started.json()["mode"] == "generate"
    assert studio(client, user, pictured, 3).json()["making"]["job_id"] == started.json()["job_id"]
    again = make_picture(client, user, pictured, 3, mode="generate", prompt="Another")
    assert again.status_code == 422 and "already being made" in again.json()["detail"]

    job = run_image_job()
    assert job["status"] == "succeeded", job["error"]
    assert job["result"]["mock"] is True and job["result"]["page_version"] == version + 1
    state = desk(client, user, pictured)
    assert state["snapshots"][0]["reason"].startswith("Made a new picture with AI in ")
    src = img(page_of(pictured), 3)["src"]
    assert src == job["result"]["src"] and "/storage/v1/object/public/assets/" in src
    versions = studio(client, user, pictured, 3).json()["versions"]
    assert [(v["source"], v["current"]) for v in versions] == [
        ("generated", True),
        ("original", False),
    ]
    with transaction() as conn:
        row = conn.execute(
            "select prompt from image_versions where build_id = %(b)s and source = 'generated'",
            {"b": pictured["id"]},
        ).fetchone()
        flagged = conn.execute(
            "select mock_images from builds where id = %(b)s", {"b": pictured["id"]}
        ).fetchone()
    assert row is not None and row["prompt"] == "A warm bath at dusk"
    assert flagged is not None and flagged["mock_images"] is True  # the publish gate's


@needs_db
def test_an_edit_takes_product_photos_and_refuses_what_it_cant_do(
    client: TestClient, user: DbUser, pictured: dict[str, Any]
) -> None:
    logo = make_picture(client, user, pictured, 1, mode="generate", prompt="A new logo")
    assert logo.status_code == 422 and "logo" in logo.json()["detail"]
    unknown = make_picture(
        client, user, pictured, 2, mode="edit", prompt="On marble", product_photos=[9]
    )
    assert unknown.status_code == 422 and "no product photo 9" in unknown.json()["detail"]
    edited = make_picture(
        client, user, pictured, 2, mode="edit", prompt="On a marble counter", product_photos=[1, 2]
    )
    assert edited.status_code == 200, edited.text
    with transaction() as conn:
        queued = conn.execute(
            "select kind, payload from jobs where id = %(j)s", {"j": edited.json()["job_id"]}
        ).fetchone()
    assert queued is not None and queued["kind"] == "image_edit"
    assert queued["payload"]["references"] == PHOTOS
    job = run_image_job()
    assert job["status"] == "succeeded", job["error"]
    assert desk(client, user, pictured)["snapshots"][0]["reason"].startswith(
        "Edited a picture with AI in "
    )
    # Another picture for the same image is a different placeholder, so the page changes again.
    again = make_picture(client, user, pictured, 2, mode="edit", prompt="On a marble counter")
    assert again.status_code == 200, again.text
    second = run_image_job()
    assert second["status"] == "succeeded", second["error"]
    assert second["result"]["src"] != job["result"]["src"]


@needs_db
def test_lander_makes_a_picture_when_asked(
    client: TestClient, user: DbUser, pictured: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    script = Script(
        [
            {"type": "text", "text": "I'll make one new picture for the FAQ ($0.15 once live)."},
            call("generate_image", number=3, prompt="A calm bathroom shelf", products=[1]),
        ],
        [{"type": "text", "text": "Done: the FAQ has a new picture."}],
    )
    monkeypatch.setattr(anthropic, "generate", script)
    version = desk(client, user, pictured)["build"]["page_version"]
    started = ask(client, user, pictured, version, "Make a new picture for the FAQ")
    assert started.status_code == 200, started.text
    job = run_agent()
    assert job["status"] == "succeeded", job["error"]
    change = job["result"]["changes"][0]
    assert change["kind"] == "image" and change["source"] == "generated" and change["mock"]
    assert change["label"].startswith("Made a new picture for image 3 in ")
    assert change["label"].endswith("(a placeholder)")
    versions = studio(client, user, pictured, 3).json()["versions"]
    assert versions[0]["source"] == "generated" and versions[0]["current"]
