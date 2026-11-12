"""Changing a page's offer (B7.3a, D147): the job, through the API, with a scripted model. Only the
lines that state the old offer change, every other line comes back as it was, a line a first try
missed gets one more, and the change is one undoable step; batches and variants start the same
job."""

import json
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from app.config import get_settings
from app.db import transaction
from app.engines.fragments import reinject
from app.engines.html import parse
from app.jobs import queue
from app.jobs.kinds import offer_apply
from app.jobs.registry import KINDS
from app.jobs.runner import Runner
from app.pipeline import copy_pass
from app.providers import storage
from tests.conftest import DbUser, job_row, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (fake_jwks: autouse fixture)
from tests.test_desk import desk, fragment, post

pytestmark = needs_db

OLD = {
    "id": "00000000-0000-4000-8000-00000000a0a0",
    "name": "Autumn",
    "price_change": "percent",
    "price_value": "20.00",
    "checkout": "code",
    "code": "AUTUMN20",
    "promo_text": "Autumn edit: 20% off this week",
    "details": "Free shipping on every order. Ends Sunday.",
}
PAGE = """<html><head><title>Tote</title></head><body>
<section data-lp-section="bar"><p data-lp-promo>Autumn edit: 20% off this week</p></section>
<section data-lp-section="hero" data-lp-sale-only><h1>Save 20% on the Market Tote</h1></section>
<section data-lp-section="body">
  <p>At $116 it's the best bag I own, and I've owned a lot of bags.</p>
  <p>It holds a laptop, groceries and a water bottle.</p>
  <blockquote>"Used code AUTUMN20 at checkout, easy." Dana</blockquote>
  <p>Our summer sale is long gone, but quality stays.</p>
  <p>Price <span data-lp-price>$116.00</span> <s data-lp-compare-price>$145.00</s></p>
  <a data-lp-cta href="https://shop.example/discount/AUTUMN20?redirect=/products/tote">Buy now</a>
</section></body></html>"""
SWAPS = [("$116.00", "$135.00"), ("$116", "$135"), ("20%", "7%"), ("Sunday", "Friday")]


def scripted(calls: list[dict[str, Any]], *, miss_code_first: bool = True) -> Any:
    """A model that rewrites the old offer's words, but misses the code on its first try."""

    def ask(system: str, prompt: str) -> dict[str, str]:
        items = json.loads(prompt[prompt.find("\n[") + 1 :])
        calls.append({"ids": [i["id"] for i in items], "remove": [i.get("remove") for i in items]})
        out: dict[str, str] = {}
        for item in items:
            text = str(item["text"])
            for old, new in SWAPS:
                text = text.replace(old, new)
            if item.get("remove") or not miss_code_first:
                text = text.replace("Used code AUTUMN20 at checkout", "Ten off at checkout")
            out[item["id"]] = text
        return out

    return ask


@pytest.fixture
def tote(finished: dict[str, Any]) -> dict[str, Any]:
    """The finished page as a tote's, built with the Autumn offer, and the brand's Ten off."""
    with transaction() as conn:
        row = conn.execute(
            "select working_html_path, brand_id, product_id from builds where id = %(b)s",
            {"b": finished["id"]},
        ).fetchone()
        assert row is not None
        conn.execute(
            """
            update products set price = 145, currency = 'USD', pull_source = 'shopify_json',
                   url = 'https://shop.example/products/tote'
            where id = %(p)s
            """,
            {"p": row["product_id"]},
        )
        new = conn.execute(
            """
            insert into offers (org_id, brand_id, name, price_change, price_value, checkout,
                                promo_text)
            values (%(o)s, %(b)s, 'Ten off', 'amount', 10, 'automatic', 'Ten dollars off')
            returning id
            """,
            {"o": finished["org_id"], "b": row["brand_id"]},
        ).fetchone()
        assert new is not None
        conn.execute(
            "update builds set offer = %(offer)s, status = 'approved' where id = %(b)s",
            {"offer": Jsonb(OLD), "b": finished["id"]},
        )
    storage.upload("builds", row["working_html_path"], PAGE.encode(), "text/html", upsert=True)
    return {**finished, "offer_id": str(new["id"])}


