"""product_pull and product_briefing end to end against the local database, with the network
replaced by made-up store data. Jobs use test-only kind names so a running dev worker ignores
them (it only claims kinds it knows). AI calls are mocked (conftest)."""

import io
import json
import uuid
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from app.config import Settings
from app.db import transaction
from app.fetch import ladder
from app.jobs import queue
from app.jobs.kinds import product_briefing, product_pull
from app.jobs.registry import JobKind
from app.jobs.runner import Runner
from app.providers import storage
from tests.conftest import DbUser, job_row, needs_db

pytestmark = needs_db
FIXTURES = Path(__file__).parent / "fixtures"
PAGE = (FIXTURES / "product_page.html").read_text()
PRODUCT_JSON = (FIXTURES / "shopify_product.json").read_bytes()
PRODUCT_JS = (FIXTURES / "shopify_product.js.json").read_bytes()

KINDS = {
    "test_product_pull": JobKind(
        "test_product_pull", "Product pull", product_pull.run, product_pull.ProductPullPayload
    ),
    "test_product_briefing": JobKind(
        "test_product_briefing", "Product briefing", product_briefing.run,
        product_briefing.ProductBriefingPayload,
    ),
}  # fmt: skip


def run_job(user: DbUser, settings: Settings, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    job, _ = queue.enqueue(org_id=user.org_id, kind=kind, payload=payload, created_by=user.id)
    runner = Runner(settings, kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 2, [kind])
    assert claimed is not None and claimed.id == job.id
    runner.execute(claimed)
    return job_row(job.id)


def _png(color: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (40, 30), color).save(buffer, format="PNG")
    return buffer.getvalue()


def new_brand(org_id: uuid.UUID, prefix: str = "LUM") -> uuid.UUID:
    with transaction() as conn:
        row = conn.execute(
            "insert into brands (org_id, name, prefix) values (%(o)s, 'Lumé Skin', %(p)s) "
            "returning id",
            {"o": org_id, "p": prefix},
        ).fetchone()
    assert row is not None
    return uuid.UUID(str(row["id"]))


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """A made-up Shopify store: product JSON and selling plans, two images, the product page.
    Returns the list of URLs requested."""
    requested: list[str] = []
    files = {
        "https://www.lumeskin.test/products/glow-serum.json": (PRODUCT_JSON, "application/json"),
        "https://www.lumeskin.test/products/glow-serum.js": (PRODUCT_JS, "application/json"),
        "https://cdn.shopify.com/s/files/1/0001/files/glow-front.png?v=1&width=2048": (
            _png((228, 87, 46)), "image/png",
        ),
        "https://cdn.shopify.com/s/files/1/0001/files/glow-30ml.png?v=1&width=2048": (
            _png((30, 60, 90)), "image/png",
        ),
    }  # fmt: skip

    def fetch_bytes(url: str, **_: Any) -> tuple[bytes, str]:
        requested.append(url)
        if url not in files:
            raise ladder.FetchError(f"Couldn't download {url} (status 404).")
        return files[url]

    def fetch_page(url: str, **_: Any) -> ladder.FetchedPage:
        requested.append(url)
        return ladder.FetchedPage(url, 200, PAGE, "http")

    monkeypatch.setattr(ladder, "fetch_bytes", fetch_bytes)
    monkeypatch.setattr(ladder, "fetch_page", fetch_page)
    # .test hosts don't resolve, so the SSRF guard would refuse them (it has its own tests).
    monkeypatch.setattr(product_pull, "check_public_url", lambda url: url)
    return requested


def product_row(product_id: str) -> dict[str, Any]:
    with transaction() as conn:
        row = conn.execute("select * from products where id = %(id)s", {"id": product_id})
        found = row.fetchone()
    assert found is not None
    return dict(found)


def cleanup_images(product: dict[str, Any]) -> None:
    ids = [image["asset_id"] for image in product["images"] if image.get("asset_id")]
    with transaction() as conn:
        paths = [
            r["path"]
            for r in conn.execute(
                "select path from assets where id = any(%(ids)s::uuid[])", {"ids": ids}
            ).fetchall()
        ]
    if paths:
        storage.remove("assets", paths)


def test_pull_saves_a_shopify_product(
    user: DbUser, fast_settings: Settings, store: list[str]
) -> None:
    brand_id = new_brand(user.org_id)
    url = "www.lumeskin.test/products/glow-serum?variant=1001"
    row = run_job(user, fast_settings, "test_product_pull", {"brand_id": str(brand_id), "url": url})
    assert row["status"] == "succeeded", row["error"]
    result = row["result"]
    assert result["created"] is True and result["pull_source"] == "shopify_json"
    assert result["ai"] == "mock" and result["name"] == "Lumé Glow Serum"
    # No catalogue lookup was needed, and the page was read for its text.
    assert "https://www.lumeskin.test/products.json?limit=250" not in store

    product = product_row(result["product_id"])
    assert product["org_id"] == user.org_id and product["brand_id"] == brand_id
    assert product["handle"] == "glow-serum" and product["currency"] == "GBP"
    assert str(product["price"]) == "32.00" and str(product["sale_price"]) == "24.00"
    assert product["pull_source"] == "shopify_json" and product["pulled_at"] is not None
    assert product["usps"] == ["(mock) Written by the AI pass when mock mode is off."]
    assert [p["label"] for p in product["pricing_lines"]] == ["Subscribe & save 10% · Every month"]
    assert len(product["images"]) == 2 and all(i["asset_id"] for i in product["images"])
    first = product["variants"][0]
    assert first["image_asset_id"] == product["images"][1]["asset_id"]

    with transaction() as conn:
        ledger = conn.execute(
            "select node, model from ledger_entries where job_id = %(j)s", {"j": row["id"]}
        ).fetchall()
    assert [r["node"] for r in ledger] == ["product_enrich"]
    assert ledger[0]["model"].startswith("mock/")

    # Pulling again updates the same product (no duplicate), even after it was removed.
    with transaction() as conn:
        conn.execute(
            "update products set deleted_at = now() where id = %(id)s", {"id": product["id"]}
        )
    again = run_job(
        user, fast_settings, "test_product_pull", {"brand_id": str(brand_id), "url": url}
    )
    assert again["status"] == "succeeded", again["error"]
    assert again["result"]["created"] is False
    assert again["result"]["product_id"] == result["product_id"]
    assert product_row(result["product_id"])["deleted_at"] is None
    cleanup_images(product)


def test_pull_falls_back_to_the_page(
    user: DbUser, fast_settings: Settings, store: list[str]
) -> None:
    brand_id = new_brand(user.org_id)
    url = "https://www.lumeskin.test/products/night-cream"  # no store JSON for it
    row = run_job(user, fast_settings, "test_product_pull", {"brand_id": str(brand_id), "url": url})
    assert row["status"] == "succeeded", row["error"]
    assert "https://www.lumeskin.test/products.json?limit=250" in store  # catalogue tried
    product = product_row(row["result"]["product_id"])
    assert product["pull_source"] == "jsonld" and product["name"] == "Glow Serum"
    assert product["handle"] == "night-cream"  # from the URL the user gave
    assert str(product["price"]) == "24.00" and product["currency"] == "GBP"
    # The page's images aren't on the fake network: the product is saved without them.
    assert all(i["asset_id"] is None for i in product["images"])
    assert any("couldn't be downloaded" in w for w in row["result"]["warnings"])


def test_pull_explains_a_page_without_a_product(
    user: DbUser, fast_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    brand_id = new_brand(user.org_id)
    empty = "<html><body><p>Hi</p></body></html>"
    monkeypatch.setattr(
        ladder, "fetch_page", lambda url, **_: ladder.FetchedPage(url, 200, empty, "http")
    )
    monkeypatch.setattr(product_pull, "check_public_url", lambda url: url)
    row = run_job(
        user, fast_settings, "test_product_pull",
        {"brand_id": str(brand_id), "url": "https://www.lumeskin.test/about"},
    )  # fmt: skip
    assert row["status"] == "failed" and row["error"]["code"] == "no_product"


def test_pull_only_uses_brands_in_the_jobs_org(
    user: DbUser, other_org: uuid.UUID, fast_settings: Settings
) -> None:
    foreign = new_brand(other_org, "THR")
    row = run_job(
        user, fast_settings, "test_product_pull",
        {"brand_id": str(foreign), "url": "https://www.lumeskin.test/products/glow-serum"},
    )  # fmt: skip
    assert row["status"] == "failed" and row["error"]["code"] == "brand_missing"


def test_pull_refuses_private_addresses(user: DbUser, fast_settings: Settings) -> None:
    brand_id = new_brand(user.org_id)
    row = run_job(
        user, fast_settings, "test_product_pull",
        {"brand_id": str(brand_id), "url": "http://127.0.0.1:54321/products/x"},
    )  # fmt: skip
    assert row["status"] == "failed" and row["error"]["code"] == "unsafe_url"


def new_product(org_id: uuid.UUID, brand_id: uuid.UUID) -> uuid.UUID:
    with transaction() as conn:
        row = conn.execute(
            """
            insert into products (org_id, brand_id, handle, name, price, currency, usps)
            values (%(o)s, %(b)s, 'glow-serum', 'Glow Serum', 24, 'GBP',
                    '["Brighter-looking skin"]'::jsonb)
            returning id
            """,
            {"o": org_id, "b": brand_id},
        ).fetchone()
    assert row is not None
    return uuid.UUID(str(row["id"]))


def test_briefing_is_cached_and_refreshed(user: DbUser, fast_settings: Settings) -> None:
    product_id = new_product(user.org_id, new_brand(user.org_id))
    payload = {"product_id": str(product_id)}
    first = run_job(user, fast_settings, "test_product_briefing", payload)
    assert first["status"] == "succeeded", first["error"]
    briefing = first["result"]["briefing"]
    assert len(briefing["audiences"]) == 4 and briefing["objections"]

    second = run_job(user, fast_settings, "test_product_briefing", payload)
    assert second["status"] == "succeeded", second["error"]
    with transaction() as conn:
        rows = conn.execute(
            "select org_id, kind, data, model from product_strategy where product_id = %(p)s",
            {"p": product_id},
        ).fetchall()
    assert len(rows) == 1 and rows[0]["kind"] == "briefing" and rows[0]["org_id"] == user.org_id
    assert rows[0]["data"] == json.loads(json.dumps(briefing))
    assert rows[0]["model"].startswith("mock/")


def test_briefing_only_reads_products_in_the_jobs_org(
    user: DbUser, other_org: uuid.UUID, fast_settings: Settings
) -> None:
    foreign = new_product(other_org, new_brand(other_org, "THR"))
    row = run_job(user, fast_settings, "test_product_briefing", {"product_id": str(foreign)})
    assert row["status"] == "failed" and row["error"]["code"] == "product_missing"
