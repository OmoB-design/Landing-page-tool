"""The clone path end to end against the database and storage, with the network and the browser
replaced: the clone terms (API), starting a clone by address and by pasted HTML, the
`template_clone` job, its clean-up when it fails, and builds refused until analysis (B2.2)."""

import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import builds, clones
from app.config import Settings
from app.db import transaction
from app.engines.html import parse
from app.fetch import browser, ladder
from app.jobs import queue
from app.jobs.kinds import template_clone
from app.jobs.registry import JobKind
from app.jobs.runner import Runner
from app.models.build import BuildWizard
from app.models.clone import CloneRequest
from app.providers import storage
from tests.conftest import DbUser, job_row, needs_db

pytestmark = needs_db
FIXTURES = Path(__file__).parent / "fixtures" / "clone"
SHOPIFY = (FIXTURES / "shopify_product.html").read_text()
WEBFLOW = (FIXTURES / "webflow_listicle.html").read_text()
SHOPIFY_URL = "https://lumora.test/products/glow-serum"
KINDS = {
    "template_clone": JobKind(
        "template_clone", "Page clone", template_clone.run,
        template_clone.TemplateClonePayload, max_attempts=1,
    ),
}  # fmt: skip


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    from app import auth
    from app.main import app
    from tests.test_api import FakeJwksClient

    monkeypatch.setattr(auth, "get_jwks_client", lambda: FakeJwksClient())
    with TestClient(app) as client:
        yield client


