"""Members and invites (B6.1, D129): invite links made from an invite's id and the worker's
secret; someone new signs up from the link straight into the workspace; someone with an account
accepts with the invited email; the role rules (one owner at least, owners make owners); leaving
and removal re-home the person."""

import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import members
from app.config import Settings, get_settings
from app.db import transaction
from tests.conftest import DbUser, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)

pytestmark = needs_db


@pytest.fixture
def secret(monkeypatch: pytest.MonkeyPatch) -> Iterator[Settings]:
    settings = get_settings()
    monkeypatch.setattr(settings, "lp_share_secret", "test-share-secret")
    yield settings


@pytest.fixture
def people() -> Iterator[list[DbUser]]:
    """Users made by `sign_up`; removed afterwards with every workspace they own or joined."""
    made: list[DbUser] = []
    yield made
    with transaction() as conn:
        for person in made:
            orgs = conn.execute(
                "select org_id from org_members where user_id = %(id)s", {"id": person.id}
            ).fetchall()
            for row in orgs:
                conn.execute(
                    """
                    delete from orgs where id = %(org)s and not exists (
                      select 1 from org_members m where m.org_id = %(org)s
                        and m.user_id <> all(%(ours)s))
                    """,
                    {"org": row["org_id"], "ours": [p.id for p in made]},
                )
        for person in made:
            conn.execute("delete from auth.users where id = %(id)s", {"id": person.id})


def sign_up(people: list[DbUser], meta: dict[str, Any] | None = None, email: str = "") -> DbUser:
    """A sign-up, exactly as Supabase records one (the sign-up trigger runs)."""
    user_id = uuid.uuid4()
    email = email or f"members-test-{user_id.hex[:10]}@example.test"
    with transaction() as conn:
        conn.execute(
            """
            insert into auth.users (id, email, aud, role, raw_user_meta_data)
            values (%(id)s, %(email)s, 'authenticated', 'authenticated', %(meta)s)
            """,
            {"id": user_id, "email": email, "meta": _json({"full_name": "Test", **(meta or {})})},
        )
        row = conn.execute(
            """
            select p.default_org_id as org from profiles p where p.user_id = %(id)s
            """,
            {"id": user_id},
        ).fetchone()
    person = DbUser(id=user_id, email=email, org_id=row["org"] if row else uuid.uuid4())
    people.append(person)
    return person


def _json(value: dict[str, Any]) -> str:
    import json

    return json.dumps(value)


def roles(org_id: uuid.UUID) -> dict[uuid.UUID, str]:
    with transaction() as conn:
        rows = conn.execute(
            "select user_id, role::text as role from org_members where org_id = %(org)s",
            {"org": org_id},
        ).fetchall()
    return {r["user_id"]: r["role"] for r in rows}


def invite(client: TestClient, by: DbUser, org: uuid.UUID, email: str, role: str = "member") -> Any:
    return client.post(
        f"/orgs/{org}/invites", json={"email": email, "role": role}, headers=bearer(by)
    )


def test_an_invite_token_opens_only_its_own_invite(secret: Settings) -> None:
    first, second = uuid.uuid4(), uuid.uuid4()
    token = members.token_for(first)
    assert len(token) == 46
    assert members.invite_id_from(token) == first
    assert members.invite_id_from(members.token_for(second)) == second
    # Another invite's signature, a changed letter, or a client link's token don't open it.
    forged = token[:22] + members.token_for(second)[22:]
    assert members.invite_id_from(forged) is None
    assert members.invite_id_from(token[:-1] + ("A" if token[-1] != "A" else "B")) is None
    from app import share

    assert members.invite_id_from(share.token_for(first)) is None


def test_someone_new_signs_up_from_the_link_into_the_workspace(
    client: TestClient, secret: Settings, people: list[DbUser]
) -> None:
    owner = sign_up(people)
    email = f"new-{uuid.uuid4().hex[:8]}@example.test"
    state = invite(client, owner, owner.org_id, email.upper()).json()
    [sent] = state["invites"]
    assert sent["email"] == email and sent["role"] == "member" and not sent["expired"]
    info = client.get(f"/invites/{sent['token']}").json()
    assert info["status"] == "open" and info["email"] == email

    # The sign-up names the invite: no workspace of their own, straight into the owner's.
    newcomer = sign_up(people, {"invite_id": info["invite_id"]}, email=email)
    assert newcomer.org_id == owner.org_id
    assert roles(owner.org_id)[newcomer.id] == "member"
    with transaction() as conn:
        theirs = conn.execute(
            "select count(*) as n from org_members where user_id = %(id)s", {"id": newcomer.id}
        ).fetchone()
    assert theirs is not None and theirs["n"] == 1
    assert client.get(f"/invites/{sent['token']}").json()["status"] == "accepted"
    assert invite(client, owner, owner.org_id, email).status_code == 422  # already in

    # A sign-up naming an invite for another email gets its own workspace, as before.
    other = invite(client, owner, owner.org_id, f"x-{uuid.uuid4().hex[:6]}@example.test").json()
    stranger = sign_up(people, {"invite_id": other["invites"][0]["id"]})
    assert stranger.org_id != owner.org_id
    assert roles(stranger.org_id) == {stranger.id: "owner"}


