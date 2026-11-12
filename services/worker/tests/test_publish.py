"""Publishing (BUILD_SPEC §12, B1.5a, D87): the gate, the brand's site, Vault, the Vercel client on
a fake transport, and the publish flow through the API and the job (no real Vercel)."""

import json
import uuid
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app import publishing, vault
from app.config import get_settings
from app.db import transaction
from app.jobs import queue
from app.jobs.kinds import publish_vercel
from app.jobs.registry import KINDS
from app.jobs.runner import Runner
from app.providers import storage
from app.providers.vercel import VercelClient, VercelError, production_host
from app.publish import gate, site
from tests.conftest import DbUser, job_row, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)
from tests.test_desk import desk, edit, post

# ── the gate ──────────────────────────────────────────────────────────────────


def test_the_gate_lists_what_blocks_and_what_may_be_passed() -> None:
    clean = gate.blockers({}, mock_images=False, origin="owned", allow_placeholders=False)
    assert clean == [] and gate.can_publish(clean, override=False)
    report = {"copy": {"error": "1 of 2 parts…"}, "compliance": {"high_risk_count": 2}}
    found = gate.blockers(report, mock_images=False, origin="owned", allow_placeholders=False)
    assert [b.code for b in found] == ["copy_error", "claims"]
    assert "2 claims are" in found[1].message
    assert not gate.can_publish(found, override=False) and gate.can_publish(found, override=True)


def test_an_offer_price_the_store_wont_charge_needs_publish_anyway() -> None:
    warning = "Autumn shows $16.80, but … the store will still charge $21.00."
    report = {"finalize": {"offer": {"name": "Autumn", "checkout_warning": warning}}}
    found = gate.blockers(report, mock_images=False, origin="owned", allow_placeholders=False)
    assert [(b.code, b.message, b.overridable) for b in found] == [
        ("offer_checkout", warning, True)
    ]
    applied = {"finalize": {"offer": {"name": "Autumn", "checkout_warning": None}}}
    assert gate.blockers(applied, mock_images=False, origin="owned", allow_placeholders=False) == []


def test_placeholder_images_pass_only_with_the_testing_switch() -> None:
    off = gate.blockers({}, mock_images=True, origin="owned", allow_placeholders=False)
    assert not gate.can_publish(off, override=True)
    on = gate.blockers({}, mock_images=True, origin="owned", allow_placeholders=True)
    assert gate.can_publish(on, override=True) and not gate.can_publish(on, override=False)


def test_clones_under_the_residue_threshold_are_blocked() -> None:
    report = {"residue": {"score": 70}}
    found = gate.blockers(report, mock_images=False, origin="cloned", allow_placeholders=False)
    assert [b.code for b in found] == ["residue"]
    assert gate.blockers(report, mock_images=False, origin="owned", allow_placeholders=False) == []


# ── the brand's site ──────────────────────────────────────────────────────────


def test_each_page_is_served_at_its_key() -> None:
    files = site.files({"BRE-12": "<p>a</p>", "BRE-7": "<p>b</p>"})
    assert set(files) == {"bre-12.html", "bre-7.html", "vercel.json"}
    assert json.loads(files["vercel.json"]) == {"cleanUrls": True}
    assert site.project_name("BRE") == "lp-bre" and site.page_path("LUM 3") == "lum-3"


# ── Vercel, on a fake transport ───────────────────────────────────────────────


