"""POST /jobs: token verification (D43), org membership, kind and payload validation."""

import time
import uuid
from collections.abc import Iterator
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import auth
from app.config import get_settings
from app.db import transaction
from app.main import app
from tests.conftest import DbUser, needs_db

SIGNING_KEY = ec.generate_private_key(ec.SECP256R1())
WRONG_KEY = ec.generate_private_key(ec.SECP256R1())


class FakeJwksClient:
    """Stands in for PyJWKClient: always returns the test public key."""

    class _Key:
        key = SIGNING_KEY.public_key()

    def get_signing_key_from_jwt(self, token: str) -> Any:
        return self._Key()


@pytest.fixture(autouse=True)
def fake_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "get_jwks_client", lambda: FakeJwksClient())


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def token(
    sub: uuid.UUID, *, key: Any = SIGNING_KEY, expires_in: int = 300, **overrides: Any
) -> str:
    claims = {
        "sub": str(sub),
        "aud": "authenticated",
        "iss": get_settings().jwt_issuer,
        "exp": int(time.time()) + expires_in,
        "email": "ada@example.test",
        "role": "authenticated",
        **overrides,
    }
    return jwt.encode(claims, key, algorithm="ES256")


def post_job(client: TestClient, bearer: str | None, body: dict[str, Any]) -> Any:
    headers = {"Authorization": f"Bearer {bearer}"} if bearer else {}
    return client.post("/jobs", json=body, headers=headers)


def bearer(user: DbUser) -> dict[str, str]:
    return {"Authorization": f"Bearer {token(user.id)}"}


def cancel_jobs(org_id: uuid.UUID) -> None:
    """Keep a running dev worker from picking up the jobs these tests create."""
    with transaction() as conn:
        conn.execute(
            "update jobs set status = 'cancelled' where org_id = %(org)s and status = 'queued'",
            {"org": org_id},
        )


# ── token checks (no database needed) ─────────────────────────────────────────
def test_requires_a_token(client: TestClient) -> None:
    response = post_job(client, None, {"org_id": str(uuid.uuid4()), "kind": "noop_demo"})
    assert response.status_code == 401