def test_someone_with_an_account_accepts_with_the_invited_email(
    client: TestClient, secret: Settings, people: list[DbUser]
) -> None:
    owner, guest, outsider = sign_up(people), sign_up(people), sign_up(people)
    state = invite(client, owner, owner.org_id, guest.email, "admin").json()
    token = state["invites"][0]["token"]

    wrong = client.post("/invites/accept", json={"token": token}, headers=bearer(outsider))
    assert wrong.status_code == 422 and guest.email in wrong.json()["detail"]
    joined = client.post("/invites/accept", json={"token": token}, headers=bearer(guest))
    assert joined.status_code == 200, joined.text
    assert joined.json()["org_id"] == str(owner.org_id)
    assert roles(owner.org_id)[guest.id] == "admin"
    with transaction() as conn:
        profile = conn.execute(
            "select default_org_id from profiles where user_id = %(id)s", {"id": guest.id}
        ).fetchone()
    assert profile is not None and profile["default_org_id"] == owner.org_id  # opens it
    again = client.post("/invites/accept", json={"token": token}, headers=bearer(guest))
    assert again.status_code == 422 and "already been used" in again.json()["detail"]
    assert client.get("/invites/" + "A" * 46).status_code == 404


def test_revoking_and_inviting_again(
    client: TestClient, secret: Settings, people: list[DbUser]
) -> None:
    owner, guest = sign_up(people), sign_up(people)
    first = invite(client, owner, owner.org_id, guest.email).json()["invites"][0]
    # Inviting again refreshes the open invite (the same link), with the new role.
    second = invite(client, owner, owner.org_id, guest.email, "admin").json()["invites"]
    assert [(i["id"], i["role"]) for i in second] == [(first["id"], "admin")]
    gone = client.delete(f"/orgs/{owner.org_id}/invites/{first['id']}", headers=bearer(owner))
    assert gone.status_code == 200 and gone.json()["invites"] == []
    assert client.get(f"/invites/{first['token']}").json()["status"] == "revoked"
    refused = client.post("/invites/accept", json={"token": first["token"]}, headers=bearer(guest))
    assert refused.status_code == 422 and "turned off" in refused.json()["detail"]


def test_the_role_rules(client: TestClient, secret: Settings, people: list[DbUser]) -> None:
    owner, admin, member = sign_up(people), sign_up(people), sign_up(people)
    org = owner.org_id
    for person, role in ((admin, "admin"), (member, "member")):
        token = invite(client, owner, org, person.email, role).json()["invites"][0]["token"]
        assert client.post(
            "/invites/accept", json={"token": token}, headers=bearer(person)
        ).is_success

    def patch(by: DbUser, target: DbUser, role: str) -> Any:
        return client.patch(
            f"/orgs/{org}/members/{target.id}", json={"role": role}, headers=bearer(by)
        )

    def delete(by: DbUser, target: DbUser) -> Any:
        return client.delete(f"/orgs/{org}/members/{target.id}", headers=bearer(by))

    # A member sees everyone but no invites, and can't manage.
    seen = client.get(f"/orgs/{org}/members", headers=bearer(member)).json()
    assert seen["your_role"] == "member" and len(seen["members"]) == 3 and seen["invites"] == []
    assert [m["role"] for m in seen["members"]] == ["owner", "admin", "member"]
    assert invite(client, member, org, "z@example.test").status_code == 403
    assert patch(member, admin, "member").status_code == 403
    # An admin manages members and admins, not owners.
    assert invite(client, admin, org, "o@example.test", "owner").status_code == 422
    assert patch(admin, member, "owner").status_code == 422
    assert patch(admin, owner, "member").status_code == 422
    assert delete(admin, owner).status_code == 422
    assert patch(admin, member, "admin").status_code == 200
    assert patch(admin, member, "member").status_code == 200
    # The last owner stays: no demoting or leaving until there's another.
    assert patch(owner, owner, "admin").json()["detail"] == members.LAST_OWNER
    assert delete(owner, owner).json()["detail"] == members.LAST_OWNER
    assert patch(owner, admin, "owner").status_code == 200
    assert delete(owner, owner).status_code == 200  # leaves: another owner remains
    assert roles(org) == {admin.id: "owner", member.id: "member"}


def test_leaving_or_removal_rehomes_the_person(
    client: TestClient, secret: Settings, people: list[DbUser]
) -> None:
    owner = sign_up(people)
    email = f"solo-{uuid.uuid4().hex[:8]}@example.test"
    info_id = invite(client, owner, owner.org_id, email).json()["invites"][0]["id"]
    solo = sign_up(people, {"invite_id": info_id}, email=email)  # only in the owner's workspace
    removed = client.delete(f"/orgs/{owner.org_id}/members/{solo.id}", headers=bearer(owner))
    assert removed.status_code == 200
    assert solo.id not in roles(owner.org_id)
    with transaction() as conn:
        profile = conn.execute(
            "select default_org_id from profiles where user_id = %(id)s", {"id": solo.id}
        ).fetchone()
    # With nowhere else to go, they get a workspace of their own, as a sign-up does.
    assert profile is not None and profile["default_org_id"] not in (None, owner.org_id)
    assert roles(profile["default_org_id"]) == {solo.id: "owner"}
    # Someone outside the workspace can't see or change it.
    assert client.get(f"/orgs/{owner.org_id}/members", headers=bearer(solo)).status_code == 403
