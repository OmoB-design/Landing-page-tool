"""Batch builds (BUILD_SPEC §9, B3.5, D115): one product, a page from each chosen template, all
started together or none, within the hourly cap, and followed together on the batch screen."""

import json
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db import transaction
from app.jobs import queue
from tests import test_api
from tests.conftest import DbUser, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (autouse fixture)

# The test template, a brand and a product (test_api's fixture, under its own name here).
build_inputs = test_api.build_inputs

COMPETITORS = {
    "urls": [f"https://rival{n}.test/product" for n in range(2, 6)],
    "naming": "neutral",
}


def copy_template(source: str, org_id: uuid.UUID, **overrides: Any) -> str:
    """A copy of the fixture template in the user's workspace, with some columns changed."""
    new = str(uuid.uuid4())
    over = {"id": new, "org_id": str(org_id), "slug": f"batch-{new[:8]}", **overrides}
    with transaction() as conn:
        conn.execute(
            """
            insert into templates
            select * from jsonb_populate_record(
              null::templates,
              (select to_jsonb(t) || %(over)s::jsonb from templates t where id = %(id)s)
            )
            """,
            {"over": json.dumps(over), "id": source},
        )
    return new


def batch(
    client: TestClient, user: DbUser, inputs: dict[str, Any], ids: list[str], **wizard: Any
) -> Any:
    body = {
        "org_id": inputs["org_id"],
        "brand_id": inputs["brand_id"],
        "product_id": inputs["product_id"],
        "template_ids": ids,
        "wizard": wizard,
    }
    return client.post("/builds/batch", json=body, headers=bearer(user))


def org_builds(org_id: str) -> int:
    with transaction() as conn:
        row = conn.execute(
            "select count(*) as n from builds where org_id = %(o)s", {"o": org_id}
        ).fetchone()
    return int(row["n"]) if row else 0


@needs_db
def test_a_batch_makes_a_page_from_each_template_and_follows_them(
    client: TestClient, user: DbUser, build_inputs: dict[str, Any]
) -> None:
    fixture = build_inputs["template_id"]
    yours = copy_template(fixture, user.org_id, name="Advertorial (yours)")
    made = batch(client, user, build_inputs, [fixture, yours, fixture])  # a repeat counts once
    assert made.status_code == 201, made.text
    body = made.json()
    assert [b["key"] for b in body["builds"]] == ["LUM-1", "LUM-2"]
    assert [b["title"] for b in body["builds"]] == [
        "Advertorial (test) · Serum",
        "Advertorial (yours) · Serum",
    ]
    with transaction() as conn:
        rows = conn.execute(
            "select batch_id from builds where org_id = %(o)s", {"o": user.org_id}
        ).fetchall()
    assert {str(r["batch_id"]) for r in rows} == {body["batch_id"]}

    state = client.get(
        f"/builds/batch/{body['batch_id']}",
        params={"org_id": build_inputs["org_id"]},
        headers=bearer(user),
    )
    assert state.status_code == 200, state.text
    pages = state.json()["pages"]
    assert state.json()["product"] == "Serum" and state.json()["brand"] == "Lume"
    assert [p["template_name"] for p in pages] == ["Advertorial (test)", "Advertorial (yours)"]
    assert [p["status"] for p in pages] == ["queued", "queued"]
    assert [p["waiting"] for p in pages] == [1, 2]  # in line: the workspace runs two at a time
    # What the batch screen's list shows (B3.5b).
    assert pages[0]["origin"] == "owned" and pages[0]["cost_usd"] == 0
    assert pages[0]["created_by"] == str(user.id) and pages[0]["residue_score"] is None
    assert pages[0]["started_at"] is None and pages[0]["updated_at"]

    # One running (what it's doing shows), one failed (why shows).
    first, second = pages
    with transaction() as conn:
        conn.execute("update jobs set status = 'running' where id = %(j)s", {"j": first["job_id"]})
        conn.execute(
            """
            insert into job_events (job_id, org_id, level, message)
            values (%(j)s, %(o)s, 'info', 'Writing the copy')
            """,
            {"j": first["job_id"], "o": user.org_id},
        )
        conn.execute("update builds set status = 'building' where id = %(b)s", {"b": first["id"]})
        conn.execute(
            """
            update jobs set status = 'failed',
              error = '{"message": "The copy didn''t fit."}'::jsonb
            where id = %(j)s
            """,
            {"j": second["job_id"]},
        )
        conn.execute("update builds set status = 'failed' where id = %(b)s", {"b": second["id"]})
    pages = client.get(
        f"/builds/batch/{body['batch_id']}",
        params={"org_id": build_inputs["org_id"]},
        headers=bearer(user),
    ).json()["pages"]
    assert pages[0]["step"] == "Writing the copy" and pages[0]["waiting"] is None
    assert pages[1]["error"] == "The copy didn't fit."


@needs_db
def test_a_batch_starts_all_its_pages_or_none(
    client: TestClient, user: DbUser, build_inputs: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    fixture = build_inputs["template_id"]
    unconfirmed = copy_template(
        fixture,
        user.org_id,
        origin="cloned",
        source_host="rival.test",
        reviewed_at=None,
    )
    refused = batch(client, user, build_inputs, [fixture, unconfirmed])
    assert refused.status_code == 422 and "analysis confirmed" in refused.json()["detail"]
    assert org_builds(build_inputs["org_id"]) == 0

    # A ranking page needs the wizard's competitors; with them, only it carries them.
    ranking = copy_template(fixture, user.org_id, type="top5_ranking", name="Top 5 (yours)")
    assert batch(client, user, build_inputs, [fixture, ranking]).status_code == 422
    assert org_builds(build_inputs["org_id"]) == 0
    made = batch(client, user, build_inputs, [fixture, ranking], competitors=COMPETITORS)
    assert made.status_code == 201, made.text
    with transaction() as conn:
        rows = conn.execute(
            """
            select title, wizard->'competitors' as c from builds
            where org_id = %(o)s order by key
            """,
            {"o": user.org_id},
        ).fetchall()
    assert [(r["title"], r["c"] is not None) for r in rows] == [
        ("Advertorial (test) · Serum", False),
        ("Top 5 (yours) · Serum", True),
    ]

    # Past the hourly cap, it says how many still fit, and starts none.
    monkeypatch.setattr(queue, "remaining", lambda conn, org, kind: 1)
    capped = batch(client, user, build_inputs, [fixture, ranking], competitors=COMPETITORS)
    assert capped.status_code == 429
    assert capped.json()["detail"].startswith("You can start 1 more page this hour.")
    assert org_builds(build_inputs["org_id"]) == 2


@needs_db
def test_batches_stay_in_their_workspace(
    client: TestClient, user: DbUser, other_org: uuid.UUID, build_inputs: dict[str, Any]
) -> None:
    made = batch(client, user, build_inputs, [build_inputs["template_id"]]).json()
    elsewhere = client.get(
        f"/builds/batch/{made['batch_id']}", params={"org_id": str(other_org)}, headers=bearer(user)
    )
    assert elsewhere.status_code == 403
    unknown = client.get(
        f"/builds/batch/{uuid.uuid4()}",
        params={"org_id": build_inputs["org_id"]},
        headers=bearer(user),
    )
    assert unknown.status_code == 404
    # Another workspace's product can't be batched.
    stranger = batch(
        client,
        user,
        {**build_inputs, "product_id": str(uuid.uuid4())},
        [build_inputs["template_id"]],
    )
    assert stranger.status_code == 404