@pytest.mark.parametrize(
    "bad_token",
    [
        token(uuid.uuid4(), key=WRONG_KEY),
        token(uuid.uuid4(), expires_in=-60),
        token(uuid.uuid4(), aud="anon"),
        token(uuid.uuid4(), iss="https://evil.example/auth/v1"),
        "not-a-jwt",
    ],
    ids=["wrong-key", "expired", "wrong-audience", "wrong-issuer", "garbage"],
)
def test_rejects_invalid_tokens(client: TestClient, bad_token: str) -> None:
    response = post_job(client, bad_token, {"org_id": str(uuid.uuid4()), "kind": "noop_demo"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired session."


def test_rejects_unknown_kinds(client: TestClient) -> None:
    response = post_job(
        client, token(uuid.uuid4()), {"org_id": str(uuid.uuid4()), "kind": "drop_tables"}
    )
    assert response.status_code == 422


# ── with the database ─────────────────────────────────────────────────────────
@needs_db
def test_rejects_orgs_the_user_is_not_in(
    client: TestClient, user: DbUser, other_org: uuid.UUID
) -> None:
    response = post_job(client, token(user.id), {"org_id": str(other_org), "kind": "noop_demo"})
    assert response.status_code == 403


@needs_db
def test_rejects_an_invalid_payload(client: TestClient, user: DbUser) -> None:
    response = post_job(
        client,
        token(user.id),
        {"org_id": str(user.org_id), "kind": "noop_demo", "payload": {"steps": 99}},
    )
    assert response.status_code == 422


@needs_db
def test_creates_a_job_for_a_member(client: TestClient, user: DbUser) -> None:
    response = post_job(
        client,
        token(user.id),
        {"org_id": str(user.org_id), "kind": "noop_demo", "payload": {"step_seconds": 0}},
    )
    cancel_jobs(user.org_id)
    assert response.status_code == 201
    body = response.json()
    assert body["created"] is True
    job = body["job"]
    assert job["kind"] == "noop_demo" and job["status"] == "queued"
    assert job["org_id"] == str(user.org_id) and job["created_by"] == str(user.id)
    # Defaults are filled in from the payload model.
    assert job["payload"] == {"steps": 5, "step_seconds": 0.0, "fail_at": None}


@needs_db
def test_paid_jobs_are_not_queued_twice(client: TestClient, user: DbUser) -> None:
    # A product that doesn't exist: if a dev worker claims the job, it fails before any AI call.
    body = {
        "org_id": str(user.org_id),
        "kind": "product_briefing",
        "payload": {"product_id": str(uuid.uuid4())},
    }
    first = post_job(client, token(user.id), body)
    second = post_job(client, token(user.id), body)
    cancel_jobs(user.org_id)
    assert first.status_code == 201 and second.status_code == 200
    assert second.json()["created"] is False
    assert second.json()["job"]["id"] == first.json()["job"]["id"]


# ── POST /builds ──────────────────────────────────────────────────────────────


@pytest.fixture
def build_inputs(user: DbUser, monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, Any]]:
    """The test template (retired in the gallery, so active only during the test), a brand and
    product in the user's org, and the build job kind renamed so a running dev worker never
    picks these jobs up."""
    from pathlib import Path

    from app.cli.seed_library import seed
    from app.jobs.registry import KINDS, JobKind

    seed(
        Path(__file__).resolve().parents[3] / "templates" / "library" / "advertorial-fixture",
        thumbnails=False,
    )
    real = KINDS["build"]
    monkeypatch.setitem(
        KINDS,  # the registry app.builds reads
        "build",
        JobKind("test_build", real.title, real.handler, real.payload_model, max_attempts=3),
    )
    with transaction() as conn:
        template = conn.execute(
            "select id from templates where org_id is null and slug = 'advertorial-fixture'"
        ).fetchone()
        brand = conn.execute(
            "insert into brands (org_id, name, prefix) values (%(o)s, 'Lume', 'LUM') returning id",
            {"o": user.org_id},
        ).fetchone()
        assert template is not None and brand is not None
        conn.execute(
            "update templates set status = 'active' where id = %(t)s", {"t": template["id"]}
        )
        product = conn.execute(
            """
            insert into products (org_id, brand_id, handle, name)
            values (%(o)s, %(b)s, 'serum', 'Serum') returning id
            """,
            {"o": user.org_id, "b": brand["id"]},
        ).fetchone()
    assert product is not None
    yield {
        "org_id": str(user.org_id),
        "template_id": str(template["id"]),
        "brand_id": str(brand["id"]),
        "product_id": str(product["id"]),
    }
    with transaction() as conn:
        conn.execute(
            "update templates set status = 'retired' where id = %(t)s", {"t": template["id"]}
        )


@needs_db
def test_creates_a_build_and_its_job(
    client: TestClient, user: DbUser, build_inputs: dict[str, Any]
) -> None:
    first = client.post("/builds", json=build_inputs, headers=bearer(user))
    second = client.post("/builds", json=build_inputs, headers=bearer(user))
    assert first.status_code == 201, first.text
    body = first.json()
    assert body["build"]["key"] == "LUM-1" and second.json()["build"]["key"] == "LUM-2"
    assert body["build"]["status"] == "queued"
    assert body["build"]["title"] == "Advertorial (test) · Serum"
    assert body["job"]["kind"] == "test_build" and body["job"]["build_id"] == body["build"]["id"]
    with transaction() as conn:
        row = conn.execute(
            "select wizard, targeting, origin, created_by from builds where id = %(b)s",
            {"b": body["build"]["id"]},
        ).fetchone()
    assert row is not None and row["origin"] == "owned" and row["created_by"] == user.id
    assert row["wizard"]["ai_images"] is True and row["wizard"]["author_type"] == "writer"
    assert row["targeting"]["author_type"] == "writer" and row["targeting"]["audience"] is None
    assert row["targeting"]["image_prefs"] == {"ai": True, "styles": [], "audience": None}


@needs_db
def test_refuses_builds_from_other_orgs_inputs(
    client: TestClient, user: DbUser, other_org: uuid.UUID, build_inputs: dict[str, Any]
) -> None:
    with transaction() as conn:
        foreign = conn.execute(
            """
            insert into brands (org_id, name, prefix) values (%(o)s, 'Theirs', 'THR')
            returning id
            """,
            {"o": other_org},
        ).fetchone()
    assert foreign is not None
    response = client.post(
        "/builds", json={**build_inputs, "brand_id": str(foreign["id"])}, headers=bearer(user)
    )
    assert response.status_code == 404
    response = client.post(
        "/builds", json={**build_inputs, "org_id": str(other_org)}, headers=bearer(user)
    )
    assert response.status_code == 403


# ── POST /builds/{id}/retry ───────────────────────────────────────────────────


@needs_db
def test_retries_a_failed_build_once(
    client: TestClient, user: DbUser, build_inputs: dict[str, Any]
) -> None:
    created = client.post("/builds", json=build_inputs, headers=bearer(user)).json()
    build_id = created["build"]["id"]
    with transaction() as conn:
        conn.execute(
            "update jobs set status = 'failed' where id = %(j)s", {"j": created["job"]["id"]}
        )
        conn.execute("update builds set status = 'failed' where id = %(b)s", {"b": build_id})
    body = {"org_id": build_inputs["org_id"]}

    first = client.post(f"/builds/{build_id}/retry", json=body, headers=bearer(user))
    second = client.post(f"/builds/{build_id}/retry", json=body, headers=bearer(user))
    cancel_jobs(user.org_id)

    assert first.status_code == 201, first.text
    retried = first.json()
    assert retried["build"]["status"] == "queued" and retried["build"]["id"] == build_id
    assert retried["job"]["kind"] == "test_build" and retried["job"]["build_id"] == build_id
    assert retried["job"]["id"] != created["job"]["id"]
    assert second.status_code == 409


@needs_db
def test_retry_refuses_builds_that_did_not_fail_or_are_not_yours(
    client: TestClient, user: DbUser, other_org: uuid.UUID, build_inputs: dict[str, Any]
) -> None:
    created = client.post("/builds", json=build_inputs, headers=bearer(user)).json()
    cancel_jobs(user.org_id)
    build_id = created["build"]["id"]
    mine = {"org_id": build_inputs["org_id"]}

    still_queued = client.post(f"/builds/{build_id}/retry", json=mine, headers=bearer(user))
    unknown = client.post(f"/builds/{uuid.uuid4()}/retry", json=mine, headers=bearer(user))
    other = client.post(
        f"/builds/{build_id}/retry", json={"org_id": str(other_org)}, headers=bearer(user)
    )

    assert still_queued.status_code == 409
    assert unknown.status_code == 404
    assert other.status_code == 403


@needs_db
def test_rejects_an_invalid_wizard(
    client: TestClient, user: DbUser, build_inputs: dict[str, Any]
) -> None:
    response = client.post(
        "/builds",
        json={**build_inputs, "wizard": {"author_type": "doctor"}},
        headers=bearer(user),
    )
    assert response.status_code == 422
