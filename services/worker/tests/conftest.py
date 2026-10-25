"""Shared fixtures. Database tests run against the database in DATABASE_URL (the cloud dev project,
D73) and are skipped when it cannot be reached. Each test works in its own throwaway org and user,
deleted afterwards."""

import os
import uuid

# Tests never call live providers (D15), whatever services/worker/.env says: environment
# variables outrank the .env file in pydantic-settings, and this runs before app.config loads.
os.environ["LP_MOCK_LLM"] = "1"
os.environ["LP_MOCK_IMAGES"] = "1"
# Their jobs go into a queue of their own (D85): the live worker, which shares this database,
# never claims them, and a test never claims a real job.
os.environ["LP_JOB_QUEUE"] = f"test-{uuid.uuid4().hex[:8]}"

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.db import transaction
from app.main import app
from app.providers import storage


def _database_up() -> bool:
    try:
        with psycopg.connect(get_settings().database_url, connect_timeout=5):
            return True
    except psycopg.OperationalError:
        return False


DB_UP = _database_up()
needs_db = pytest.mark.skipif(not DB_UP, reason="database in DATABASE_URL is not reachable")


@dataclass
class DbUser:
    id: uuid.UUID
    email: str
    org_id: uuid.UUID  # the personal org created by the sign-up trigger


@pytest.fixture
def user() -> Iterator[DbUser]:
    user_id = uuid.uuid4()
    email = f"worker-test-{user_id.hex[:10]}@example.test"
    with transaction() as conn:
        conn.execute(
            """
            insert into auth.users (id, email, aud, role, raw_user_meta_data)
            values (%(id)s, %(email)s, 'authenticated', 'authenticated',
                    '{"full_name": "Worker Test"}')
            """,
            {"id": user_id, "email": email},
        )
        row = conn.execute(
            "select org_id from org_members where user_id = %(id)s", {"id": user_id}
        ).fetchone()
    assert row is not None, "sign-up trigger did not create an org"
    yield DbUser(id=user_id, email=email, org_id=row["org_id"])
    with transaction() as conn:
        conn.execute("delete from orgs where id = %(id)s", {"id": row["org_id"]})
        conn.execute("delete from auth.users where id = %(id)s", {"id": user_id})


@pytest.fixture
def other_org() -> Iterator[uuid.UUID]:
    """An org the test user is not a member of."""
    with transaction() as conn:
        row = conn.execute(
            "insert into orgs (name, slug) values ('Other', %(slug)s) returning id",
            {"slug": f"other-{uuid.uuid4().hex[:10]}"},
        ).fetchone()
    assert row is not None
    yield row["id"]
    with transaction() as conn:
        conn.execute("delete from orgs where id = %(id)s", {"id": row["id"]})


@pytest.fixture
def fast_settings() -> Settings:
    return Settings(
        lp_worker_concurrency=2,
        lp_org_concurrency=2,
        lp_heartbeat_seconds=0.2,
        lp_stale_after_seconds=1,
        lp_poll_seconds=0.05,
    )


def job_row(job_id: uuid.UUID) -> dict[str, Any]:
    with transaction() as conn:
        row = conn.execute("select * from jobs where id = %(id)s", {"id": job_id}).fetchone()
    assert row is not None
    return dict(row)


def event_messages(job_id: uuid.UUID) -> list[str]:
    with transaction() as conn:
        rows = conn.execute(
            "select message from job_events where job_id = %(id)s order by id", {"id": job_id}
        ).fetchall()
    return [row["message"] for row in rows]


def notifications_for(user_id: uuid.UUID) -> list[dict[str, Any]]:
    with transaction() as conn:
        rows = conn.execute(
            "select * from notifications where user_id = %(id)s order by created_at",
            {"id": user_id},
        ).fetchall()
    return [dict(row) for row in rows]


# ── the review desk ───────────────────────────────────────────────────────────

DESK_PAGE = (
    "<html><head><title>Serum</title></head><body>"
    '<section data-lp-section="hero"><h1>Glow in 7 days</h1>'
    "<p>Clinically proven to calm redness.</p>"
    "<p>Only <span data-lp-price>$29</span> today</p></section>"
    '<section data-lp-section="faq"><p>Is it gentle?</p><p>Yes, for every skin.</p>'
    "<textarea>Leave a note</textarea></section>"
    "</body></html>"
)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def finished(user: DbUser) -> Iterator[dict[str, Any]]:
    """A finished build (Needs review) with DESK_PAGE as its page, made without the pipeline."""
    with transaction() as conn:
        template = conn.execute(
            "select id, version from templates where org_id is null order by slug limit 1"
        ).fetchone()
        brand = conn.execute(
            "insert into brands (org_id, name, prefix) values (%(o)s, 'Lume', 'LUM') returning id",
            {"o": user.org_id},
        ).fetchone()
        assert template is not None and brand is not None
        product = conn.execute(
            """
            insert into products (org_id, brand_id, handle, name)
            values (%(o)s, %(b)s, 'serum', 'Serum') returning id
            """,
            {"o": user.org_id, "b": brand["id"]},
        ).fetchone()
        assert product is not None
        build_id = uuid.uuid4()
        path = f"{user.org_id}/{build_id}/working.html"
        storage.upload("builds", path, DESK_PAGE.encode(), "text/html", upsert=True)
        conn.execute(
            """
            insert into builds (id, org_id, brand_id, product_id, template_id, template_version,
                                key, origin, status, title, wizard, working_html_path,
                                export_html_path, report, created_by)
            values (%(id)s, %(o)s, %(b)s, %(p)s, %(t)s, %(v)s, 'LUM-1', 'owned', 'needs_review',
                    'Test page', '{}', %(path)s, 'old/export.html', '{}', %(u)s)
            """,
            {
                "id": build_id, "o": user.org_id, "b": brand["id"], "p": product["id"],
                "t": template["id"], "v": template["version"], "path": path, "u": user.id,
            },
        )  # fmt: skip
    yield {"id": str(build_id), "org_id": str(user.org_id)}
    storage.remove(
        "builds",
        [path] + [f"{user.org_id}/{build_id}/pages/v{n}.html" for n in range(2, 30)],
    )
