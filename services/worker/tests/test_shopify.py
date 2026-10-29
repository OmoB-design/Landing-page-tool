"""Shopify (BUILD_SPEC §12.4 and §12.5, B1.5b, D90): the store address and scopes, the token and the
GraphQL client on a fake transport, the page's body, and connecting a store and publishing a draft
through the API and the job (no real Shopify)."""

import uuid
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app import publishing
from app.config import get_settings
from app.db import transaction
from app.jobs import queue
from app.jobs.kinds import publish_shopify
from app.jobs.registry import KINDS
from app.jobs.runner import Runner
from app.providers import shopify
from app.providers.shopify import ShopifyClient, ShopifyError, Token
from app.publish import shopify_page
from tests.conftest import DbUser, job_row, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)
from tests.test_desk import post

# ── the store, its scopes, the token ──────────────────────────────────────────


def test_a_store_address_becomes_its_myshopify_domain() -> None:
    assert shopify.shop_domain("https://FourU.myshopify.com/admin") == "fouru.myshopify.com"
    assert shopify.shop_domain("fouru") == "fouru.myshopify.com"
    with pytest.raises(ShopifyError, match="myshopify address"):
        shopify.shop_domain("www.fouru.com")


def test_missing_scopes_accept_broader_ones() -> None:
    assert shopify.missing_scopes("write_content,write_files,write_themes") == []
    assert shopify.missing_scopes("write_online_store_pages,write_themes") == []
    assert shopify.missing_scopes("write_content") == ["write_files", "write_themes"]


def test_the_client_credentials_grant_gives_a_token_or_explains() -> None:
    def ok(request: httpx.Request) -> httpx.Response:
        assert b"grant_type=client_credentials" in request.content
        return httpx.Response(200, json={"access_token": "shpat_x", "scope": "write_content"})

    token = shopify.get_token("a.myshopify.com", "id", "secret", transport=httpx.MockTransport(ok))
    assert token == Token("shpat_x", "write_content")
    refused = httpx.MockTransport(lambda r: httpx.Response(401, json={}))
    with pytest.raises(ShopifyError, match="didn't accept the client id and secret"):
        shopify.get_token("a.myshopify.com", "id", "secret", transport=refused)