class FakeVercel:
    """Enough of Vercel's API for a publish: account, projects, files, deployments."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.projects: dict[str, dict[str, Any]] = {}
        self.public: set[str] = set()
        self.deployed: list[dict[str, Any]] = []
        self.polls = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path, method = request.url.path, request.method
        if path == "/v2/user":
            return httpx.Response(200, json={"user": {"username": "ada"}})
        if path.startswith("/v9/projects/") and method == "GET":
            name = path.rsplit("/", 1)[1]
            project = self.projects.get(name)
            return httpx.Response(200, json=project) if project else httpx.Response(404, json={})
        if path == "/v10/projects":
            name = json.loads(request.content)["name"]
            self.projects[name] = {"id": f"prj_{name}", "name": name}
            return httpx.Response(200, json=self.projects[name])
        if path.startswith("/v9/projects/") and method == "PATCH":
            assert json.loads(request.content) == {"ssoProtection": None}
            self.public.add(path.rsplit("/", 1)[1])
            return httpx.Response(200, json={})
        if path == "/v2/files":
            return httpx.Response(200, json={})
        if path == "/v13/deployments" and method == "POST":
            body = json.loads(request.content)
            self.deployed.append(body)
            return httpx.Response(200, json={"id": "dpl_1", "readyState": "QUEUED"})
        if path == "/v13/deployments/dpl_1":
            self.polls += 1
            if self.polls == 1:
                return httpx.Response(200, json={"id": "dpl_1", "readyState": "BUILDING"})
            name = self.deployed[-1]["name"]
            return httpx.Response(
                200,
                json={
                    "id": "dpl_1",
                    "readyState": "READY",
                    "aliasAssigned": True,
                    "alias": [f"{name}-ada.vercel.app", f"{name}.vercel.app"],
                },
            )
        return httpx.Response(500, json={"error": {"message": f"unexpected {method} {path}"}})


def test_the_client_uploads_by_sha_deploys_and_waits_for_the_alias() -> None:
    fake = FakeVercel()
    client = VercelClient("tok_123456789", transport=httpx.MockTransport(fake))
    assert client.account() == ("ada", None)
    upload = client.upload("a.html", b"hello")
    sent = fake.requests[-1]
    assert sent.headers["x-vercel-digest"] == upload.sha and upload.size == 5
    client.deploy("lp-bre", [upload])
    assert fake.deployed[0]["target"] == "production"
    assert fake.deployed[0]["projectSettings"] == {"framework": None}
    ready = client.wait_ready("dpl_1", sleep=lambda _: None)
    assert production_host(ready, "lp-bre") == "lp-bre.vercel.app" and fake.polls == 2


def test_a_team_token_finds_its_team_and_publishes_under_it() -> None:
    seen: list[httpx.Request] = []

    def vercel(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/v2/user":  # a team token can't read the user
            return httpx.Response(404, json={"error": {"message": "User not found."}})
        if request.url.path == "/v2/teams":
            return httpx.Response(200, json={"teams": [{"id": "team_1", "slug": "ada-projects"}]})
        return httpx.Response(404, json={})

    client = VercelClient("tok_123456789", transport=httpx.MockTransport(vercel))
    assert client.account() == ("ada-projects", "team_1")
    client.project("lp-bre")
    assert seen[-1].url.params["teamId"] == "team_1"  # later calls go to the team

    asked = VercelClient(
        "tok_123456789", team_id="ada-projects", transport=httpx.MockTransport(vercel)
    )
    assert asked.account() == ("ada-projects", "team_1")  # a slug works as well as the id
    wrong = VercelClient("tok_123456789", team_id="team_x", transport=httpx.MockTransport(vercel))
    with pytest.raises(VercelError, match="can't reach the team team_x"):
        wrong.account()


def test_the_client_explains_a_refused_token_and_a_failed_deployment() -> None:
    refused = VercelClient(
        "bad_token_12", transport=httpx.MockTransport(lambda r: httpx.Response(403, json={}))
    )
    with pytest.raises(VercelError, match="didn't accept the token"):
        refused.account()
    failed = VercelClient(
        "tok_123456789",
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json={"readyState": "ERROR", "errorMessage": "boom"})
        ),
    )
    with pytest.raises(VercelError, match="failed: boom"):
        failed.wait_ready("dpl_1", sleep=lambda _: None)


# ── Vault ─────────────────────────────────────────────────────────────────────


@needs_db
def test_vault_keeps_a_secret_and_forgets_it() -> None:
    with transaction() as conn:
        secret_id = vault.store(conn, "tok_secret_value", label="test")
        assert vault.read(conn, secret_id) == "tok_secret_value"
        vault.remove(conn, secret_id)
        assert vault.read(conn, secret_id) is None


# ── through the API and the job ───────────────────────────────────────────────


@pytest.fixture
def fake_vercel(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeVercel]:
    fake = FakeVercel()
    monkeypatch.setattr(
        publishing,
        "vercel_client",
        lambda token, team_id: VercelClient(token, team_id, transport=httpx.MockTransport(fake)),
    )
    monkeypatch.setattr(publish_vercel, "_answers", lambda url, want=200: want)
    yield fake


def run_publish(kind: str = "publish_vercel") -> dict[str, Any]:
    runner = Runner(get_settings(), kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, [kind])
    assert claimed is not None
    runner.execute(claimed)
    return job_row(claimed.id)


def publishing_state(client: TestClient, user: DbUser, build: dict[str, Any]) -> dict[str, Any]:
    response = client.get(
        f"/builds/{build['id']}/publishing",
        params={"org_id": build["org_id"]},
        headers=bearer(user),
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def connect(client: TestClient, user: DbUser, org_id: str) -> Any:
    return client.post(
        "/integrations/vercel",
        json={"org_id": org_id, "token": "tok_123456789"},
        headers=bearer(user),
    )


@needs_db
def test_connecting_vercel_stores_the_token_in_vault_for_owners_only(
    client: TestClient, user: DbUser, fake_vercel: FakeVercel
) -> None:
    org = str(user.org_id)
    connected = connect(client, user, org)
    assert connected.status_code == 200, connected.text
    vercel = connected.json()["vercel"]
    assert vercel["account"] == "ada" and vercel["token_last4"] == "6789"
    assert "tok_123456789" not in connected.text  # the token never comes back
    with transaction() as conn:
        row = conn.execute(
            "select vault_secret_id from integrations where org_id = %(o)s", {"o": org}
        ).fetchone()
        assert row is not None and vault.read(conn, row["vault_secret_id"]) == "tok_123456789"
        conn.execute("update org_members set role = 'member' where user_id = %(u)s", {"u": user.id})
    refused = client.post(
        f"/orgs/{org}/testing", json={"allow_placeholder_publish": True}, headers=bearer(user)
    )
    assert refused.status_code == 403
    assert connect(client, user, org).status_code == 403


@needs_db
def test_an_approved_page_is_published_to_vercel_and_becomes_published(
    client: TestClient, user: DbUser, finished: dict[str, Any], fake_vercel: FakeVercel
) -> None:
    org = finished["org_id"]
    state = desk(client, user, finished)
    version = state["build"]["page_version"]
    early = post(client, user, finished, "publish", base_version=version, destination="vercel")
    assert early.status_code == 422 and "Approve" in early.json()["detail"]
    approved = post(client, user, finished, "status", base_version=version, status="approved")
    assert approved.status_code == 200, approved.text
    unconnected = post(
        client, user, finished, "publish", base_version=version, destination="vercel"
    )
    assert unconnected.status_code == 422 and "Connect Vercel" in unconnected.json()["detail"]
    assert connect(client, user, org).status_code == 200

    # Placeholder images block, unless the owner's testing switch is on (then it's an override).
    with transaction() as conn:
        conn.execute("update builds set mock_images = true where id = %(b)s", {"b": finished["id"]})
    gated = publishing_state(client, user, finished)
    assert [b["code"] for b in gated["gate"]] == ["placeholder_images"]
    assert gated["gate"][0]["overridable"] is False
    blocked = post(client, user, finished, "publish", base_version=version, destination="vercel",
                   override=True)  # fmt: skip
    assert blocked.status_code == 422
    switched = client.post(
        f"/orgs/{org}/testing", json={"allow_placeholder_publish": True}, headers=bearer(user)
    )
    assert switched.status_code == 200 and switched.json()["allow_placeholder_publish"] is True
    started = post(client, user, finished, "publish", base_version=version, destination="vercel",
                   override=True)  # fmt: skip
    assert started.status_code == 200, started.text
    running = started.json()["running"]
    assert running["gate_overridden"] is True and running["override_reasons"] == [
        "placeholder_images"
    ]
    again = post(client, user, finished, "publish", base_version=version, destination="vercel",
                 override=True)  # fmt: skip
    assert again.status_code == 422  # one publish at a time

    job = run_publish()
    assert job["status"] == "succeeded", job["error"]
    assert job["result"]["url"] == "https://lp-lum.vercel.app/lum-1"
    assert fake_vercel.public == {"prj_lp-lum"}  # the login wall is off
    files = {f["file"] for f in fake_vercel.deployed[0]["files"]}
    assert files == {"lum-1.html", "vercel.json"}
    after = publishing_state(client, user, finished)
    assert after["status"] == "published" and after["running"] is None
    assert after["live"]["url"] == "https://lp-lum.vercel.app/lum-1"
    assert after["live"]["page_version"] == version

    # An edit sends the published page back to review; it stays live as it was.
    state = desk(client, user, finished)
    assert edit(client, user, finished, state, "Glow in 7 days", "Glow fast").status_code == 200
    assert publishing_state(client, user, finished)["status"] == "needs_review"

    with transaction() as conn:
        paths = [
            r["details"]["html_path"]
            for r in conn.execute(
                "select details from publications where build_id = %(b)s and status = 'succeeded'",
                {"b": finished["id"]},
            ).fetchall()
        ]
    storage.remove("builds", paths)


@needs_db
def test_a_second_page_of_the_brand_keeps_the_first_one_live(
    client: TestClient, user: DbUser, finished: dict[str, Any], fake_vercel: FakeVercel
) -> None:
    org = finished["org_id"]
    assert connect(client, user, org).status_code == 200
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'approved' where id = %(b)s", {"b": finished["id"]}
        )
        first = conn.execute(
            "select * from builds where id = %(b)s", {"b": finished["id"]}
        ).fetchone()
        assert first is not None
        second_id = uuid.uuid4()
        path = f"{org}/{second_id}/working.html"
        storage.upload("builds", path, b"<html><body><h1>Second</h1></body></html>", "text/html")
        conn.execute(
            """
            insert into builds (id, org_id, brand_id, product_id, template_id, template_version,
                                key, origin, status, title, wizard, working_html_path, report,
                                created_by)
            values (%(id)s, %(o)s, %(b)s, %(p)s, %(t)s, %(v)s, 'LUM-2', 'owned', 'approved',
                    'Second page', '{}', %(path)s, '{}', %(u)s)
            """,
            {
                "id": second_id, "o": org, "b": first["brand_id"], "p": first["product_id"],
                "t": first["template_id"], "v": first["template_version"], "path": path,
                "u": user.id,
            },
        )  # fmt: skip
    second = {"id": str(second_id), "org_id": org}
    for build in (finished, second):
        state = publishing_state(client, user, build)
        started = post(client, user, build, "publish", base_version=state["page_version"],
                       destination="vercel")  # fmt: skip
        assert started.status_code == 200, started.text
        fake_vercel.polls = 0
        assert run_publish()["status"] == "succeeded"
    assert {f["file"] for f in fake_vercel.deployed[1]["files"]} == {
        "lum-1.html",
        "lum-2.html",
        "vercel.json",
    }
    assert publishing_state(client, user, second)["live"]["url"].endswith("/lum-2")
    with transaction() as conn:
        rows = conn.execute(
            "select details from publications where org_id = %(o)s and status = 'succeeded'",
            {"o": org},
        ).fetchall()
    storage.remove("builds", [r["details"]["html_path"] for r in rows] + [path])


@needs_db
def test_unpublishing_takes_the_page_down_and_keeps_the_history(
    client: TestClient, user: DbUser, finished: dict[str, Any], fake_vercel: FakeVercel
) -> None:
    org = finished["org_id"]
    assert connect(client, user, org).status_code == 200
    nothing = post(client, user, finished, "unpublish")
    assert nothing.status_code == 422  # not live yet
    with transaction() as conn:
        conn.execute(
            "update builds set status = 'approved' where id = %(b)s", {"b": finished["id"]}
        )
    state = publishing_state(client, user, finished)
    started = post(client, user, finished, "publish", base_version=state["page_version"],
                   destination="vercel")  # fmt: skip
    assert started.status_code == 200, started.text
    assert run_publish()["status"] == "succeeded"
    assert publishing_state(client, user, finished)["status"] == "published"

    fake_vercel.polls = 0
    down = post(client, user, finished, "unpublish")
    assert down.status_code == 200, down.text
    assert down.json()["running"]["action"] == "unpublish"
    job = run_publish("unpublish_vercel")
    assert job["status"] == "succeeded", job["error"]
    # The brand had only this page: the site is left empty, the page answers 404.
    assert {f["file"] for f in fake_vercel.deployed[-1]["files"]} == {"vercel.json", "404.html"}
    after = publishing_state(client, user, finished)
    assert after["status"] == "approved" and after["live"] is None
    assert [(p["action"], p["status"]) for p in after["publications"]] == [
        ("unpublish", "unpublished"),
        ("publish", "succeeded"),
    ]
    again = post(client, user, finished, "unpublish")
    assert again.status_code == 422  # already down

    with transaction() as conn:
        paths = [
            r["details"]["html_path"]
            for r in conn.execute(
                "select details from publications where build_id = %(b)s and status = 'succeeded'",
                {"b": finished["id"]},
            ).fetchall()
        ]
    storage.remove("builds", paths)


# ── Approve and publish all (B7.3b, D148) ─────────────────────────────────────


def _batch_page(
    org: str, first: dict[str, Any], key: str, status: str, batch: uuid.UUID, user: DbUser
) -> str:
    """Another page of the finished page's brand, in the batch."""
    page_id = uuid.uuid4()
    path = f"{org}/{page_id}/working.html"
    storage.upload(
        "builds", path, f"<html><body><h1>{key}</h1></body></html>".encode(), "text/html"
    )
    with transaction() as conn:
        conn.execute(
            """
            insert into builds (id, org_id, brand_id, product_id, template_id, template_version,
                                key, origin, status, title, wizard, working_html_path, report,
                                created_by, batch_id)
            values (%(id)s, %(o)s, %(b)s, %(p)s, %(t)s, %(v)s, %(key)s, 'owned', %(s)s, %(key)s,
                    '{}', %(path)s, '{}', %(u)s, %(batch)s)
            """,
            {
                "id": page_id, "o": org, "b": first["brand_id"], "p": first["product_id"],
                "t": first["template_id"], "v": first["template_version"], "key": key,
                "s": status, "path": path, "u": user.id, "batch": batch,
            },
        )  # fmt: skip
    return str(page_id)


