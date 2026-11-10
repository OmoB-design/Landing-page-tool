"""Duplicating a page (B7.1, D144): what a copy takes and leaves behind, its number and place in the
family, and the pages that can't be copied, through the API against the database and storage."""

import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from app.db import transaction
from app.providers import storage
from tests.conftest import DESK_PAGE, DbUser, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)

pytestmark = needs_db


@pytest.fixture
def made(finished: dict[str, Any]) -> Iterator[list[str]]:
    """The copies a test makes, whose page files go afterwards (the org's rows go with the org).
    The fixture's page took LUM-1 by hand, so the brand's counter starts at 2."""
    with transaction() as conn:
        conn.execute(
            """
            update brands set next_build_number = 2
            where id = (select brand_id from builds where id = %(b)s)
            """,
            {"b": finished["id"]},
        )
    copies: list[str] = []
    yield copies
    for copy_id in copies:
        storage.remove_folder("builds", f"{finished['org_id']}/{copy_id}")


def duplicate(client: TestClient, user: DbUser, org_id: str, build_id: str) -> Any:
    return client.post(
        f"/builds/{build_id}/duplicate", json={"org_id": org_id}, headers=bearer(user)
    )


def row(build_id: str) -> dict[str, Any]:
    with transaction() as conn:
        found = conn.execute("select * from builds where id = %(b)s", {"b": build_id}).fetchone()
    assert found is not None
    return dict(found)


def test_a_copy_is_the_page_as_it_is_now_and_leaves_its_history_behind(
    client: TestClient, user: DbUser, finished: dict[str, Any], made: list[str]
) -> None:
    batch = uuid.uuid4()
    with transaction() as conn:
        conn.execute(
            """
            update builds set status = 'approved', approved_at = now(), approved_by = %(u)s,
                   batch_id = %(batch)s, cost_usd = 0.42, report = %(report)s
            where id = %(b)s
            """,
            {
                "u": user.id, "batch": batch, "b": finished["id"],
                "report": Jsonb({"copy": {"error": None}, "qa": {"version": 1}}),
            },
        )  # fmt: skip
        conn.execute(
            """
            insert into build_competitors (org_id, build_id, rank, url, status, label, name)
            values (%(o)s, %(b)s, 2, 'https://rival.example', 'pulled', 'Rival', 'Rival serum')
            """,
            {"o": finished["org_id"], "b": finished["id"]},
        )
        conn.execute(
            """
            insert into build_snapshots (build_id, seq, html_path, reason, created_by)
            values (%(b)s, 1, 'old.html', 'Edited a line', %(u)s)
            """,
            {"b": finished["id"], "u": user.id},
        )

    response = duplicate(client, user, finished["org_id"], finished["id"])
    assert response.status_code == 201, response.text
    body = response.json()
    made.append(body["id"])
    assert body["key"] == "LUM-2"
    assert body["title"] == "Test page · Copy 1"
    assert body["status"] == "needs_review"

    copy = row(body["id"])
    assert copy["parent_build_id"] == uuid.UUID(finished["id"])
    assert copy["copy_number"] == 1
    assert copy["batch_id"] == batch  # in the original's folder
    assert copy["approved_at"] is None and copy["export_html_path"] is None
    assert float(copy["cost_usd"]) == 0
    assert copy["page_version"] == 1
    assert copy["working_html_path"] == f"{finished['org_id']}/{body['id']}/pages/v1.html"
    assert storage.download("builds", copy["working_html_path"]).decode() == DESK_PAGE
    assert copy["report"]["copied_from"] == {"id": finished["id"], "key": "LUM-1", "version": 1}
    assert "qa" not in copy["report"] and copy["report"]["copy"] == {"error": None}

    with transaction() as conn:
        competitors = conn.execute(
            "select label, name from build_competitors where build_id = %(b)s",
            {"b": body["id"]},
        ).fetchall()
        snapshots = conn.execute(
            "select 1 from build_snapshots where build_id = %(b)s", {"b": body["id"]}
        ).fetchall()
        checks = conn.execute(
            "select status from jobs where build_id = %(b)s and kind = 'qa'", {"b": body["id"]}
        ).fetchall()
    assert [dict(c) for c in competitors] == [{"label": "Rival", "name": "Rival serum"}]
    assert snapshots == []
    assert [c["status"] for c in checks] == ["queued"]  # fresh screenshots of its own

    # The original is as it was.
    original = row(finished["id"])
    assert original["status"] == "approved" and original["copy_number"] is None

    # The batch screen shows the copy under its original.
    state = client.get(
        f"/builds/batch/{batch}", params={"org_id": finished["org_id"]}, headers=bearer(user)
    )
    assert state.status_code == 200, state.text
    pages = {p["key"]: p for p in state.json()["pages"]}
    assert pages["LUM-2"]["parent_id"] == finished["id"]
    assert pages["LUM-2"]["copy_number"] == 1
    assert pages["LUM-1"]["parent_id"] is None


