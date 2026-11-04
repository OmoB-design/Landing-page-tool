"""A Top 5 ranking build end to end (BUILD_SPEC §8.7, B2.4a) against the database, with the
network replaced by a fixture competitor page and mock AI. Jobs use a test-only kind name, so a
running dev worker ignores them."""

import io
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from PIL import Image
from psycopg.types.json import Jsonb

from app import competitors as pulling
from app.cli.seed_library import seed
from app.config import Settings
from app.db import transaction
from app.engines.html import parse
from app.fetch import ladder
from app.jobs import queue
from app.jobs.errors import UserFacingError
from app.jobs.kinds import build as build_kind
from app.jobs.kinds import product_pull
from app.jobs.registry import JobKind
from app.jobs.runner import Runner
from app.pipeline.graph import order_for
from app.providers import storage
from tests.conftest import DbUser, job_row, needs_db

pytestmark = needs_db
STARTER = Path(__file__).resolve().parents[3] / "templates" / "library" / "top5-ranking"
PAGE = (Path(__file__).parent / "fixtures" / "competitor_page.html").read_text()
KIND = "test_ranking_build"
KINDS = {KIND: JobKind(KIND, "Page build", build_kind.run, build_kind.BuildPayload, max_attempts=1)}
# Ranks #2 to #5 in this order; the third page can't be read.
URLS = [
    "https://vitality.test/products/daily-greens",
    "https://greenly.test/products/super-mix",
    "https://blocked.test/products/x",
    "https://nutri.test/products/powder",
]


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (40, 40), (200, 120, 60)).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def ranking_template() -> uuid.UUID:
    seed(STARTER, thumbnails=False)
    with transaction() as conn:
        row = conn.execute(
            "select id from templates where org_id is null and slug = 'top5-ranking'"
        ).fetchone()
    assert row is not None
    return uuid.UUID(str(row["id"]))


@pytest.fixture
def product(user: DbUser) -> Iterator[tuple[uuid.UUID, uuid.UUID]]:
    photo = storage.store_asset(user.org_id, _png(), "image/png")
    with transaction() as conn:
        brand = conn.execute(
            """
            insert into brands (org_id, name, prefix, url) values (%(o)s, 'Lume Test', 'LMT',
            'https://lume.test') returning id
            """,
            {"o": user.org_id},
        ).fetchone()
        assert brand is not None
        row = conn.execute(
            """
            insert into products (org_id, brand_id, handle, name, currency, price, usps, images)
            values (%(o)s, %(b)s, 'greens', 'Lume Greens', 'USD', 45, '["Twelve greens"]',
                    %(images)s)
            returning id
            """,
            {
                "o": user.org_id,
                "b": brand["id"],
                "images": Jsonb([{"asset_id": str(photo.id), "source_url": "https://x.test/p.png"}]),
            },
        ).fetchone()  # fmt: skip
    assert row is not None
    yield brand["id"], row["id"]
    storage.remove("assets", [photo.path])


@pytest.fixture
def offline(monkeypatch: pytest.MonkeyPatch) -> None:
    """Each competitor page is the fixture under its own site's name; blocked.test refuses."""

    def fetch_page(url: str, **_: object) -> ladder.FetchedPage:
        if "blocked.test" in url:
            raise ladder.FetchError("The site blocked the request.")
        name = url.split("//")[1].split(".")[0].capitalize()
        html = PAGE.replace("Vitality", name).replace("vitality", name.lower())
        return ladder.FetchedPage(url, 200, html, "http")

    def no_bytes(url: str, **_: object) -> tuple[bytes, str]:
        raise UserFacingError("offline in tests")

    monkeypatch.setattr(ladder, "fetch_page", fetch_page)
    monkeypatch.setattr(ladder, "fetch_bytes", no_bytes)
    monkeypatch.setattr(product_pull, "_from_store", lambda url, handle: None)
    monkeypatch.setattr(pulling, "check_public_url", lambda url: url)


def _build(user: DbUser, template_id: uuid.UUID, brand_id: uuid.UUID, product_id: uuid.UUID,
           ) -> tuple[uuid.UUID, uuid.UUID]:  # fmt: skip
    wizard = {"ai_images": True, "competitors": {"urls": URLS, "naming": "neutral"}}
    with transaction() as conn:
        key = conn.execute("select allocate_build_key(%(b)s) as key", {"b": brand_id}).fetchone()
        assert key is not None
        build = conn.execute(
            """
            insert into builds (org_id, brand_id, product_id, template_id, template_version, key,
                                origin, title, wizard, mock_images, created_by)
            values (%(o)s, %(b)s, %(p)s, %(t)s, 1, %(key)s, 'owned', 'Ranking test', %(w)s,
                    true, %(u)s)
            returning id
            """,
            {
                "o": user.org_id, "b": brand_id, "p": product_id, "t": template_id,
                "key": key["key"], "w": Jsonb(wizard), "u": user.id,
            },
        ).fetchone()  # fmt: skip
    assert build is not None
    job, _ = queue.enqueue(
        org_id=user.org_id, kind=KIND, payload={"build_id": str(build["id"])},
        created_by=user.id, build_id=build["id"], max_attempts=1,
    )  # fmt: skip
    return build["id"], job.id