def _was_live(org: str, build_id: str, version: int) -> None:
    """The page went live on Vercel at `version` (its published copy kept, as publishing does)."""
    path = f"{org}/{build_id}/published/{uuid.uuid4()}.html"
    storage.upload("builds", path, b"<html><body>old</body></html>", "text/html")
    with transaction() as conn:
        conn.execute(
            """
            insert into publications (org_id, build_id, destination, status, url, details)
            values (%(o)s, %(b)s, 'vercel', 'succeeded', 'https://x.test', %(d)s)
            """,
            {
                "o": org,
                "b": build_id,
                "d": json.dumps({"page_version": version, "html_path": path}),
            },
        )


def _all(client: TestClient, user: DbUser, org: str, batch: uuid.UUID, **body: Any) -> Any:
    if body:
        return client.post(
            f"/builds/batch/{batch}/publish-all", json={"org_id": org, **body}, headers=bearer(user)
        )
    return client.get(
        f"/builds/batch/{batch}/publish-all", params={"org_id": org}, headers=bearer(user)
    )


@needs_db
def test_approve_and_publish_all_plans_each_page_and_sends_a_brand_out_together(
    client: TestClient, user: DbUser, finished: dict[str, Any], fake_vercel: FakeVercel
) -> None:
    org = finished["org_id"]
    assert connect(client, user, org).status_code == 200
    batch = uuid.uuid4()
    with transaction() as conn:
        first = conn.execute(
            "update builds set batch_id = %(batch)s, page_version = 2 where id = %(b)s returning *",
            {"batch": batch, "b": finished["id"]},
        ).fetchone()
    assert first is not None
    # LUM-1 was live at version 1 and was edited since (needs review); LUM-2 was live and was
    # approved again after an edit; LUM-3 was never live; LUM-4 is still building; LUM-5 is live
    # and up to date.
    _was_live(org, finished["id"], 1)
    lum2 = _batch_page(org, first, "LUM-2", "approved", batch, user)
    _was_live(org, lum2, 0)
    lum3 = _batch_page(org, first, "LUM-3", "needs_review", batch, user)
    lum4 = _batch_page(org, first, "LUM-4", "building", batch, user)
    lum5 = _batch_page(org, first, "LUM-5", "published", batch, user)
    _was_live(org, lum5, 1)

    planned = _all(client, user, org, batch)
    assert planned.status_code == 200, planned.text
    actions = {p["key"]: (p["action"], p["destinations"]) for p in planned.json()["pages"]}
    assert actions == {
        "LUM-1": ("approve_and_publish", ["vercel"]),
        "LUM-2": ("publish", ["vercel"]),
        "LUM-3": ("approve", []),  # never live: approved only
        "LUM-4": ("skip", []),
        "LUM-5": ("none", []),
    }

    ids = [finished["id"], lum2, lum3, lum4, lum5]
    started = _all(client, user, org, batch, build_ids=ids)
    assert started.status_code == 202, started.text
    pages = {p["key"]: p for p in started.json()["pages"]}
    assert pages["LUM-1"]["approved"] and pages["LUM-3"]["approved"]
    assert not pages["LUM-2"]["approved"]  # it was approved already
    job = pages["LUM-1"]["jobs"]["vercel"]
    assert pages["LUM-2"]["jobs"]["vercel"] == job  # one deployment for the brand
    assert pages["LUM-3"]["jobs"] == {} and pages["LUM-4"]["error"] == "Still building."

    assert run_publish()["status"] == "succeeded"
    assert len(fake_vercel.deployed) == 1
    files = {f["file"] for f in fake_vercel.deployed[0]["files"]}
    assert {"lum-1.html", "lum-2.html", "lum-5.html"} <= files and "lum-3.html" not in files
    with transaction() as conn:
        statuses = {
            r["key"]: r["status"]
            for r in conn.execute(
                "select key, status from builds where batch_id = %(b)s", {"b": batch}
            ).fetchall()
        }
        kept = [
            r["details"]["html_path"]
            for r in conn.execute(
                "select details from publications where org_id = %(o)s and status = 'succeeded'",
                {"o": org},
            ).fetchall()
        ]
    assert statuses == {
        "LUM-1": "published", "LUM-2": "published", "LUM-3": "approved",
        "LUM-4": "building", "LUM-5": "published",
    }  # fmt: skip
    storage.remove("builds", kept)
    for page in (lum2, lum3, lum4, lum5):
        storage.remove_folder("builds", f"{org}/{page}")


