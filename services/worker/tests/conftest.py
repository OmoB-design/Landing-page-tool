"""Shared fixtures. Database tests run against the local Supabase Postgres and are skipped when
it is not running. Each test works in its own throwaway org and user, deleted afterwards."""

import os

# Tests never call live providers (D15), whatever services/worker/.env says: environment
# variables outrank the .env file in pydantic-settings, and this runs before app.config loads.
os.environ["LP_MOCK_LLM"] = "1"
os.environ["LP_MOCK_IMAGES"] = "1"

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import psycopg
import pytest

from app.config import Settings, get_settings
from app.db import transaction


def _database_up() -> bool:
    try:
        with psycopg.connect(get_settings().database_url, connect_timeout=2):
            return True
    except psycopg.OperationalError:
        return False


DB_UP = _database_up()
needs_db = pytest.mark.skipif(not DB_UP, reason="local Supabase Postgres is not running")


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
