"""Trash (B1.6a, D92): moving to Trash, the rules that stop it, restoring, deleting for good and the
7-day sweep, through the API against the database and storage."""

import uuid
from typing import Any

from fastapi.testclient import TestClient

from app import trash
from app.db import transaction
from app.providers import storage
from tests.conftest import DbUser, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)


def trash_state(client: TestClient, user: DbUser, org_id: str) -> dict[str, Any]:
    response = client.get("/trash", params={"org_id": org_id}, headers=bearer(user))
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def move(client: TestClient, user: DbUser, org_id: str, kind: str, item_id: str) -> Any:
    return client.post(f"/trash/{kind}/{item_id}", json={"org_id": org_id}, headers=bearer(user))


def restore(client: TestClient, user: DbUser, org_id: str, kind: str, item_id: str) -> Any:
    return client.post(
        f"/trash/{kind}/{item_id}/restore", json={"org_id": org_id}, headers=bearer(user)
    )


def purge(client: TestClient, user: DbUser, org_id: str, kind: str, item_id: str) -> Any:
    return client.delete(
        f"/trash/{kind}/{item_id}", params={"org_id": org_id}, headers=bearer(user)
    )


def column(table: str, item_id: str, name: str) -> Any:
    with transaction() as conn:
        row = conn.execute(
            f"select {name} from {table} where id = %(i)s", {"i": item_id}
        ).fetchone()
    return None if row is None else row[name]


def ids_of(build: dict[str, Any]) -> dict[str, str]:
    with transaction() as conn:
        row = conn.execute(
            "select brand_id, product_id from builds where id = %(b)s", {"b": build["id"]}
        ).fetchone()
    assert row is not None
    return {"brand": str(row["brand_id"]), "product": str(row["product_id"])}


def publication(build: dict[str, Any], status: str, destination: str = "vercel") -> None:
    with transaction() as conn:
        conn.execute(
            """
            insert into publications (org_id, build_id, destination, status, details)
            values (%(o)s, %(b)s, %(d)s, %(s)s, %(details)s)
            """,
            {
                "o": build["org_id"], "b": build["id"], "d": destination, "s": status,
                "details": '{"action": "unpublish"}' if status == "unpublished" else "{}",
            },
        )  # fmt: skip


@needs_db
def test_a_page_goes_to_trash_and_comes_back(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    org = finished["org_id"]
    assert move(client, user, org, "page", finished["id"]).status_code == 200
    [item] = trash_state(client, user, org)["items"]
    assert item["kind"] == "page" and item["name"] == "LUM-1 · Test page"
    assert item["detail"] == "Lume" and item["deleted_by"] == "Worker Test"
    assert trash_state(client, user, org)["can_permanently_delete"] is True  # the owner
    restored = restore(client, user, org, "page", finished["id"])
    assert restored.status_code == 200 and restored.json()["items"] == []
    assert column("builds", finished["id"], "deleted_at") is None


@needs_db
def test_a_published_or_building_page_stays_out_of_trash(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    org = finished["org_id"]
    publication(finished, "succeeded")
    refused = move(client, user, org, "page", finished["id"])
    assert refused.status_code == 422 and "LUM-1 is published" in refused.json()["detail"]
    publication(finished, "unpublished")  # taken down since
    publication(finished, "succeeded", "shopify_page")  # but a Shopify draft is there
    assert move(client, user, org, "page", finished["id"]).status_code == 422
    publication(finished, "unpublished", "shopify_page")
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'building' where id = %(b)s", {"b": finished["id"]}
        )
    building = move(client, user, org, "page", finished["id"])
    assert building.status_code == 422 and "still building" in building.json()["detail"]
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'needs_review' where id = %(b)s", {"b": finished["id"]}
        )
    assert move(client, user, org, "page", finished["id"]).status_code == 200