@needs_db
def test_checks_that_may_be_passed_need_publish_anyway_for_all(
    client: TestClient, user: DbUser, finished: dict[str, Any], fake_vercel: FakeVercel
) -> None:
    org = finished["org_id"]
    assert connect(client, user, org).status_code == 200
    batch = uuid.uuid4()
    with transaction() as conn:
        conn.execute(
            """
            update builds set batch_id = %(batch)s, page_version = 2,
                   report = '{"compliance": {"high_risk_count": 1}}'
            where id = %(b)s
            """,
            {"batch": batch, "b": finished["id"]},
        )
    _was_live(org, finished["id"], 1)
    plan = _all(client, user, org, batch).json()
    assert plan["needs_override"] is True
    assert [b["code"] for b in plan["pages"][0]["gate"]] == ["claims"]

    without = _all(client, user, org, batch, build_ids=[finished["id"]])
    page = without.json()["pages"][0]
    assert page["approved"] and page["jobs"] == {} and "Publish anyway" in page["error"]

    # Approved now: publish again, passing the check.
    again = _all(client, user, org, batch, build_ids=[finished["id"]], override=True)
    assert again.json()["pages"][0]["jobs"]["vercel"]
    assert run_publish()["status"] == "succeeded"
    with transaction() as conn:
        row = conn.execute(
            """
            select gate_overridden, override_reasons, details from publications
            where build_id = %(b)s and status = 'succeeded' order by created_at desc limit 1
            """,
            {"b": finished["id"]},
        ).fetchone()
        old = conn.execute(
            "select details from publications where build_id = %(b)s", {"b": finished["id"]}
        ).fetchall()
    assert row is not None and row["gate_overridden"] and row["override_reasons"] == ["claims"]
    storage.remove(
        "builds", [r["details"]["html_path"] for r in old if r["details"].get("html_path")]
    )


