"""A build from a cloned page end to end (BUILD_SPEC §16, B2.3), against the database and storage
with the model mocked and mock images: cloned (B2.1), analysed and confirmed (B2.2), then built
through every clone-only node. The page comes out under the brand with no source residue."""

import io
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from PIL import Image
from psycopg.types.json import Jsonb

from app import templates
from app.config import Settings
from app.db import transaction
from app.engines import clone
from app.engines.html import parse
from app.jobs import queue
from app.jobs.kinds import build as build_kind
from app.jobs.kinds import template_analyze
from app.jobs.registry import JobKind
from app.jobs.runner import Runner
from app.pipeline.graph import CLONE_ONLY, ORDER
from app.providers import storage
from app.publish import gate
from tests.conftest import DbUser, job_row, needs_db

FLAT = (Path(__file__).parent / "fixtures" / "clone" / "funnelish_flat.html").read_text()
KINDS = {
    "test_clone_build": JobKind(
        "test_clone_build", "Page build", build_kind.run, build_kind.BuildPayload, max_attempts=3
    ),
    "template_analyze": JobKind(
        "template_analyze", "Page analysis", template_analyze.run,
        template_analyze.TemplateAnalyzePayload, max_attempts=1,
    ),
}  # fmt: skip


def _png(color: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (60, 60), color).save(buffer, format="PNG")
    return buffer.getvalue()


def _run(settings: Settings, kind: str) -> None:
    runner = Runner(settings, kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, [kind])
    assert claimed is not None
    runner.execute(claimed)


@pytest.fixture
def confirmed_clone(user: DbUser, fast_settings: Settings) -> Iterator[uuid.UUID]:
    """The Funnelish fixture cloned from try.vitalis.test, analysed (mock) and confirmed."""
    template_id = uuid.uuid4()
    base = f"{user.org_id}/{template_id}"
    html = clone.clone_page(FLAT, "https://try.vitalis.test/cardio").html
    storage.upload("templates", f"{base}/v1.html", html.encode(), "text/html", upsert=True)
    with transaction() as conn:
        conn.execute(
            """
            insert into templates (id, org_id, origin, slug, name, type, html_path, source_url,
                                   source_host, source_name, platform, version, created_by)
            values (%(id)s, %(o)s, 'cloned', %(slug)s, 'Cardio report', 'advertorial',
                    %(path)s, 'https://try.vitalis.test/cardio', 'try.vitalis.test', 'Vitalis',
                    'funnelish', 1, %(u)s)
            """,
            {"id": template_id, "o": user.org_id, "slug": f"cardio-{template_id.hex[:6]}",
             "path": f"{base}/v1.html", "u": user.id},
        )  # fmt: skip
        conn.execute(
            "insert into template_versions (template_id, version, html_path, sections, reason) "
            "values (%(t)s, 1, %(p)s, '[]', 'Cloned from try.vitalis.test')",
            {"t": template_id, "p": f"{base}/v1.html"},
        )
    queue.enqueue(
        org_id=user.org_id, kind="template_analyze", payload={"template_id": str(template_id)},
        created_by=user.id, max_attempts=1,
    )  # fmt: skip
    _run(fast_settings, "template_analyze")
    templates.confirm_review(user.org_id, template_id, user.id, 2)
    yield template_id
    storage.remove_folder("templates", base)


@pytest.fixture
def brand_and_product(user: DbUser) -> Iterator[tuple[uuid.UUID, uuid.UUID, str]]:
    logo = storage.store_asset(user.org_id, _png((11, 61, 46)), "image/png")
    photo = storage.store_asset(user.org_id, _png((209, 224, 48)), "image/png")
    with transaction() as conn:
        brand = conn.execute(
            """
            insert into brands (org_id, name, prefix, url, palette, logo_asset_id, language)
            values (%(o)s, 'Graza Test', 'GRT', 'https://www.graza.test',
                    '{"primary": "#d1e030", "accent": "#0b3d2e"}', %(logo)s, 'en-US')
            returning id
            """,
            {"o": user.org_id, "logo": logo.id},
        ).fetchone()
        assert brand is not None
        product = conn.execute(
            """
            insert into products (org_id, brand_id, handle, name, url, currency, price, images)
            values (%(o)s, %(b)s, 'drizzle', 'Drizzle', 'https://www.graza.test/products/drizzle',
                    'USD', 21, %(images)s)
            returning id
            """,
            {"o": user.org_id, "b": brand["id"],
             "images": Jsonb([{"asset_id": str(photo.id), "source_url": "https://x.test/p.png"}])},
        ).fetchone()  # fmt: skip
    assert product is not None
    yield brand["id"], product["id"], logo.url
    storage.remove("assets", [logo.path, photo.path])