def test_copies_of_a_copy_join_the_first_page_and_numbers_are_not_reused(
    client: TestClient, user: DbUser, finished: dict[str, Any], made: list[str]
) -> None:
    first = duplicate(client, user, finished["org_id"], finished["id"]).json()
    made.append(first["id"])
    second = duplicate(client, user, finished["org_id"], first["id"]).json()
    made.append(second["id"])
    assert second["title"] == "Test page · Copy 2"
    assert row(second["id"])["parent_build_id"] == uuid.UUID(finished["id"])

    # Copy 1 goes to Trash: the next copy is still Copy 3.
    with transaction() as conn:
        conn.execute("update builds set deleted_at = now() where id = %(b)s", {"b": first["id"]})
    third = duplicate(client, user, finished["org_id"], finished["id"]).json()
    made.append(third["id"])
    assert third["title"] == "Test page · Copy 3"
    assert [third["key"], row(third["id"])["copy_number"]] == ["LUM-4", 3]


def test_unfinished_trashed_and_other_workspaces_pages_are_refused(
    client: TestClient,
    user: DbUser,
    other_org: uuid.UUID,
    finished: dict[str, Any],
    made: list[str],
) -> None:
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'building' where id = %(b)s", {"b": finished["id"]}
        )
    building = duplicate(client, user, finished["org_id"], finished["id"])
    assert building.status_code == 409
    assert building.json()["detail"] == "A page can be duplicated once it's built."

    foreign = duplicate(client, user, str(other_org), finished["id"])
    assert foreign.status_code == 403

    with transaction() as conn:
        conn.execute(
            "update builds set status = 'needs_review', deleted_at = now() where id = %(b)s",
            {"b": finished["id"]},
        )
    assert duplicate(client, user, finished["org_id"], finished["id"]).status_code == 404
    assert duplicate(client, user, finished["org_id"], str(uuid.uuid4())).status_code == 404
    with transaction() as conn:
        copies = conn.execute(
            "select 1 from builds where parent_build_id = %(b)s", {"b": finished["id"]}
        ).fetchall()
    assert copies == []


def test_a_copy_takes_the_screenshots_when_they_show_the_page_as_it_is(
    client: TestClient, user: DbUser, finished: dict[str, Any], made: list[str]
) -> None:
    folder = f"{finished['org_id']}/{finished['id']}"
    for name in ("desktop", "phone"):
        path = f"{folder}/qa-{name}.jpg"
        storage.upload("builds", path, name.encode(), "image/jpeg", upsert=True)
    record = {
        "version": 1,
        "taken_at": "2026-11-10T10:00:00+00:00",
        "desktop": {"path": f"{folder}/qa-desktop.jpg", "width": 1280, "height": 900},
        "phone": {"path": f"{folder}/qa-phone.jpg", "width": 390, "height": 2000},
        "share": "https://example.test/share.jpg",
    }
    with transaction() as conn:
        conn.execute(
            "update builds set report = %(r)s where id = %(b)s",
            {"r": Jsonb({"qa": record}), "b": finished["id"]},
        )
    body = duplicate(client, user, finished["org_id"], finished["id"]).json()
    made.append(body["id"])
    shots = row(body["id"])["report"]["qa"]
    own = f"{finished['org_id']}/{body['id']}"
    assert shots["version"] == 1 and shots["share"] == record["share"]
    assert shots["desktop"]["path"] == f"{own}/qa-desktop.jpg"
    assert storage.download("builds", shots["phone"]["path"]) == b"phone"
    with transaction() as conn:
        checks = conn.execute(
            "select 1 from jobs where build_id = %(b)s and kind = 'qa'", {"b": body["id"]}
        ).fetchall()
    assert checks == []  # nothing to check again