def offer_of(page: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None, dict[str, Any]]:
    """The page's record of its offer, its offer's id and its report."""
    with transaction() as conn:
        row = conn.execute(
            "select offer, offer_id, report from builds where id = %(b)s", {"b": page["id"]}
        ).fetchone()
    assert row is not None
    offer_id = str(row["offer_id"]) if row["offer_id"] else None
    return row["offer"], offer_id, row["report"] or {}


def run_offer_job() -> dict[str, Any]:
    runner = Runner(get_settings(), kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, ["offer_apply"])
    assert claimed is not None
    runner.execute(claimed)
    return job_row(claimed.id)


def change(client: TestClient, user: DbUser, page: dict[str, Any], version: int) -> Any:
    return client.post(
        f"/builds/{page['id']}/offer",
        json={"org_id": page["org_id"], "offer_id": page["offer_id"], "base_version": version},
        headers=bearer(user),
    )


def test_only_the_lines_about_the_old_offer_change_and_the_change_is_one_step(
    client: TestClient, user: DbUser, tote: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(copy_pass, "ask", scripted(calls))
    before = desk(client, user, tote)
    started = change(client, user, tote, before["build"]["page_version"])
    assert started.status_code == 202, started.text
    # While it runs it's the page's job: another change waits.
    busy = desk(client, user, tote)
    assert busy["redraft"]["scope"] == "offer"
    assert change(client, user, tote, before["build"]["page_version"]).status_code == 422

    job = run_offer_job()
    assert job["status"] == "succeeded", job["error"]
    result = job["result"]
    assert result["reason"] == "Changed the offer to Ten off"
    afters = {c["after"] for c in result["changed"]}
    assert "Save 7% on the Market Tote" in afters
    assert "At $135 it's the best bag I own, and I've owned a lot of bags." in afters
    assert '"Ten off at checkout, easy." Dana' in afters  # the second try took the code out
    assert len(calls) == 2 and any(r for r in calls[1]["remove"])
    assert result["leftovers"] == [] and result["invented"] == []
    assert [h["text"] for h in result["hints"]] == [
        "Our summer sale is long gone, but quality stays."
    ]

    state = desk(client, user, tote)
    assert state["build"]["status"] == "needs_review"  # like any change: back to review
    assert state["build"]["page_version"] == before["build"]["page_version"] + 1
    assert state["snapshots"][0]["reason"] == "Changed the offer to Ten off"
    assert fragment(state, "It holds a laptop, groceries and a water bottle.")  # untouched
    with transaction() as conn:
        row = conn.execute(
            "select offer, report, working_html_path from builds where id = %(b)s",
            {"b": tote["id"]},
        ).fetchone()
    assert row is not None and row["offer"]["name"] == "Ten off"
    assert row["report"]["finalize"]["offer"]["price"] == "$135.00"
    soup = parse(storage.download("builds", row["working_html_path"]).decode())
    assert soup.select_one("[data-lp-price]").get_text() == "$135.00"  # type: ignore[union-attr]
    assert soup.select_one("[data-lp-promo]").get_text() == "Ten dollars off"  # type: ignore[union-attr]
    assert soup.select_one("a[data-lp-cta]")["href"] == "https://shop.example/products/tote"  # type: ignore[index]

    undone = post(client, user, tote, "undo", base_version=state["build"]["page_version"])
    assert undone.status_code == 200 and fragment(undone.json(), "Save 20% on the Market Tote")
    # Undo put the old offer back with the old page (B7.4, D149), and Redo the new one.
    offer, offer_id, report = offer_of(tote)
    assert offer is not None and offer["name"] == "Autumn" and offer_id is None
    assert "offer" not in (report.get("finalize") or {})
    redone = post(client, user, tote, "redo", base_version=undone.json()["build"]["page_version"])
    assert redone.status_code == 200, redone.text
    offer, offer_id, report = offer_of(tote)
    assert offer is not None and offer["name"] == "Ten off" and offer_id == tote["offer_id"]
    assert report["finalize"]["offer"]["price"] == "$135.00"


def test_nothing_is_saved_if_other_lines_would_change(
    client: TestClient, user: DbUser, tote: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(copy_pass, "ask", scripted([], miss_code_first=False))

    def leaky(html: str, *args: Any, **kwargs: Any) -> Any:
        out, applied = reinject(html, *args, **kwargs)
        return out.replace("It holds a laptop", "It carries a laptop"), applied

    monkeypatch.setattr(offer_apply, "reinject", leaky)
    version = desk(client, user, tote)["build"]["page_version"]
    assert change(client, user, tote, version).status_code == 202
    job = run_offer_job()
    assert job["status"] == "failed"
    assert "would have changed other lines" in job["error"]["message"]
    assert desk(client, user, tote)["build"]["page_version"] == version


def test_a_batch_and_variants_start_the_same_change(
    client: TestClient, user: DbUser, tote: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(copy_pass, "ask", scripted([], miss_code_first=False))
    batch = uuid.uuid4()
    with transaction() as conn:
        conn.execute(
            "update builds set batch_id = %(batch)s where id = %(b)s",
            {"batch": batch, "b": tote["id"]},
        )
        conn.execute(
            "update brands set next_build_number = 2 where id = "
            "(select brand_id from builds where id = %(b)s)",
            {"b": tote["id"]},
        )
    started = client.post(
        f"/builds/batch/{batch}/offer",
        json={"org_id": tote["org_id"], "offer_id": tote["offer_id"], "build_ids": [tote["id"]]},
        headers=bearer(user),
    )
    assert started.status_code == 202, started.text
    pages = started.json()["pages"]
    assert [p["key"] for p in pages] == ["LUM-1"] and pages[0]["job_id"]
    assert run_offer_job()["status"] == "succeeded"

    made = client.post(
        f"/builds/{tote['id']}/variants",
        json={"org_id": tote["org_id"], "offer_ids": [tote["offer_id"]]},
        headers=bearer(user),
    )
    assert made.status_code == 201, made.text
    copy = made.json()["copies"][0]
    assert copy["key"] == "LUM-2" and copy["job_id"]
    assert run_offer_job()["status"] == "succeeded"
    with transaction() as conn:
        row = conn.execute(
            "select parent_build_id, offer from builds where id = %(b)s", {"b": copy["id"]}
        ).fetchone()
    assert row is not None and str(row["parent_build_id"]) == tote["id"]
    assert row["offer"]["name"] == "Ten off"
    storage.remove_folder("builds", f"{tote['org_id']}/{copy['id']}")


def test_a_variant_names_its_offer_at_once_and_gets_the_old_one_back_if_the_change_fails(
    client: TestClient, user: DbUser, tote: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    """The lists say "Copy 2 · Ten off" as soon as the copy is made (owner, 2026-11-11), while its
    page still states Autumn: the job rewrites Autumn's lines, or names Autumn again if it fails."""
    monkeypatch.setattr(copy_pass, "ask", scripted([], miss_code_first=False))
    with transaction() as conn:
        conn.execute(
            "update brands set next_build_number = 2 where id = "
            "(select brand_id from builds where id = %(b)s)",
            {"b": tote["id"]},
        )

    def make() -> dict[str, Any]:
        made = client.post(
            f"/builds/{tote['id']}/variants",
            json={"org_id": tote["org_id"], "offer_ids": [tote["offer_id"]]},
            headers=bearer(user),
        )
        assert made.status_code == 201, made.text
        copy: dict[str, Any] = made.json()["copies"][0]
        with transaction() as conn:
            row = conn.execute(
                "select offer_id, offer, working_html_path from builds where id = %(b)s",
                {"b": copy["id"]},
            ).fetchone()
        assert row is not None and str(row["offer_id"]) == tote["offer_id"]
        assert row["offer"]["name"] == "Ten off"  # before its job has run
        return {**copy, "path": row["working_html_path"]}

    # A change that fails: the copy names Autumn again, as its page still does.
    def leaky(html: str, *args: Any, **kwargs: Any) -> Any:
        out, applied = reinject(html, *args, **kwargs)
        return out.replace("It holds a laptop", "It carries a laptop"), applied

    monkeypatch.setattr(offer_apply, "reinject", leaky)
    failed = make()
    assert run_offer_job()["status"] == "failed"
    with transaction() as conn:
        row = conn.execute(
            "select offer_id, offer from builds where id = %(b)s", {"b": failed["id"]}
        ).fetchone()
    assert row is not None and row["offer"]["name"] == "Autumn"
    assert row["offer_id"] is None  # Autumn isn't one of the brand's offers any more

    # One that works: Autumn's lines (its code too) were found from what the page stated.
    monkeypatch.setattr(offer_apply, "reinject", reinject)
    done = make()
    job = run_offer_job()
    assert job["status"] == "succeeded", job["error"]
    assert '"Ten off at checkout, easy." Dana' in {c["after"] for c in job["result"]["changed"]}
    with transaction() as conn:
        path = conn.execute(
            "select working_html_path from builds where id = %(b)s", {"b": done["id"]}
        ).fetchone()
    assert path is not None
    assert "AUTUMN20" not in storage.download("builds", path["working_html_path"]).decode()
    # Undo on the copy: Autumn's page, and Autumn again in its record.
    copy_page = {"id": done["id"], "org_id": tote["org_id"]}
    version = desk(client, user, copy_page)["build"]["page_version"]
    assert post(client, user, copy_page, "undo", base_version=version).status_code == 200
    offer, _, _ = offer_of(copy_page)
    assert offer is not None and offer["name"] == "Autumn"
    for copy in (failed, done):
        storage.remove_folder("builds", f"{tote['org_id']}/{copy['id']}")


def test_editing_an_offer_updates_the_pages_that_sell_it(
    client: TestClient, user: DbUser, tote: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    """B7.4 (D149): once Ten off is edited, the page selling it is out of date; updating it is the
    same change, from the page's record of Ten off to Ten off as it is now; then it's up to date,
    and Undo makes it out of date again."""
    monkeypatch.setattr(copy_pass, "ask", scripted([], miss_code_first=False))
    version = desk(client, user, tote)["build"]["page_version"]
    assert change(client, user, tote, version).status_code == 202
    assert run_offer_job()["status"] == "succeeded"
    offer = tote["offer_id"]

    def listed() -> dict[str, Any]:
        got = client.get(
            f"/offers/{offer}/pages", params={"org_id": tote["org_id"]}, headers=bearer(user)
        )
        assert got.status_code == 200, got.text
        page: dict[str, Any] = got.json()["pages"][0]
        return page

    assert listed()["out_of_date"] is False
    with transaction() as conn:
        conn.execute(
            "update offers set price_value = 15, promo_text = 'Fifteen dollars off' "
            "where id = %(id)s",
            {"id": offer},
        )
    page = listed()
    assert page["out_of_date"] is True and page["reason"] is None
    assert page["key"] == "LUM-1" and page["job"]["status"] == "succeeded"  # the change above

    def update() -> Any:
        return client.post(
            f"/offers/{offer}/pages",
            json={"org_id": tote["org_id"], "build_ids": [tote["id"]]},
            headers=bearer(user),
        )

    started = update()
    assert started.status_code == 202, started.text
    assert started.json()["pages"][0]["job_id"]
    waiting = listed()["job"]
    assert waiting["status"] == "queued" and waiting["waiting"] == 1

    def rewrite(system: str, prompt: str) -> dict[str, str]:
        items = json.loads(prompt[prompt.find("\n[") + 1 :])
        out = {}
        for item in items:
            text = str(item["text"])
            for old, new in [("$135", "$130"), ("7%", "10%")]:
                text = text.replace(old, new)
            out[item["id"]] = text
        return out

    monkeypatch.setattr(copy_pass, "ask", rewrite)
    job = run_offer_job()
    assert job["status"] == "succeeded", job["error"]
    assert job["result"]["reason"] == "Updated Ten off to its new terms"
    recorded, _, report = offer_of(tote)
    assert recorded is not None and recorded["price_value"] == "15.00"
    assert report["finalize"]["offer"]["price"] == "$130.00"
    page = listed()
    assert page["out_of_date"] is False
    assert page["job"]["changed"] == len(job["result"]["changed"]) and page["job"]["checks"] == 0
    again = update()
    assert again.status_code == 202 and again.json()["pages"][0]["error"] == "It's up to date."

    # Undo: the page and its record of Ten off as they were, so it's out of date again.
    state = desk(client, user, tote)
    assert state["snapshots"][0]["reason"] == "Updated Ten off to its new terms"
    undone = post(client, user, tote, "undo", base_version=state["build"]["page_version"])
    assert undone.status_code == 200
    assert listed()["out_of_date"] is True

    # An offer that's gone (archived) has no pages to update.
    with transaction() as conn:
        conn.execute("update offers set archived_at = now() where id = %(id)s", {"id": offer})
    gone = client.get(
        f"/offers/{offer}/pages", params={"org_id": tote["org_id"]}, headers=bearer(user)
    )
    assert gone.status_code == 404
