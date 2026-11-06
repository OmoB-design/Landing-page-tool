"""The client review link (B3.6, BUILD_SPEC §11.4, D55, D119): tokens made from a link's id and the
worker's secret; Approve keeps the approved copy; one live link per page that follows re-approvals,
counts visits, expires and can be turned off; the client's page needs no sign-in."""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import share
from app.config import Settings, get_settings
from app.db import transaction
from tests.conftest import DbUser, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)
from tests.test_desk import desk, edit, post


@pytest.fixture
def secret(monkeypatch: pytest.MonkeyPatch) -> Iterator[Settings]:
    settings = get_settings()
    monkeypatch.setattr(settings, "lp_share_secret", "test-share-secret")
    yield settings


def link(client: TestClient, user: DbUser, build: dict[str, Any], method: str = "GET") -> Any:
    url = f"/builds/{build['id']}/share"
    if method == "POST":
        return client.post(url, json={"org_id": build["org_id"]}, headers=bearer(user))
    params = {"org_id": build["org_id"]}
    if method == "DELETE":
        return client.delete(url, params=params, headers=bearer(user))
    return client.get(url, params=params, headers=bearer(user))


def test_a_token_opens_only_its_own_link(secret: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    link_id = uuid.uuid4()
    token = share.token_for(link_id)
    assert len(token) == 46 and share.link_id_from(token) == link_id
    # Another link's signature, a changed character, a short token: none of them open anything.
    other = share.token_for(uuid.uuid4())
    assert share.link_id_from(token[:22] + other[22:]) is None
    flipped = token[:-1] + ("A" if token[-1] != "A" else "B")
    assert share.link_id_from(flipped) is None
    assert share.link_id_from(token[:40]) is None
    assert share.link_id_from("../../" + token[6:]) is None
    # A different secret makes different tokens.
    monkeypatch.setattr(secret, "lp_share_secret", "another-secret")
    assert share.link_id_from(token) is None


@needs_db
def test_without_the_secret_links_are_not_set_up(
    client: TestClient, user: DbUser, finished: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "lp_share_secret", "")
    answer = link(client, user, finished)
    assert answer.status_code == 503 and "LP_SHARE_SECRET" in answer.json()["detail"]


@needs_db
def test_the_client_link_shows_the_approved_version(
    client: TestClient, user: DbUser, finished: dict[str, Any], secret: Settings
) -> None:
    # Not approved yet: nothing to share.
    before = link(client, user, finished).json()
    assert before["can_share"] is False and before["link"] is None
    refused = link(client, user, finished, "POST")
    assert refused.status_code == 422 and "Approve the page first" in refused.json()["detail"]

    assert (
        post(client, user, finished, "status", base_version=1, status="approved").status_code == 200
    )
    made = link(client, user, finished, "POST")
    assert made.status_code == 200, made.text
    state = made.json()
    assert state["can_share"] and state["approved_version"] == 1 and not state["changed_since"]
    token = state["link"]["token"]
    expires = datetime.fromisoformat(state["link"]["expires_at"])
    assert timedelta(days=29) < expires - datetime.now(UTC) <= timedelta(days=30)
    # The same link again, not a second one.
    assert link(client, user, finished, "POST").json()["link"]["token"] == token

    # The client's page: no sign-in. The page itself counts the visit; its title and date don't.
    info = client.get(f"/review/{token}")
    assert info.status_code == 200 and info.json()["title"]
    page = client.get(f"/review/{token}/html")
    assert page.status_code == 200 and "Is it gentle?" in page.text
    assert page.headers["content-type"].startswith("text/html")
    seen = link(client, user, finished).json()["link"]
    assert seen["views"] == 1 and seen["last_viewed_at"] is not None

    # Edited after approval: the client still sees the approved version.
    current = desk(client, user, finished)
    assert edit(client, user, finished, current, "Is it gentle?", "Is it mild?").status_code == 200
    changed = link(client, user, finished).json()
    assert changed["changed_since"] and changed["can_share"]
    assert "Is it gentle?" in client.get(f"/review/{token}/html").text

    # Approved again: the same link shows the new version.
    assert (
        post(client, user, finished, "status", base_version=2, status="approved").status_code == 200
    )
    assert "Is it mild?" in client.get(f"/review/{token}/html").text
    assert link(client, user, finished).json()["approved_version"] == 2
    with transaction() as conn:
        row = conn.execute(
            "select approved_copy_path from builds where id = %(b)s", {"b": finished["id"]}
        ).fetchone()
    assert row is not None and row["approved_copy_path"].endswith("/approved/v2.html")

    # Turned off: it stops at once; a new link is a different one.
    off = link(client, user, finished, "DELETE")
    assert off.status_code == 200 and off.json()["link"] is None
    gone = client.get(f"/review/{token}")
    assert gone.status_code == 404 and "isn't available" in gone.json()["detail"]
    assert client.get(f"/review/{token}/html").status_code == 404
    fresh = link(client, user, finished, "POST").json()["link"]["token"]
    assert fresh != token and client.get(f"/review/{fresh}").status_code == 200

    # Expired: it stops; making the link again gives a new one.
    with transaction() as conn:
        conn.execute(
            "update share_links set expires_at = now() - interval '1 minute' "
            "where build_id = %(b)s and revoked_at is null",
            {"b": finished["id"]},
        )
    assert link(client, user, finished).json()["link"]["expired"] is True
    assert client.get(f"/review/{fresh}").status_code == 404
    renewed = link(client, user, finished, "POST").json()["link"]
    assert renewed["token"] != fresh and renewed["expired"] is False


@needs_db
def test_a_page_approved_before_links_gets_its_copy_when_shared(
    client: TestClient, user: DbUser, finished: dict[str, Any], secret: Settings
) -> None:
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'approved', approved_at = now() where id = %(b)s",
            {"b": finished["id"]},
        )
    made = link(client, user, finished, "POST")
    assert made.status_code == 200, made.text
    assert made.json()["approved_version"] == 1
    assert "Is it gentle?" in client.get(f"/review/{made.json()['link']['token']}/html").text


@needs_db
def test_links_belong_to_their_workspace(
    client: TestClient,
    user: DbUser,
    finished: dict[str, Any],
    other_org: uuid.UUID,
    secret: Settings,
) -> None:
    foreign = client.get(
        f"/builds/{finished['id']}/share", params={"org_id": str(other_org)}, headers=bearer(user)
    )
    assert foreign.status_code == 403
    unknown = client.get(
        f"/builds/{uuid.uuid4()}/share", params={"org_id": finished["org_id"]}, headers=bearer(user)
    )
    assert unknown.status_code == 404
    assert client.get(f"/review/{share.token_for(uuid.uuid4())}").status_code == 404
    assert client.get("/review/not-a-token").status_code == 404