@needs_db
def test_an_offers_pages_are_planned_and_sent_out_together_from_any_batch(
    client: TestClient, user: DbUser, finished: dict[str, Any], fake_vercel: FakeVercel
) -> None:
    """B7.4 (D149): Approve and publish all for the pages selling an offer, whatever batch they're
    in; a page still being changed waits; a page selling another offer isn't one of them."""
    org = finished["org_id"]
    assert connect(client, user, org).status_code == 200
    with transaction() as conn:
        first = conn.execute(
            "update builds set batch_id = %(batch)s, page_version = 2 where id = %(b)s returning *",
            {"batch": uuid.uuid4(), "b": finished["id"]},
        ).fetchone()
        assert first is not None
        offers = [
            conn.execute(
                "insert into offers (org_id, brand_id, name) values (%(o)s, %(b)s, %(n)s) "
                "returning id",
                {"o": org, "b": first["brand_id"], "n": name},
            ).fetchone()["id"]  # type: ignore[index]
            for name in ("Ten off", "Free strap")
        ]
    _was_live(org, finished["id"], 1)
    lum2 = _batch_page(org, first, "LUM-2", "approved", uuid.uuid4(), user)  # another batch
    _was_live(org, lum2, 0)
    lum3 = _batch_page(org, first, "LUM-3", "needs_review", uuid.uuid4(), user)
    lum4 = _batch_page(org, first, "LUM-4", "needs_review", uuid.uuid4(), user)
    with transaction() as conn:
        for page, offer in ((finished["id"], 0), (lum2, 0), (lum3, 0), (lum4, 1)):
            conn.execute(
                "update builds set offer_id = %(offer)s where id = %(b)s",
                {"offer": offers[offer], "b": page},
            )
        conn.execute(
            "insert into jobs (org_id, kind, payload, status, build_id, queue) "
            "values (%(o)s, 'offer_apply', '{}', 'running', %(b)s, 'test-elsewhere')",
            {"o": org, "b": lum3},
        )

    def call(**body: Any) -> Any:
        url = f"/offers/{offers[0]}/publish-all"
        if body:
            return client.post(url, json={"org_id": org, **body}, headers=bearer(user))
        return client.get(url, params={"org_id": org}, headers=bearer(user))

    planned = call()
    assert planned.status_code == 200, planned.text
    actions = {p["key"]: (p["action"], p["reason"]) for p in planned.json()["pages"]}
    assert actions == {
        "LUM-1": ("approve_and_publish", None),
        "LUM-2": ("publish", None),
        "LUM-3": ("skip", "It's being changed now."),
    }
    started = call(build_ids=[finished["id"], lum2])
    assert started.status_code == 202, started.text
    pages = {p["key"]: p for p in started.json()["pages"]}
    assert pages["LUM-1"]["jobs"]["vercel"] == pages["LUM-2"]["jobs"]["vercel"]
    assert run_publish()["status"] == "succeeded"
    assert len(fake_vercel.deployed) == 1
    with transaction() as conn:
        conn.execute("delete from jobs where build_id = %(b)s", {"b": lum3})
        kept = [
            r["details"]["html_path"]
            for r in conn.execute(
                "select details from publications where org_id = %(o)s and status = 'succeeded'",
                {"o": org},
            ).fetchall()
        ]
    storage.remove("builds", kept)
    for page in (lum2, lum3, lum4):
        storage.remove_folder("builds", f"{org}/{page}")
