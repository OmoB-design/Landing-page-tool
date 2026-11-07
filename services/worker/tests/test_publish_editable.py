"""Editable pages in Shopify (B4.2, D121): the store's Theme Access password (checked, kept in
Vault), and publishing a page as editable sections through the API and the job: pictures to
Shopify Files, theme files in two steps (block types first), a new draft page per version (no real
Shopify, no real CLI)."""

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import publishing, vault
from app.db import transaction
from app.jobs.kinds import publish_shopify
from app.providers import shopify_cli
from app.providers.shopify import Token
from tests.conftest import DbUser, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)
from tests.test_desk import post
from tests.test_shopify import FakeStore, brand_of, connect, run_job, state

PASSWORD = "shptka_0123456789abcdef"


class FakeTheme:
    """The CLI's side: the live theme, and what was pushed, step by step."""

    def __init__(self) -> None:
        self.steps: list[list[str]] = []
        self.files: dict[str, str] = {}
        self.refuse: list[str] = []
        self.password_ok = True

    def live(self, shop: str, password: str) -> dict[str, Any]:
        if not self.password_ok:
            raise shopify_cli.ThemeAccessError("Shopify didn't accept the Theme Access password.")
        return {"id": 189561766204, "name": "Main"}

    def push(
        self, shop: str, password: str, theme_id: int, steps: list[dict[str, str]]
    ) -> list[str]:
        assert password == PASSWORD and theme_id == 189561766204
        for files in steps:
            self.steps.append(sorted(files))
            self.files.update(files)
        return list(self.refuse)


class EditableStore(FakeStore):
    def __init__(self) -> None:
        super().__init__()
        self.taken: set[str] = set()

    def page_exists(self, handle: str) -> bool:
        return handle in self.taken


@pytest.fixture
def shop(monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[EditableStore, FakeTheme]]:
    store, theme = EditableStore(), FakeTheme()
    monkeypatch.setattr(
        publishing,
        "shopify_token",
        lambda shop, cid, secret: Token("shpat_t", "write_content,write_files"),
    )
    monkeypatch.setattr(publishing, "shopify_client", lambda shop, token: store)
    monkeypatch.setattr(publishing, "theme_live", theme.live)
    monkeypatch.setattr(shopify_cli, "push", theme.push)
    monkeypatch.setattr(publish_shopify, "FILE_POLL_SECONDS", 0.0)
    yield store, theme


def theme_access(client: TestClient, user: DbUser, build: dict[str, Any], password: str) -> Any:
    return client.post(
        "/integrations/shopify/theme-access",
        json={"org_id": build["org_id"], "brand_id": brand_of(build), "password": password},
        headers=bearer(user),
    )


@needs_db
def test_the_theme_access_password_is_checked_and_kept_in_vault(
    client: TestClient,
    user: DbUser,
    finished: dict[str, Any],
    shop: tuple[EditableStore, FakeTheme],
) -> None:
    _, theme = shop
    assert connect(client, user, finished).status_code == 200
    wrong = theme_access(client, user, finished, "shpat_not_a_theme_password")
    assert wrong.status_code == 422 and "shptka_" in wrong.json()["detail"]
    theme.password_ok = False
    refused = theme_access(client, user, finished, PASSWORD)
    assert refused.status_code == 422 and "didn't accept" in refused.json()["detail"]
    theme.password_ok = True
    done = theme_access(client, user, finished, PASSWORD)
    assert done.status_code == 200, done.text
    [store] = done.json()["shopify"]
    assert store["theme_access"] is True and store["theme_last4"] == "cdef"
    assert PASSWORD not in done.text
    with transaction() as conn:
        row = conn.execute(
            "select theme_secret_id from store_connections where brand_id = %(b)s",
            {"b": brand_of(finished)},
        ).fetchone()
        assert row is not None and vault.read(conn, row["theme_secret_id"]) == PASSWORD
    removed = client.delete(
        "/integrations/shopify/theme-access",
        params={"org_id": finished["org_id"], "brand_id": brand_of(finished)},
        headers=bearer(user),
    )
    assert removed.status_code == 200 and removed.json()["shopify"][0]["theme_access"] is False