@pytest.fixture
def network(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """The Shopify fixture at SHOPIFY_URL, its first stylesheet, and a picture for the card.
    Returns the URLs requested."""
    requested: list[str] = []

    def fetch_page(url: str, **_: Any) -> ladder.FetchedPage:
        requested.append(url)
        return ladder.FetchedPage(SHOPIFY_URL, 200, SHOPIFY, "http")

    def fetch_bytes(url: str, **_: Any) -> tuple[bytes, str]:
        requested.append(url)
        if "base.css" in url:
            return b".hero{background:url(../files/bg.png)}", "text/css"
        raise ladder.FetchError(f"Couldn't download {url} (status 404).")

    monkeypatch.setattr(ladder, "fetch_page", fetch_page)
    monkeypatch.setattr(ladder, "fetch_bytes", fetch_bytes)
    monkeypatch.setattr(browser, "screenshot_html", lambda html: b"\xff\xd8jpeg")
    # .test hosts don't resolve, so the SSRF guard would refuse them (it has its own tests).
    monkeypatch.setattr(template_clone, "check_public_url", lambda url: url)
    return requested


def accept(org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    with transaction() as conn:
        conn.execute(
            "update orgs set clone_terms_accepted_at = now(), clone_terms_accepted_by = %(u)s "
            "where id = %(o)s",
            {"o": org_id, "u": user_id},
        )


def run(user: DbUser, settings: Settings, job_id: uuid.UUID) -> dict[str, Any]:
    runner = Runner(settings, kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 2, ["template_clone"])
    assert claimed is not None and claimed.id == job_id
    runner.execute(claimed)
    return job_row(job_id)


def template(template_id: str) -> dict[str, Any] | None:
    with transaction() as conn:
        row = conn.execute("select * from templates where id = %(t)s", {"t": template_id})
        found = row.fetchone()
    return dict(found) if found else None


def files(org_id: uuid.UUID, template_id: str) -> list[str]:
    return sorted(storage.list_files("templates", f"{org_id}/{template_id}"))


def clean(org_id: uuid.UUID, template_id: str) -> None:
    storage.remove_folder("templates", f"{org_id}/{template_id}")


def test_the_terms_are_accepted_once_by_an_owner_or_admin(
    api: TestClient, user: DbUser, other_org: uuid.UUID
) -> None:
    from tests.test_api import bearer, token

    headers = bearer(user)
    state = api.get("/clone-terms", params={"org_id": str(user.org_id)}, headers=headers).json()
    assert state == {
        "clone_enabled": True, "accepted_at": None, "accepted_by": None, "can_accept": True,
    }  # fmt: skip
    refused = api.post(
        "/templates/clone",
        json={"org_id": str(user.org_id), "url": "https://lumora.test/pages/x"},
        headers=headers,
    )
    assert refused.status_code == 409 and "terms" in refused.json()["detail"]
    assert (
        api.post(
            "/clone-terms", json={"org_id": str(other_org), "accept": True}, headers=headers
        ).status_code
        == 403
    )

    accepted = api.post(
        "/clone-terms", json={"org_id": str(user.org_id), "accept": True}, headers=headers
    ).json()
    assert accepted["accepted_at"] and accepted["accepted_by"] == "Worker Test"
    again = api.post(
        "/clone-terms", json={"org_id": str(user.org_id), "accept": True}, headers=headers
    ).json()
    assert again["accepted_at"] == accepted["accepted_at"]  # the first acceptance stands

    # A plain member can't accept for the workspace.
    member_id = uuid.uuid4()
    with transaction() as conn:
        conn.execute(
            "insert into auth.users (id, email, aud, role) values "
            "(%(id)s, %(e)s, 'authenticated', 'authenticated')",
            {"id": member_id, "e": f"member-{member_id.hex[:8]}@example.test"},
        )
        conn.execute(
            "insert into org_members (org_id, user_id, role) values (%(o)s, %(u)s, 'member')",
            {"o": user.org_id, "u": member_id},
        )
    try:
        member = {"Authorization": f"Bearer {token(member_id)}"}
        state = api.get("/clone-terms", params={"org_id": str(user.org_id)}, headers=member)
        assert state.json()["can_accept"] is False
        assert (
            api.post(
                "/clone-terms", json={"org_id": str(user.org_id), "accept": True}, headers=member
            ).status_code
            == 403
        )
    finally:
        with transaction() as conn:
            conn.execute("delete from auth.users where id = %(id)s", {"id": member_id})


def test_cloning_is_refused_when_the_workspace_flag_is_off(api: TestClient, user: DbUser) -> None:
    from tests.test_api import bearer

    accept(user.org_id, user.id)
    with transaction() as conn:
        conn.execute(
            "update orgs set settings = settings || '{\"clone_enabled\": false}' where id = %(o)s",
            {"o": user.org_id},
        )
    response = api.post(
        "/templates/clone",
        json={"org_id": str(user.org_id), "url": "lumora.test/pages/x"},
        headers=bearer(user),
    )
    assert response.status_code == 403 and "switched off" in response.json()["detail"]


def test_a_clone_by_address_becomes_a_cloned_template(
    api: TestClient, user: DbUser, network: list[str], fast_settings: Settings
) -> None:
    from tests.test_api import bearer

    accept(user.org_id, user.id)
    started = api.post(
        "/templates/clone",
        json={"org_id": str(user.org_id), "url": "lumora.test/products/glow-serum",
              "type": "other"},
        headers=bearer(user),
    )  # fmt: skip
    assert started.status_code == 201
    job = started.json()["job"]
    assert job["payload"]["url"] == "https://lumora.test/products/glow-serum"
    template_id = job["payload"]["template_id"]
    try:
        row = run(user, fast_settings, uuid.UUID(job["id"]))
        assert row["status"] == "succeeded", row["error"]
        result = row["result"]
        assert result["platform"] == "shopify" and result["verdict"] == "rebuild_native"
        assert any("product page" in w for w in result["warnings"])
        assert any("1 of the page's stylesheets" in w for w in result["warnings"])

        saved = template(template_id)
        assert saved is not None
        assert (saved["origin"], saved["status"], saved["type"]) == ("cloned", "active", "other")
        assert (saved["source_host"], saved["source_name"]) == ("lumora.test", "Lumora")
        assert saved["source_url"] == SHOPIFY_URL and saved["name"] == "Glow Serum \u2013 Lumora"
        assert saved["blueprint"] is None  # analysis is B2.2
        base = f"{user.org_id}/{template_id}"
        assert files(user.org_id, template_id) == [
            f"{base}/source.html", f"{base}/thumb.jpg", f"{base}/v1.html",
        ]  # fmt: skip
        assert storage.download("templates", f"{base}/source.html").decode() == SHOPIFY
        page = storage.download("templates", saved["html_path"]).decode()
        assert "googletagmanager" not in page and "fbq(" not in page
        soup = parse(page)
        inlined = soup.select_one("style[data-lp-source]")
        assert inlined is not None and "lumora.test/cdn/shop/t/9/files/bg.png" in str(inlined)
        with transaction() as conn:
            version = conn.execute(
                "select version, reason from template_versions where template_id = %(t)s",
                {"t": template_id},
            ).fetchone()
        assert version is not None and version["reason"] == "Cloned from lumora.test"

        # No building from it until it's analysed.
        with transaction() as conn:
            brand = conn.execute(
                "insert into brands (org_id, name, prefix) values (%(o)s, 'Lume', 'LUM') "
                "returning id",
                {"o": user.org_id},
            ).fetchone()
            assert brand is not None
            product = conn.execute(
                "insert into products (org_id, brand_id, handle, name) values "
                "(%(o)s, %(b)s, 'serum', 'Serum') returning id",
                {"o": user.org_id, "b": brand["id"]},
            ).fetchone()
            assert product is not None
        with pytest.raises(builds.TemplateNotReadyError):
            builds.create_build(
                org_id=user.org_id, template_id=uuid.UUID(template_id), brand_id=brand["id"],
                product_id=product["id"], wizard=BuildWizard(), created_by=user.id,
            )  # fmt: skip
    finally:
        clean(user.org_id, template_id)


def test_a_pasted_page_resolves_against_its_address(
    user: DbUser, network: list[str], fast_settings: Settings
) -> None:
    accept(user.org_id, user.id)
    job = clones.start_clone(
        user.org_id,
        user.id,
        CloneRequest(
            org_id=user.org_id, html=WEBFLOW, source_url="pawsome.test/blog/7-reasons",
            name="  Seven   reasons ", type="listicle",
        ),
    )  # fmt: skip
    template_id = job.payload["template_id"]
    try:
        assert job.payload["pasted"] is True and "html" not in job.payload
        row = run(user, fast_settings, job.id)
        assert row["status"] == "succeeded", row["error"]
        saved = template(template_id)
        assert saved is not None
        assert (saved["name"], saved["type"], saved["platform"]) == (
            "Seven reasons", "listicle", "webflow",
        )  # fmt: skip
        assert saved["source_host"] == "pawsome.test"
        page = storage.download("templates", saved["html_path"]).decode()
        # The page's own <base> wins over the address given, as in a browser.
        assert "https://pawsome.test/blog/images/dog-1.webp" in page
        assert all(u.endswith(".css") for u in network)  # stylesheets only: no page fetch
    finally:
        clean(user.org_id, template_id)


def test_a_pasted_page_without_an_address_fails_and_leaves_nothing(
    user: DbUser, network: list[str], fast_settings: Settings
) -> None:
    accept(user.org_id, user.id)
    html = WEBFLOW.replace('<base href="https://pawsome.test/blog/">', "")
    job = clones.start_clone(
        user.org_id, user.id, CloneRequest(org_id=user.org_id, html=html, type="listicle")
    )
    template_id = job.payload["template_id"]
    try:
        assert files(user.org_id, template_id)  # waiting for the job
        row = run(user, fast_settings, job.id)
        assert row["status"] == "failed"
        assert "couldn't tell where this page came from" in row["error"]["message"]
        assert template(template_id) is None and files(user.org_id, template_id) == []
    finally:
        clean(user.org_id, template_id)


def test_a_bot_check_fails_with_the_reason(
    user: DbUser, monkeypatch: pytest.MonkeyPatch, fast_settings: Settings
) -> None:
    accept(user.org_id, user.id)

    def blocked(url: str, **_: Any) -> ladder.FetchedPage:
        raise ladder.FetchError("lumora.test blocked automated access (bot protection).")

    monkeypatch.setattr(ladder, "fetch_page", blocked)
    job = clones.start_clone(
        user.org_id, user.id, CloneRequest(org_id=user.org_id, url="https://lumora.test/x")
    )
    row = run(user, fast_settings, job.id)
    assert row["status"] == "failed" and "bot protection" in row["error"]["message"]
    assert template(job.payload["template_id"]) is None


def test_the_request_needs_exactly_one_source() -> None:
    org = uuid.uuid4()
    with pytest.raises(ValueError, match="either"):
        CloneRequest(org_id=org)
    with pytest.raises(ValueError, match="either"):
        CloneRequest(org_id=org, url="https://a.test", html="<html></html>")
    assert CloneRequest(org_id=org, url="a.test/x", html="   ").html is None