@needs_db
def test_a_brand_takes_its_pages_and_products_and_brings_them_back(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    org, ids = finished["org_id"], ids_of(finished)
    publication(finished, "succeeded")
    refused = move(client, user, org, "brand", ids["brand"])
    assert refused.status_code == 422 and "published pages (LUM-1)" in refused.json()["detail"]
    publication(finished, "unpublished")
    assert move(client, user, org, "brand", ids["brand"]).status_code == 200
    [item] = trash_state(client, user, org)["items"]  # the page and product go with it, unlisted
    assert item["kind"] == "brand" and item["detail"] == "With 1 page and 1 product"
    assert column("builds", finished["id"], "trashed_with") is not None
    alone = restore(client, user, org, "page", finished["id"])
    assert alone.status_code == 422 and "with its brand" in alone.json()["detail"]
    assert restore(client, user, org, "brand", ids["brand"]).status_code == 200
    assert column("builds", finished["id"], "deleted_at") is None
    assert column("products", ids["product"], "deleted_at") is None
    assert column("builds", finished["id"], "trashed_with") is None


@needs_db
def test_deleting_for_good_removes_the_page_and_its_files_and_keeps_used_products(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    org, ids = finished["org_id"], ids_of(finished)
    folder = f"{org}/{finished['id']}"
    storage.upload("builds", f"{folder}/pages/v2.html", b"<p>v2</p>", "text/html", upsert=True)
    early = purge(client, user, org, "page", finished["id"])
    assert early.status_code == 422 and "Trash first" in early.json()["detail"]

    # A product its pages still use: hidden for good, its row kept for them.
    assert move(client, user, org, "product", ids["product"]).status_code == 200
    assert purge(client, user, org, "product", ids["product"]).status_code == 200
    assert column("products", ids["product"], "purged_at") is not None
    assert trash_state(client, user, org)["items"] == []
    assert restore(client, user, org, "product", ids["product"]).status_code == 404

    # Someone who isn't an owner or admin can restore but not delete for good.
    member = DbUser(id=uuid.uuid4(), email=f"member-{uuid.uuid4().hex[:8]}@example.test",
                    org_id=uuid.UUID(org))  # fmt: skip
    with transaction() as conn:
        conn.execute(
            "insert into auth.users (id, email, aud, role) values "
            "(%(id)s, %(e)s, 'authenticated', 'authenticated')",
            {"id": member.id, "e": member.email},
        )
        conn.execute(
            "insert into org_members (org_id, user_id, role) values (%(o)s, %(u)s, 'member')",
            {"o": org, "u": member.id},
        )
    try:
        assert move(client, member, org, "page", finished["id"]).status_code == 200
        assert trash_state(client, member, org)["can_permanently_delete"] is False
        assert purge(client, member, org, "page", finished["id"]).status_code == 403
        assert purge(client, user, org, "page", finished["id"]).status_code == 200
        assert column("builds", finished["id"], "id") is None
        assert storage.list_files("builds", folder) == []
        # The page was the product's last: the next sweep deletes the product's row too.
        assert trash.purge_expired(uuid.UUID(org)) == 1
        assert column("products", ids["product"], "id") is None
    finally:
        with transaction() as conn:
            conn.execute(
                "delete from orgs where id in (select org_id from org_members "
                "where user_id = %(u)s and org_id <> %(o)s)",
                {"u": member.id, "o": org},
            )
            conn.execute("delete from auth.users where id = %(u)s", {"u": member.id})  # fmt: skip


@needs_db
def test_the_sweep_deletes_what_has_been_in_trash_over_seven_days(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    org = finished["org_id"]
    assert move(client, user, org, "page", finished["id"]).status_code == 200
    assert trash.purge_expired(uuid.UUID(org)) == 0  # still within its 7 days
    with transaction() as conn:
        conn.execute(
            "update builds set deleted_at = now() - interval '8 days' where id = %(b)s",
            {"b": finished["id"]},
        )
    assert trash_state(client, user, org)["items"] == []  # past its days: not offered
    assert trash.purge_expired(uuid.UUID(org)) == 1
    assert column("builds", finished["id"], "id") is None


@needs_db
def test_library_templates_and_other_workspaces_items_are_not_found(
    client: TestClient, user: DbUser, finished: dict[str, Any], other_org: uuid.UUID
) -> None:
    with transaction() as conn:
        library = conn.execute("select id from templates where org_id is null limit 1").fetchone()
    assert library is not None
    assert move(client, user, finished["org_id"], "template", str(library["id"])).status_code == 404
    elsewhere = move(client, user, str(other_org), "page", finished["id"])
    assert elsewhere.status_code == 403  # not a member of that workspace