@needs_db
def test_publishing_editable_sections_makes_a_new_draft_each_time(
    client: TestClient,
    user: DbUser,
    finished: dict[str, Any],
    shop: tuple[EditableStore, FakeTheme],
) -> None:
    store, theme = shop
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'approved' where id = %(b)s", {"b": finished["id"]}
        )
    version = state(client, user, finished)["page_version"]
    assert connect(client, user, finished).status_code == 200

    # No password yet: the editable choice explains what's missing.
    early = post(client, user, finished, "publish", base_version=version,
                 destination="shopify_editable")  # fmt: skip
    assert early.status_code == 422 and "Theme Access" in early.json()["detail"]
    assert state(client, user, finished)["shopify_theme_access"] is False

    assert theme_access(client, user, finished, PASSWORD).status_code == 200
    assert state(client, user, finished)["shopify_theme_access"] is True
    store.taken.add("lum-1-v1")  # a page the store already has at v1: the next free one
    started = post(client, user, finished, "publish", base_version=version,
                   destination="shopify_editable")  # fmt: skip
    assert started.status_code == 200, started.text
    job = run_job("publish_shopify_editable")
    assert job["status"] == "succeeded", job["error"]

    # Two steps, block types first; then the layout, the CSS, the sections and the template.
    first, second = theme.steps
    assert first and all(path.startswith("blocks/lp-") for path in first)
    assert "templates/page.lp-lum-1-v2.json" in second and "layout/lp-page.liquid" in second
    assert any(path.startswith("sections/lp-lum-1-v2-s") for path in second)
    template = json.loads(theme.files["templates/page.lp-lum-1-v2.json"])
    assert template["sections"] and template["layout"] == "lp-page"

    [page] = store.saved
    assert page["page_id"] is None and page["handle"] == "lum-1-v2"
    assert page["template_suffix"] == "lp-lum-1-v2" and page["body"] == ""
    draft = state(client, user, finished)["shopify_editable"]
    assert draft["version"] == 2 and draft["admin_url"].endswith("/pages/77")
    assert draft["editor_url"] == (
        "https://admin.shopify.com/store/fouru/themes/189561766204/editor?template=page.lp-lum-1-v2"
    )
    assert state(client, user, finished)["status"] == "approved"  # a draft isn't live

    # Publishing again: version 3, a new page.
    again = post(client, user, finished, "publish", base_version=version,
                 destination="shopify_editable")  # fmt: skip
    assert again.status_code == 200
    assert run_job("publish_shopify_editable")["status"] == "succeeded"
    assert store.saved[-1]["handle"] == "lum-1-v3"

    # Shopify refusing a file: the publish fails with its reason, and no page is made.
    theme.refuse = ["sections/lp-lum-1-v4-s1.liquid: Liquid syntax error"]
    pages = len(store.saved)
    post(client, user, finished, "publish", base_version=version, destination="shopify_editable")
    failed = run_job("publish_shopify_editable")
    assert failed["status"] == "failed"
    assert "Liquid syntax error" in failed["error"]["message"]
    assert len(store.saved) == pages


def unpublish(client: TestClient, user: DbUser, build: dict[str, Any], destination: str) -> Any:
    return client.post(
        f"/builds/{build['id']}/unpublish",
        json={"org_id": build["org_id"], "destination": destination},
        headers=bearer(user),
    )


@needs_db
def test_hardened_publishing(
    client: TestClient,
    user: DbUser,
    finished: dict[str, Any],
    shop: tuple[EditableStore, FakeTheme],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B5.1 (D125): a publish sends only the version that was approved when Publish was pressed;
    a publication always ends (its job failing fails it); a worker stopping mid-publish isn't a
    failure; editable drafts can be removed (every one still in the store), which lets the page
    go to Trash."""
    from app import trash
    from app.jobs.errors import JobInterrupted
    from app.jobs.kinds import publish_shopify_editable

    store, _ = shop
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'approved' where id = %(b)s", {"b": finished["id"]}
        )
    version = state(client, user, finished)["page_version"]
    assert connect(client, user, finished).status_code == 200
    assert theme_access(client, user, finished, PASSWORD).status_code == 200

    def publish() -> Any:
        return post(client, user, finished, "publish", base_version=version,
                    destination="shopify_editable")  # fmt: skip

    for _ in range(2):  # two editable drafts in the store
        assert publish().status_code == 200
        assert run_job("publish_shopify_editable")["status"] == "succeeded"

    # Edited after Publish was pressed: nothing goes out, and the publication ends as failed.
    assert publish().status_code == 200
    with transaction() as conn:
        conn.execute(
            "update builds set page_version = page_version + 1 where id = %(b)s",
            {"b": finished["id"]},
        )
    pages = len(store.saved)
    stopped = run_job("publish_shopify_editable")
    assert (
        stopped["status"] == "failed" and "edited after you pressed" in stopped["error"]["message"]
    )
    assert len(store.saved) == pages
    newest = state(client, user, finished)["publications"][0]
    assert newest["status"] == "failed" and "Approve it again" in (newest["error"] or "")
    with transaction() as conn:
        conn.execute(
            "update builds set page_version = page_version - 1 where id = %(b)s",
            {"b": finished["id"]},
        )

    # A worker stopping mid-publish: the job goes back to the queue, the publication waits.
    def stop(*_: Any) -> Any:
        raise JobInterrupted

    monkeypatch.setattr(publish_shopify_editable, "_publish", stop)
    assert publish().status_code == 200
    released = run_job("publish_shopify_editable")
    assert released["status"] == "queued"
    assert state(client, user, finished)["publications"][0]["status"] == "pending"
    # Its job failing (here: cancelled) fails the publication too (the trigger).
    with transaction() as conn:
        conn.execute(
            """update jobs set status = 'failed', error = '{"message": "The worker died."}'
               where id = %(j)s""",
            {"j": released["id"]},
        )
    ended = state(client, user, finished)["publications"][0]
    assert ended["status"] == "failed" and ended["error"] == "The worker died."

    # Remove the editable drafts: every one still in the store goes, and the page can be trashed.
    deleted = len(store.deleted)
    removing = unpublish(client, user, finished, "shopify_editable")
    assert removing.status_code == 200, removing.text
    assert run_job("unpublish_shopify_page")["status"] == "succeeded"
    assert len(store.deleted) == deleted + 2
    assert state(client, user, finished)["shopify_editable"] is None
    with transaction() as conn:
        still = conn.execute(
            trash.PUBLISHED, {"o": finished["org_id"], "ids": [finished["id"]]}
        ).fetchall()
    assert still == []
    again = unpublish(client, user, finished, "shopify_editable")
    assert again.status_code == 422
