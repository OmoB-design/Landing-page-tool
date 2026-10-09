"""The build pipeline end to end (BUILD_SPEC §10, §16) against the local database and storage,
with mock images. Jobs use a test-only kind name so a running dev worker ignores them."""

import io
import threading
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from PIL import Image
from psycopg.types.json import Jsonb

from app.cli.seed_library import seed
from app.config import Settings
from app.db import transaction
from app.engines import recolor as recolor_engine
from app.engines.html import parse
from app.jobs import queue
from app.jobs.kinds import build as build_kind
from app.jobs.kinds import export as export_kind
from app.jobs.registry import JobKind
from app.jobs.runner import Runner
from app.pipeline.graph import (
    CLONE_ONLY,
    ORDER,
    build_graph,
    get_graph,
    route_after_fidelity,
    route_after_finalize,
    route_before_images,
)
from app.providers import anthropic, storage
from tests.conftest import DbUser, job_row, needs_db

FIXTURE = Path(__file__).resolve().parents[3] / "templates" / "library" / "advertorial-fixture"
KIND = "test_build"
KINDS = {KIND: JobKind(KIND, "Page build", build_kind.run, build_kind.BuildPayload, max_attempts=3)}


def test_owned_builds_route_past_every_clone_only_node() -> None:
    owned: Any = {"origin": "owned"}
    cloned: Any = {"origin": "cloned"}
    assert route_before_images(owned) == "prepare_media_slots"
    assert route_after_finalize(owned) == "product_fidelity"
    assert route_after_fidelity(owned) == "compliance_scan"
    assert route_before_images(cloned) == "strip_chrome"
    assert route_after_finalize(cloned) == "scrub_source_brand"
    assert route_after_fidelity(cloned) == "residue_scan"
    assert not set(CLONE_ONLY) & set(ORDER["owned"])
    assert set(CLONE_ONLY) <= set(ORDER["cloned"])
    assert ORDER["cloned"].index("strip_chrome") < ORDER["cloned"].index("image_pass")  # D21
    graph_nodes = set(build_graph().get_graph().nodes) - {"__start__", "__end__"}
    assert graph_nodes == set(ORDER["cloned"])


def _png(color: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (60, 60), color).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def library_template() -> uuid.UUID:
    seed(FIXTURE)
    with transaction() as conn:
        row = conn.execute(
            "select id from templates where org_id is null and slug = 'advertorial-fixture'"
        ).fetchone()
    assert row is not None
    return uuid.UUID(str(row["id"]))


@pytest.fixture
def brand_and_product(user: DbUser) -> Iterator[tuple[uuid.UUID, uuid.UUID, str, str]]:
    logo = storage.store_asset(user.org_id, _png((11, 61, 46)), "image/png")
    photo = storage.store_asset(user.org_id, _png((209, 224, 48)), "image/png")
    with transaction() as conn:
        brand = conn.execute(
            """
            insert into brands (org_id, name, prefix, url, palette, fonts, logo_asset_id,
                                support_email, language)
            values (%(o)s, 'Graza Test', 'GRT', 'https://www.graza.test',
                    '{"primary": "#d1e030", "accent": "#0b3d2e"}', '{"heading": "Alpina"}',
                    %(logo)s, 'hello@graza.test', 'en-US')
            returning id
            """,
            {"o": user.org_id, "logo": logo.id},
        ).fetchone()
        assert brand is not None
        product = conn.execute(
            """
            insert into products (org_id, brand_id, handle, name, url, currency, price,
                                  usps, images, variants)
            values (%(o)s, %(b)s, 'drizzle', 'Drizzle', 'https://www.graza.test/products/drizzle',
                    'USD', 21, '["Made for finishing", "Single origin"]', %(images)s, %(variants)s)
            returning id
            """,
            {
                "o": user.org_id,
                "b": brand["id"],
                "images": Jsonb([{"asset_id": str(photo.id), "source_url": "https://x.test/p.png"}]),
                "variants": Jsonb([
                    {"name": "1 Bottle", "price": "21.00"},
                    {"name": "2 Bottles", "price": "42.00"},
                ]),
            },
        ).fetchone()  # fmt: skip
    assert product is not None
    yield brand["id"], product["id"], logo.url, photo.url
    storage.remove("assets", [logo.path, photo.path])