def test_graphql_waits_out_throttling() -> None:
    calls = {"n": 0}

    def store(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        assert request.url.path == f"/admin/api/{get_settings().shopify_api_version}/graphql.json"
        if calls["n"] == 1:
            return httpx.Response(200, json={"errors": [{"extensions": {"code": "THROTTLED"}}]})
        return httpx.Response(200, json={"data": {"shop": {"name": "FourU"}}})

    client = ShopifyClient("a.myshopify.com", "t", transport=httpx.MockTransport(store),
                           sleep=lambda _: None)  # fmt: skip
    assert client.shop_name() == "FourU" and calls["n"] == 2


# ── the page's body ───────────────────────────────────────────────────────────

PAGE = (
    "<html><head><style>.hero{background:url(https://cdn.test/bg.jpg)}</style>"
    "<script>track()</script></head><body data-lp-x='1'>"
    '<section data-lp-section="hero" class="hero"><h1>Glow</h1>'
    '<img src="https://cdn.test/a.png" '
    'srcset="https://cdn.test/a.png 1x, https://cdn.test/a2.png 2x">'
    "<script>more()</script><!-- note --></section></body></html>"
)


def test_a_page_fitted_into_the_theme_is_scoped_reset_and_hides_the_theme() -> None:
    page = (
        '<html><head><link rel="stylesheet" href="https://fonts.test/css?family=X">'
        "<style>body{margin:0;font-size:1.125rem} .hero h1{font-size:3rem}</style></head>"
        '<body><section class="hero"><h1>Glow</h1>'
        '<img src="https://cdn.test/a.png" width="24" height="24"><svg width="12"></svg>'
        "</section></body></html>"
    )
    fitted = shopify_page.body(page, scoped=True)
    assert fitted.startswith('<div class="lp-funnel" id="lp-funnel">')
    assert '<style>@import url("https://fonts.test/css?family=X");</style>' in fitted
    assert "all: revert" in fitted and ":not(svg, svg *)" in fitted
    assert '#lp-funnel :where(img[width="24"]) { width: 24px; }' in fitted
    assert "#lp-funnel{margin:0;font-size:18px}" in fitted  # body → the page; rem → px
    assert "#lp-funnel .hero h1{font-size:48px}" in fitted
    assert ".shopify-section-group-header-group" in fitted
    plain = shopify_page.body(page)
    assert plain.startswith('<div class="lp-funnel">') and "all: revert" not in plain
    assert '@import url("https://fonts.test/css?family=X");' in plain  # fonts in both


def test_the_body_keeps_styles_and_content_inside_lp_funnel() -> None:
    body = shopify_page.body(PAGE)
    assert body.startswith('<div class="lp-funnel">') and "<style>.hero{" in body
    assert "<script" not in body and "data-lp-" not in body and "note" not in body
    assert shopify_page.asset_urls(body) == [
        "https://cdn.test/a.png", "https://cdn.test/a2.png", "https://cdn.test/bg.jpg",
    ]  # fmt: skip
    moved = shopify_page.rewrite(body, {"https://cdn.test/a.png": "https://cdn.shopify/a.png"})
    assert "https://cdn.shopify/a.png 1x" in moved and "https://cdn.test/a2.png" in moved
    stripped, css = shopify_page.without_styles(body)
    assert "<style>" not in stripped and ".hero{background" in css
    assert shopify_page.handle("BRE-12") == "bre-12"


# ── through the API and the job ───────────────────────────────────────────────


class FakeStore:
    """Enough of a store's Admin API for a draft page."""

    def __init__(self, *, theme_ok: bool = True) -> None:
        self.theme_ok = theme_ok
        self.saved: list[dict[str, Any]] = []
        self.theme_files_written: dict[str, str] = {}
        self.upserts = 0
        self.deleted: list[str] = []
        self.gone: set[str] = set()  # pages deleted in Shopify by hand

    def close(self) -> None:
        pass

    def create_files(self, urls: list[tuple[str, str]]) -> dict[str, str]:
        return {url: f"gid://shopify/MediaImage/{i}" for i, (url, _) in enumerate(urls)}

    def file_urls(self, ids: list[str]) -> dict[str, str | None]:
        return {i: f"https://cdn.shopify.com/files/{i.rsplit('/', 1)[-1]}.png" for i in ids}

    def main_theme(self) -> str | None:
        return "gid://shopify/OnlineStoreTheme/1"

    def theme_files(self, theme_id: str, filenames: list[str]) -> set[str]:
        return {name for name in filenames if name in self.theme_files_written}

    def upsert_theme_files(self, theme_id: str, files: dict[str, str]) -> list[str]:
        self.upserts += 1
        if not self.theme_ok:
            return ["Access denied: writing themes needs an exemption"]
        self.theme_files_written.update(files)
        return []

    def save_page(self, **page: Any) -> dict[str, Any]:
        self.saved.append(page)
        new_id = f"gid://shopify/Page/{77 + len(self.deleted)}"
        return {"id": page["page_id"] or new_id, "handle": page["handle"]}

    def delete_page(self, page_id: str) -> bool:
        self.deleted.append(page_id)
        return page_id not in self.gone


@pytest.fixture
def fake_store(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeStore]:
    store = FakeStore()
    monkeypatch.setattr(
        publishing,
        "shopify_token",
        lambda shop, cid, secret: Token("shpat_test", "write_content,write_files,write_themes"),
    )
    monkeypatch.setattr(publishing, "shopify_client", lambda shop, token: store)
    monkeypatch.setattr(publish_shopify, "FILE_POLL_SECONDS", 0.0)
    yield store


def run_job(kind: str = "publish_shopify_page") -> dict[str, Any]:
    runner = Runner(get_settings(), kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, [kind])
    assert claimed is not None
    runner.execute(claimed)
    return job_row(claimed.id)


def brand_of(build: dict[str, Any]) -> str:
    with transaction() as conn:
        row = conn.execute(
            "select brand_id from builds where id = %(b)s", {"b": build["id"]}
        ).fetchone()
    assert row is not None
    return str(row["brand_id"])


def connect(client: TestClient, user: DbUser, build: dict[str, Any], **extra: Any) -> Any:
    return client.post(
        "/integrations/shopify",
        json={
            "org_id": build["org_id"], "brand_id": brand_of(build),
            "shop_domain": "FourU.myshopify.com", "client_id": "client_123456",
            "client_secret": "shpss_secret_123", **extra,
        },
        headers=bearer(user),
    )  # fmt: skip


def state(client: TestClient, user: DbUser, build: dict[str, Any]) -> dict[str, Any]:
    response = client.get(
        f"/builds/{build['id']}/publishing",
        params={"org_id": build["org_id"]},
        headers=bearer(user),
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


@needs_db
def test_connecting_a_store_checks_its_scopes_and_keeps_the_secret_in_vault(
    client: TestClient, user: DbUser, finished: dict[str, Any], fake_store: FakeStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # fmt: skip
    monkeypatch.setattr(
        publishing, "shopify_token", lambda shop, cid, secret: Token("t", "write_content")
    )
    lacking = connect(client, user, finished)
    assert lacking.status_code == 422 and "write_files" in lacking.json()["detail"]
    monkeypatch.setattr(
        publishing,
        "shopify_token",
        lambda shop, cid, secret: Token("t", "write_content,write_files"),
    )
    done = connect(client, user, finished)
    assert done.status_code == 200, done.text
    [store] = done.json()["shopify"]
    assert store["shop_domain"] == "fouru.myshopify.com" and store["missing_scopes"] == [
        "write_themes"
    ]
    assert "shpss_secret_123" not in done.text
    from app import vault

    with transaction() as conn:
        row = conn.execute(
            "select vault_secret_id from store_connections where brand_id = %(b)s",
            {"b": brand_of(finished)},
        ).fetchone()
        assert row is not None and vault.read(conn, row["vault_secret_id"]) == "shpss_secret_123"


@needs_db
def test_publishing_to_shopify_makes_a_draft_and_updates_it_the_next_time(
    client: TestClient, user: DbUser, finished: dict[str, Any], fake_store: FakeStore
) -> None:
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'approved' where id = %(b)s", {"b": finished["id"]}
        )
    version = state(client, user, finished)["page_version"]
    early = post(client, user, finished, "publish", base_version=version,
                 destination="shopify_page")  # fmt: skip
    assert early.status_code == 422 and "Shopify store" in early.json()["detail"]
    assert connect(client, user, finished).status_code == 200
    assert state(client, user, finished)["shopify_domain"] == "fouru.myshopify.com"

    started = post(client, user, finished, "publish", base_version=version,
                   destination="shopify_page")  # fmt: skip
    assert started.status_code == 200, started.text
    job = run_job()
    assert job["status"] == "succeeded", job["error"]
    [first] = fake_store.saved
    assert first["page_id"] is None and first["handle"] == "lum-1"
    assert first["template_suffix"] == "lp-full" and first["body"].startswith(
        '<div class="lp-funnel">'
    )
    assert set(fake_store.theme_files_written) == set(shopify_page.THEME_FILES)
    draft = state(client, user, finished)["shopify_draft"]
    assert draft["admin_url"] == "https://admin.shopify.com/store/fouru/pages/77"
    assert draft["full_width"] is True
    assert state(client, user, finished)["status"] == "approved"  # a draft isn't live

    def publish_again() -> dict[str, Any]:
        again = post(client, user, finished, "publish", base_version=version,
                     destination="shopify_page")  # fmt: skip
        assert again.status_code == 200, again.text
        assert run_job()["status"] == "succeeded"
        return fake_store.saved[-1]

    # The theme already has the template: it's used without writing it again.
    upserts = fake_store.upserts
    assert publish_again()["template_suffix"] == "lp-full"
    assert fake_store.upserts == upserts

    # A theme without it that refuses writes (no exemption): the theme's own template, with the
    # page fitted into it.
    fake_store.theme_files_written.clear()
    fake_store.theme_ok = False
    second = publish_again()
    assert second["page_id"] == "gid://shopify/Page/77"  # the same draft, updated
    assert second["template_suffix"] is None
    assert second["body"].startswith('<div class="lp-funnel" id="lp-funnel">')
    assert state(client, user, finished)["shopify_draft"]["full_width"] is False

    # The store owner adds the two files by hand: the next publish picks them up.
    fake_store.theme_files_written.update(shopify_page.THEME_FILES)
    third = publish_again()
    assert third["template_suffix"] == "lp-full"
    assert third["body"].startswith('<div class="lp-funnel">')  # the template: not fitted
    assert state(client, user, finished)["shopify_draft"]["full_width"] is True


@needs_db
def test_the_template_files_are_served_for_the_store_owner(
    client: TestClient, user: DbUser
) -> None:
    response = client.get("/integrations/shopify/template", headers=bearer(user))
    assert response.status_code == 200, response.text
    paths = [f["path"] for f in response.json()["files"]]
    assert paths == list(shopify_page.THEME_FILES)
    assert "content_for_header" in response.json()["files"][0]["body"]


def remove_draft(client: TestClient, user: DbUser, build: dict[str, Any]) -> Any:
    return client.post(
        f"/builds/{build['id']}/unpublish",
        json={"org_id": build["org_id"], "destination": "shopify_page"},
        headers=bearer(user),
    )


@needs_db
def test_removing_the_draft_deletes_the_page_and_the_next_publish_makes_a_new_one(
    client: TestClient, user: DbUser, finished: dict[str, Any], fake_store: FakeStore
) -> None:
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'approved' where id = %(b)s", {"b": finished["id"]}
        )
    version = state(client, user, finished)["page_version"]
    assert connect(client, user, finished).status_code == 200
    nothing = remove_draft(client, user, finished)
    assert nothing.status_code == 422 and "no Shopify draft" in nothing.json()["detail"]

    def publish() -> None:
        started = post(client, user, finished, "publish", base_version=version,
                       destination="shopify_page")  # fmt: skip
        assert started.status_code == 200, started.text
        assert run_job()["status"] == "succeeded"

    publish()
    assert state(client, user, finished)["shopify_draft"]["admin_url"].endswith("/pages/77")
    removing = remove_draft(client, user, finished)
    assert removing.status_code == 200, removing.text
    assert removing.json()["running"]["action"] == "unpublish"
    job = run_job("unpublish_shopify_page")
    assert job["status"] == "succeeded", job["error"]
    assert fake_store.deleted == ["gid://shopify/Page/77"]
    after = state(client, user, finished)
    assert after["shopify_draft"] is None and after["running"] is None
    assert after["publications"][0]["action"] == "unpublish"
    assert after["publications"][0]["status"] == "unpublished"

    # Publishing again makes a new page rather than updating the deleted one.
    publish()
    assert fake_store.saved[-1]["page_id"] is None
    assert state(client, user, finished)["shopify_draft"]["admin_url"].endswith("/pages/78")

    # Deleted in Shopify by hand already: removing it still succeeds.
    fake_store.gone.add("gid://shopify/Page/78")
    assert remove_draft(client, user, finished).status_code == 200
    assert run_job("unpublish_shopify_page")["status"] == "succeeded"
    assert state(client, user, finished)["shopify_draft"] is None


def test_deleting_a_page_that_shopify_no_longer_has_counts_as_removed() -> None:
    def store(request: httpx.Request) -> httpx.Response:
        error = {"code": "NOT_FOUND", "field": ["id"], "message": "Page does not exist"}
        return httpx.Response(
            200, json={"data": {"pageDelete": {"deletedPageId": None, "userErrors": [error]}}}
        )

    client = ShopifyClient("fouru.myshopify.com", "t", transport=httpx.MockTransport(store))
    assert client.delete_page("gid://shopify/Page/1") is False