def test_a_ranking_build_reads_its_competitors_and_ranks_the_product_first(
    user: DbUser, fast_settings: Settings, ranking_template: uuid.UUID,
    product: tuple[uuid.UUID, uuid.UUID], offline: None,
) -> None:  # fmt: skip
    build_id, job_id = _build(user, ranking_template, *product)
    runner = Runner(fast_settings, kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, [KIND])
    assert claimed is not None
    runner.execute(claimed)

    job = job_row(job_id)
    assert job["status"] == "succeeded", job["error"]
    with transaction() as conn:
        events = conn.execute(
            "select node, data from job_events where job_id = %(j)s and node is not null "
            "order by id",
            {"j": job_id},
        ).fetchall()
        rows = conn.execute(
            "select * from build_competitors where build_id = %(b)s order by rank",
            {"b": build_id},
        ).fetchall()
        build = conn.execute("select * from builds where id = %(b)s", {"b": build_id}).fetchone()
    order = order_for("owned", "top5_ranking")
    assert [e["node"] for e in events] == order
    assert events[1]["data"]["step"] == 2  # the competitor step counts as step 2 of the build

    # Stored per build, in the order given, closing up over the page that couldn't be read.
    assert [(r["rank"], r["status"], r["label"]) for r in rows] == [
        (2, "pulled", "Brand B"), (3, "pulled", "Brand C"), (4, "pulled", "Brand D"),
        (5, "failed", "Brand E"),
    ]  # fmt: skip
    assert rows[0]["url"] == URLS[0] and rows[3]["url"] == URLS[2]
    assert rows[3]["error"] == "The site blocked the request."
    assert rows[0]["name"] == "Vitality Daily Greens" and str(rows[0]["price"]) == "59.00"
    assert str(rows[0]["rating"]) == "4.40" and rows[0]["rating_count"] == 1203
    assert rows[0]["image_asset_id"] is None  # neutral names: no competitor photo
    assert all(r["org_id"] == user.org_id for r in rows)
    # Neutral naming: the competitor's own names are gone from what was kept.
    bodies = [review["body"] for review in rows[0]["reviews"]]
    assert bodies[0] == "I switched to Brand B in March and my mornings feel easier."
    assert "Brand B ships fast" in bodies[1]
    assert all(review["author"] is None for review in rows[0]["reviews"])
    assert rows[0]["summary"] == "(mock) Brand B."

    assert build is not None
    report = build["report"]
    assert [c["status"] for c in report["competitors"]] == ["pulled"] * 3 + ["failed"]
    assert any("blocked.test" in w for w in report["warnings"])
    html = storage.download("builds", build["working_html_path"]).decode()
    soup = parse(html)
    for name in ("Vitality", "Greenly", "Nutri"):
        assert name.lower() not in html.lower()
    assert soup.select_one('[data-lp-section="rank-5"]') is None  # three competitors read
    assert [n.get_text() for n in soup.select("[data-lp-rank-name]")] == [
        "Brand B", "Brand C", "Brand D", "Brand B", "Brand C", "Brand D",
    ]  # fmt: skip
    two = soup.select_one('[data-lp-rank="2"]')
    assert two is not None and "[mock]" not in two.get_text()  # locked from the copy pass
    assert two.select_one("[data-lp-rank-price]").get_text() == "$59.00"  # type: ignore[union-attr]
    assert [n.get_text() for n in soup.select("[data-lp-number]")] == ["1", "2", "3", "4"]
    assert soup.select_one("[data-lp-product-name]").get_text() == "Lume Greens"  # type: ignore[union-attr]
    assert "Advertisement" in soup.select_one(".ad-label").get_text()  # type: ignore[union-attr]

    # B2.4b: "Our take" and the table cite the facts they rest on, and trace cleanly (D103).
    assert events[2]["node"] == "compare_products"
    takes = two.select("[data-lp-rank-take-text]")
    assert len(takes) == 2 and all(t.has_attr("data-lp-sources") for t in takes)
    assert takes[0].get_text().startswith("(mock) ")
    assert [th.get_text() for th in soup.select("th[data-lp-compare-axis]")] == ["From the page"]
    assert len(soup.select("td[data-lp-compare-cell]")) == 4  # #1 and the three read
    disclosure = soup.select_one('[data-lp-disclosure="short"]')
    assert disclosure is not None and disclosure.get_text().startswith("Lume Test makes our #1")
    assert "Lume Test" in soup.select_one('[data-lp-disclosure="full"]').get_text()  # type: ignore[union-attr]
    assert sorted(report["comparison"]["facts"]) == ["1", "2", "3", "4"]
    assert [t["rank"] for t in report["comparison"]["takes"]] == [2, 3, 4]
    assert report["compliance"]["high_risk_count"] == 0, report["compliance"]["findings"]
    storage.remove("builds", [build["working_html_path"]])