def new_build(
    user: DbUser, template_id: uuid.UUID, brand_id: uuid.UUID, product_id: uuid.UUID
) -> tuple[uuid.UUID, uuid.UUID]:
    """A build row and a test-kind job for it (POST /builds queues the real `build` kind)."""
    with transaction() as conn:
        key = conn.execute("select allocate_build_key(%(b)s) as key", {"b": brand_id}).fetchone()
        assert key is not None
        build = conn.execute(
            """
            insert into builds (org_id, brand_id, product_id, template_id, template_version, key,
                                origin, title, wizard, mock_images, created_by)
            values (%(o)s, %(b)s, %(p)s, %(t)s, 1, %(key)s, 'owned', 'Test build',
                    '{"ai_images": true}', true, %(u)s)
            returning id
            """,
            {
                "o": user.org_id, "b": brand_id, "p": product_id, "t": template_id,
                "key": key["key"], "u": user.id,
            },
        ).fetchone()  # fmt: skip
    assert build is not None
    job, _ = queue.enqueue(
        org_id=user.org_id, kind=KIND, payload={"build_id": str(build["id"])},
        created_by=user.id, build_id=build["id"], max_attempts=3,
    )  # fmt: skip
    return build["id"], job.id


def run_once(settings: Settings, stopping: threading.Event | None = None) -> None:
    runner = Runner(settings, kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    if stopping is not None:
        runner.stopping = stopping
    claimed = queue.claim(runner.worker_id, 5, [KIND])
    assert claimed is not None
    runner.execute(claimed)


def build_row(build_id: uuid.UUID) -> dict[str, Any]:
    with transaction() as conn:
        row = conn.execute("select * from builds where id = %(b)s", {"b": build_id}).fetchone()
    assert row is not None
    return dict(row)


def node_events(job_id: uuid.UUID) -> list[str]:
    with transaction() as conn:
        rows = conn.execute(
            "select node from job_events where job_id = %(j)s and node is not null order by id",
            {"j": job_id},
        ).fetchall()
    return [r["node"] for r in rows]


def checkpoint_count(build_id: uuid.UUID) -> int:
    with transaction() as conn:
        row = conn.execute(
            "select count(*) as n from langgraph.checkpoints where thread_id = %(t)s",
            {"t": str(build_id)},
        ).fetchone()
    return int(row["n"]) if row else 0


@needs_db
def test_an_owned_build_produces_the_branded_page_and_report(
    user: DbUser, fast_settings: Settings, library_template: uuid.UUID,
    brand_and_product: tuple[uuid.UUID, uuid.UUID, str, str],
) -> None:  # fmt: skip
    brand_id, product_id, logo_url, photo_url = brand_and_product
    build_id, job_id = new_build(user, library_template, brand_id, product_id)
    run_once(fast_settings)

    job = job_row(job_id)
    assert job["status"] == "succeeded", job["error"]
    assert node_events(job_id) == ORDER["owned"]  # every owned node, in order, no clone nodes
    build = build_row(build_id)
    assert build["status"] == "needs_review" and build["mock_images"] is True
    report = build["report"]
    assert report["mode"] == "owned" and report["template"]["slug"] == "advertorial-fixture"
    assert report["nodes"] == ORDER["owned"]
    copy = report["copy"]
    assert copy["mock"] is True and copy["error"] is None and copy["failed_chunks"] == 0
    assert copy["rewritten"] > 10 and copy["rewritten_ratio"] > 0.5
    assert copy["purged_terms"][0]["term"] == "Sample Labs"
    assert copy["review"][0]["replacement"].startswith("[mock] ")
    assert report["images"]["product_photos"] == 1 and report["images"]["mock_images"] == 5
    assert report["compliance"]["clean"] is True
    assert report["cost"]["total_usd"] == 0  # mock images are free

    html = storage.download("builds", build["working_html_path"]).decode()
    soup = parse(html)
    assert soup.select_one("[data-lp-logo]")["src"] == logo_url  # type: ignore[index]
    assert soup.select_one("img[data-lp-product]")["src"] == photo_url  # type: ignore[index]
    assert {t.get_text() for t in soup.select("[data-lp-product-name]")} == {"Drizzle"}
    assert {t.get_text() for t in soup.select("[data-lp-price]")} == {"$21.00"}
    assert [t.get_text() for t in soup.select("[data-lp-variant-name]")] == [
        "1 Bottle",
        "2 Bottles",
    ]
    assert "--lp-primary: #d1e030" in html and '"Alpina"' in html
    assert "Sample Labs" not in html and "mailto:hello@graza.test" in html
    assert "[mock] For years my mornings" in html  # copy pass ran (mock)
    assert "[mock]" not in soup.select_one("[data-lp-product-name]").get_text()  # type: ignore[union-attr]
    assert soup.select_one("[data-lp-lock]").get_text() == "By Dana Wells"  # type: ignore[union-attr]
    assert soup.title is not None and soup.title.get_text() == "Drizzle | Graza Test"
    # Only the final page is kept; the checkpoints are gone.
    assert checkpoint_count(build_id) == 0
    with transaction() as conn:
        files = conn.execute(
            "select name from storage.objects where bucket_id = 'builds' and name like %(p)s",
            {"p": f"%{build_id}%"},
        ).fetchall()
    assert [f["name"] for f in files] == [build["working_html_path"]]
    storage.remove("builds", [build["working_html_path"]])


@needs_db
def test_a_build_interrupted_by_a_worker_restart_resumes_where_it_stopped(
    user: DbUser, fast_settings: Settings, library_template: uuid.UUID,
    brand_and_product: tuple[uuid.UUID, uuid.UUID, str, str], monkeypatch: pytest.MonkeyPatch,
) -> None:  # fmt: skip
    brand_id, product_id, _, _ = brand_and_product
    build_id, job_id = new_build(user, library_template, brand_id, product_id)
    stopping = threading.Event()
    real_recolor = recolor_engine.recolor

    def recolor_then_shut_down(*args: Any, **kwargs: Any) -> Any:
        stopping.set()  # the worker is told to stop while recolour runs
        return real_recolor(*args, **kwargs)

    monkeypatch.setattr(recolor_engine, "recolor", recolor_then_shut_down)
    run_once(fast_settings, stopping)
    job = job_row(job_id)
    assert job["status"] == "queued"  # handed back, not failed
    assert node_events(job_id) == ["load_inputs", "apply_section_layout", "recolor"]
    assert build_row(build_id)["status"] == "building"
    assert checkpoint_count(build_id) > 0

    monkeypatch.setattr(recolor_engine, "recolor", real_recolor)
    run_once(fast_settings)
    job = job_row(job_id)
    assert job["status"] == "succeeded", job["error"]
    ran = node_events(job_id)
    assert ran.count("load_inputs") == 1 and ran.count("recolor") == 1  # nothing ran twice
    assert ran[-1] == "write_report" and build_row(build_id)["status"] == "needs_review"
    storage.remove("builds", [build_row(build_id)["working_html_path"]])


@needs_db
def test_a_build_whose_inputs_are_gone_fails_with_a_clear_reason(
    user: DbUser,
    fast_settings: Settings,
    library_template: uuid.UUID,
    brand_and_product: tuple[uuid.UUID, uuid.UUID, str, str],
) -> None:
    brand_id, product_id, _, _ = brand_and_product
    build_id, job_id = new_build(user, library_template, brand_id, product_id)
    with transaction() as conn:
        conn.execute(
            "update templates set deleted_at = now() where id = %(t)s", {"t": library_template}
        )
    try:
        run_once(fast_settings)
    finally:
        with transaction() as conn:
            conn.execute(
                "update templates set deleted_at = null where id = %(t)s", {"t": library_template}
            )
    job = job_row(job_id)
    assert job["status"] == "failed" and job["error"]["code"] == "inputs_missing"
    assert "gone" in job["error"]["message"]
    get_graph().checkpointer.delete_thread(str(build_id))  # type: ignore[union-attr]


@needs_db
@pytest.mark.parametrize("final", ["failed", "cancelled"])
def test_a_build_job_that_ends_for_good_marks_its_build_failed(
    user: DbUser,
    library_template: uuid.UUID,
    brand_and_product: tuple[uuid.UUID, uuid.UUID, str, str],
    final: str,
) -> None:
    brand_id, product_id, _, _ = brand_and_product
    build_id, _ = new_build(user, library_template, brand_id, product_id)
    with transaction() as conn:
        # A real `build` job, created already running so a dev worker never claims it.
        job = conn.execute(
            """
            insert into jobs (org_id, kind, payload, build_id, status, locked_by, attempts)
            values (%(o)s, 'build', %(p)s, %(b)s, 'running', 'test', 1) returning id
            """,
            {"o": user.org_id, "p": Jsonb({"build_id": str(build_id)}), "b": build_id},
        ).fetchone()
        assert job is not None
        conn.execute("update builds set status = 'building' where id = %(b)s", {"b": build_id})
        conn.execute(
            "update jobs set status = %(s)s where id = %(j)s", {"s": final, "j": job["id"]}
        )
    assert build_row(build_id)["status"] == "failed"


def _run_build(
    user: DbUser, settings: Settings, template_id: uuid.UUID, brand_id: uuid.UUID,
    product_id: uuid.UUID,
) -> tuple[dict[str, Any], str]:  # fmt: skip
    build_id, job_id = new_build(user, template_id, brand_id, product_id)
    run_once(settings)
    job = job_row(job_id)
    assert job["status"] == "succeeded", job["error"]
    build = build_row(build_id)
    html = storage.download("builds", build["working_html_path"]).decode()
    storage.remove("builds", [build["working_html_path"]])
    return build["report"], html


@needs_db
def test_a_failed_copy_chunk_keeps_the_template_text_and_blocks_publish(
    user: DbUser,
    fast_settings: Settings,
    library_template: uuid.UUID,
    brand_and_product: tuple[uuid.UUID, uuid.UUID, str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.pipeline.nodes import copy_rewrite

    def failing(**_: Any) -> Any:
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(anthropic, "generate", failing)
    monkeypatch.setattr(copy_rewrite, "ATTEMPT_WAITS", (0, 0, 0))
    brand_id, product_id, _, _ = brand_and_product
    report, html = _run_build(user, fast_settings, library_template, brand_id, product_id)
    copy = report["copy"]
    assert copy["failed_chunks"] == copy["chunks"] == 1 and copy["rewritten"] == 0
    assert "couldn't be rewritten" in copy["error"] and copy["error"] in report["warnings"]
    assert "For years my mornings were a mess" in html  # the template's text stays
    assert report["status"] == "needs_review"  # the build itself still finishes (D23)


@needs_db
def test_over_budget_lines_get_a_shortening_pass(
    user: DbUser,
    fast_settings: Settings,
    library_template: uuid.UUID,
    brand_and_product: tuple[uuid.UUID, uuid.UUID, str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import json

    from app.engines import copy_rules
    from app.providers.anthropic import LLMResult

    prompts: list[str] = []

    def fake(**kwargs: Any) -> Any:
        prompt = kwargs["prompt"]
        prompts.append(prompt)
        items = json.loads(prompt[prompt.index("[") :])
        if prompt.startswith("These replacements are too long"):
            out = [{"id": i["id"], "text": "Short."} for i in items]
        else:  # the draft: the h1 pieces come back far too long
            out = [
                {
                    "id": i["id"],
                    "text": ("Way too long " * 20) if "h1" in i["where"] else i["text"] + "!",
                }
                for i in items
            ]
        text = json.dumps({"replacements": out})
        return LLMResult(text, "fake", "fake", 0, 0, None, "end_turn", False, True)

    monkeypatch.setattr(anthropic, "generate", fake)
    brand_id, product_id, _, _ = brand_and_product
    report, html = _run_build(user, fast_settings, library_template, brand_id, product_id)
    assert any(p.startswith("These replacements are too long") for p in prompts)
    assert "Way too long" not in html and "Short." in html
    assert report["copy"]["warnings"] == []
    assert copy_rules.CHUNK_SIZE == 40


EXPORT_KINDS = {
    "test_export": JobKind("test_export", "HTML export", export_kind.run, export_kind.ExportPayload)
}


@needs_db
def test_export_writes_one_self_contained_file(
    user: DbUser,
    fast_settings: Settings,
    library_template: uuid.UUID,
    brand_and_product: tuple[uuid.UUID, uuid.UUID, str, str],
) -> None:
    brand_id, product_id, _, photo_url = brand_and_product
    build_id, job_id = new_build(user, library_template, brand_id, product_id)
    run_once(fast_settings)
    assert job_row(job_id)["status"] == "succeeded"
    export_job, _ = queue.enqueue(
        org_id=user.org_id, kind="test_export", payload={"build_id": str(build_id)},
        created_by=user.id, build_id=build_id,
    )  # fmt: skip
    runner = Runner(fast_settings, kinds=EXPORT_KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, ["test_export"])
    assert claimed is not None
    runner.execute(claimed)
    job = job_row(export_job.id)
    assert job["status"] == "succeeded", job["error"]
    build = build_row(build_id)
    assert build["export_html_path"].endswith("/export/index.html")
    exported = storage.download("builds", build["export_html_path"]).decode()
    import re

    leftovers = [
        exported[max(0, m.start() - 60) : m.end() + 30] for m in re.finditer("data-lp-", exported)
    ]
    assert leftovers == []
    srcs = [img["src"] for img in parse(exported).find_all("img")]
    assert photo_url not in srcs  # inlined (share-image tags keep the URL on purpose)
    assert exported.count("data:image/png;base64,") >= 2  # logo and product photo
    assert job["result"]["inlined"] >= 3 and job["result"]["failed"] == []
    storage.remove("builds", [build["working_html_path"], build["export_html_path"]])