def _build(
    user: DbUser, settings: Settings, template_id: uuid.UUID, brand_id: uuid.UUID,
    product_id: uuid.UUID,
) -> tuple[dict[str, Any], uuid.UUID]:  # fmt: skip
    with transaction() as conn:
        version = conn.execute(
            "select version from templates where id = %(t)s", {"t": template_id}
        ).fetchone()
        key = conn.execute("select allocate_build_key(%(b)s) as key", {"b": brand_id}).fetchone()
        assert version is not None and key is not None
        build = conn.execute(
            """
            insert into builds (org_id, brand_id, product_id, template_id, template_version, key,
                                origin, title, wizard, mock_images, created_by)
            values (%(o)s, %(b)s, %(p)s, %(t)s, %(v)s, %(key)s, 'cloned', 'Clone build',
                    '{"ai_images": true}', true, %(u)s)
            returning id
            """,
            {"o": user.org_id, "b": brand_id, "p": product_id, "t": template_id,
             "v": version["version"], "key": key["key"], "u": user.id},
        ).fetchone()  # fmt: skip
    assert build is not None
    job, _ = queue.enqueue(
        org_id=user.org_id, kind="test_clone_build", payload={"build_id": str(build["id"])},
        created_by=user.id, build_id=build["id"], max_attempts=3,
    )  # fmt: skip
    _run(settings, "test_clone_build")
    return dict(job_row(job.id)), build["id"]


@needs_db
def test_a_clone_builds_under_the_brand_with_no_source_left(
    user: DbUser, fast_settings: Settings, confirmed_clone: uuid.UUID,
    brand_and_product: tuple[uuid.UUID, uuid.UUID, str],
) -> None:  # fmt: skip
    brand_id, product_id, logo_url = brand_and_product
    job, build_id = _build(user, fast_settings, confirmed_clone, brand_id, product_id)
    assert job["status"] == "succeeded", job["error"]
    with transaction() as conn:
        build = conn.execute("select * from builds where id = %(b)s", {"b": build_id}).fetchone()
        events = conn.execute(
            "select node from job_events where job_id = %(j)s and node is not null order by id",
            {"j": job["id"]},
        ).fetchall()
    assert build is not None
    assert [e["node"] for e in events] == ORDER["cloned"]  # every clone-only node ran, in order
    assert set(CLONE_ONLY) <= set(ORDER["cloned"])
    report = build["report"]
    assert report["mode"] == "cloned" and report["source"]["host"] == "try.vitalis.test"
    assert report["copy"]["strict"] is True
    residue = report["residue"]
    assert residue["score"] == 100 and residue["clean"] is True, residue["findings"]
    assert set(report["blueprint"]) >= {"chrome", "brand", "scripts", "links", "assets"}

    html = storage.download("builds", build["working_html_path"]).decode()
    soup = parse(html)
    assert "Vitalis" not in soup.get_text() and "vitalis.test" not in html
    assert "funnelish.test" not in html  # the source's image CDN
    assert "Graza Test" in soup.get_text()
    assert all(img["src"] == logo_url for img in soup.select("img[data-lp-logo]"))
    # Placeholder images still block; the residue doesn't.
    found = gate.blockers(report, mock_images=True, origin="cloned", allow_placeholders=False)
    assert [b.code for b in found] == ["placeholder_images"]
    storage.remove("builds", [build["working_html_path"]])
