"""Redraft and inks on the review desk (BUILD_SPEC §11.1, B1.4b, D86): which lines a redraft
rewrites and how long they may be, its prompt, and the job and recolour flows through the API with
the fake model (D15)."""

import uuid
from typing import Any

from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from app.config import get_settings
from app.db import transaction
from app.engines import copy_rules
from app.engines import redraft as engine
from app.engines.fragments import dump
from app.jobs import queue
from app.jobs.registry import KINDS
from app.jobs.runner import Runner
from app.providers import storage
from tests.conftest import DbUser, job_row, needs_db
from tests.test_api import fake_jwks  # noqa: F401 (autouse fixture)
from tests.test_desk import desk, edit, fragment, post

PAGE = (
    "<html><body>"
    '<section data-lp-section="hero"><h1>Glow in seven days</h1>'
    "<p>A serum for <b>calmer skin</b> every morning.</p>"
    "<p>Only <span data-lp-price>$29</span> today</p></section>"
    '<section data-lp-section="faq"><p>Is it gentle on skin?</p>'
    "<p>Yes, for every skin.</p></section>"
    "</body></html>"
)
TEMPLATE = (
    "<html><body>"
    '<section data-lp-section="hero"><h1>Your headline goes here</h1>'
    "<p>A short line about the <b>main benefit</b> of it.</p>"
    "<p>Only <span data-lp-price>$10</span> today</p></section>"
    '<section data-lp-section="faq"><p>A question?</p></section>'
    "</body></html>"
)


# ── which lines, how long ─────────────────────────────────────────────────────


def texts(fragments: list[Any]) -> list[str]:
    return [f.text for f in fragments]


def test_a_section_redraft_takes_its_lines_but_not_locked_or_hand_edited_ones() -> None:
    lines = dump(PAGE)
    chosen, kept = engine.targets(PAGE, lines, scope="section", section="faq")
    assert texts(chosen) == ["Is it gentle on skin?", "Yes, for every skin."] and kept == 0
    chosen, kept = engine.targets(
        PAGE, lines, scope="section", section="faq", edited={"Yes, for every skin."}
    )
    assert texts(chosen) == ["Is it gentle on skin?"] and kept == 1
    page, _ = engine.targets(PAGE, lines, scope="page")
    assert "$29" not in texts(page)  # filled from the product
    assert "calmer skin" in texts(page)  # bold words are rewritten with their sentence


def test_a_paragraph_redraft_takes_that_paragraph_even_when_edited_by_hand() -> None:
    lines = dump(PAGE)
    number = next(f for f in lines if f.text == "A serum for").id
    from app.engines import paragraphs

    block = next(p.number for p in paragraphs.paragraphs(PAGE) if number in p.fragment_ids)
    chosen, kept = engine.targets(
        PAGE,
        lines,
        scope="paragraph",
        block=block,
        edited={"A serum for calmer skin every morning."},
    )
    assert texts(chosen) == ["A serum for", "calmer skin", "every morning."] and kept == 0


def test_unwritten_lines_are_the_ones_still_in_the_template_words() -> None:
    page = PAGE.replace("Is it gentle on skin?", "A question?")
    chosen, _ = engine.targets(
        page, dump(page), scope="unwritten", template_texts={f.text for f in dump(TEMPLATE)}
    )
    assert "A question?" in texts(chosen)  # and the template's own short words ("Only")
    assert "Glow in seven days" not in texts(chosen) and "Yes, for every skin." not in texts(chosen)


def test_budgets_come_from_the_template_where_a_section_still_lines_up() -> None:
    page, template = dump(PAGE), dump(TEMPLATE)
    budgets = engine.budgets(page, template, page, [])
    by_text = {f.text: budgets[f.id] for f in page}
    # The hero has the template's five lines: "Glow in seven days" gets the budget of
    # "Your headline goes here" (23 characters → 35), not of its own 18 characters (→ 30).
    assert by_text["Glow in seven days"] == 35
    # The FAQ has two lines where the template has one: their own lengths decide.
    assert by_text["Yes, for every skin."] == copy_rules.length_budget(page[-1], [])


def test_the_redraft_prompt_carries_the_note_and_the_lines() -> None:
    lines = dump(PAGE)
    budgets = {f.id: 50 for f in lines}
    prompt = copy_rules.redraft_prompt(lines[:2], lines, budgets, ' shorter, "playful" ')
    assert 'direction from the editor: "shorter, \\"playful\\""' in prompt
    assert '"id": "f0001"' in prompt and '"max_chars": 50' in prompt
    assert "direction" not in copy_rules.redraft_prompt(lines[:2], lines, budgets, None)


def test_mock_mode_marks_a_line_once() -> None:
    lines = dump(PAGE.replace("Glow in seven days", "[mock] Glow in seven days"))
    prompt = copy_rules.redraft_prompt(lines[:1], lines, {f.id: 80 for f in lines}, "[note]")
    reply = copy_rules.parse_reply(copy_rules.mock_reply(prompt))
    assert reply == {"f0001": "[mock] Glow in seven days"}


# ── through the API, with the job ─────────────────────────────────────────────


def run_redraft() -> dict[str, Any]:
    runner = Runner(get_settings(), kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, ["redraft"])
    assert claimed is not None
    runner.execute(claimed)
    return job_row(claimed.id)


def put_page(build: dict[str, Any], html: str) -> None:
    with transaction() as conn:
        row = conn.execute(
            "select working_html_path from builds where id = %(b)s", {"b": build["id"]}
        ).fetchone()
    assert row is not None
    storage.upload("builds", row["working_html_path"], html.encode(), "text/html", upsert=True)


@needs_db
def test_a_section_redraft_is_a_job_and_one_undoable_change(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    state = desk(client, user, finished)
    saved = edit(client, user, finished, state, "Yes, for every skin.", "Yes, all skin.")
    assert saved.status_code == 200, saved.text
    state = desk(client, user, finished)
    version = state["build"]["page_version"]
    started = post(client, user, finished, "redraft", base_version=version, scope="section",
                   section="faq", note="warmer")  # fmt: skip
    assert started.status_code == 200, started.text
    running = started.json()["redraft"]
    assert running["scope"] == "section" and running["section"] == "faq"

    # While it runs, the page's other changes wait, and a second redraft is refused.
    held = edit(client, user, finished, started.json(), "Glow in 7 days", "Glow fast")
    assert held.status_code == 422 and "being redrafted" in held.json()["detail"]
    again = post(client, user, finished, "redraft", base_version=version, scope="page")
    assert again.status_code == 422

    job = run_redraft()
    assert job["status"] == "succeeded", job["error"]
    # The question and the form's text; the answer was edited by hand, so it's kept.
    assert job["result"]["kept_edited"] == 1 and job["result"]["rewritten"] == 2
    state = desk(client, user, finished)
    assert state["redraft"] is None and state["build"]["page_version"] == version + 1
    assert fragment(state, "[mock] Is it gentle?")  # rewritten (the fake model marks it)
    assert fragment(state, "Yes, all skin.")  # edited by hand: kept
    assert fragment(state, "Glow in 7 days")  # another section: untouched
    assert state["snapshots"][0]["reason"].startswith("Redrafted ")
    with transaction() as conn:
        nodes = conn.execute(
            "select node from ledger_entries where build_id = %(b)s", {"b": finished["id"]}
        ).fetchall()
    assert nodes and {n["node"] for n in nodes} == {"redraft"}

    undone = post(client, user, finished, "undo", base_version=version + 1)
    assert undone.status_code == 200 and fragment(undone.json(), "Is it gentle?")


@needs_db
def test_a_redraft_is_not_saved_over_a_page_that_changed(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    state = desk(client, user, finished)
    started = post(client, user, finished, "redraft",
                   base_version=state["build"]["page_version"], scope="page")  # fmt: skip
    assert started.status_code == 200, started.text
    with transaction() as conn:  # as if another tab had saved before the job ran
        conn.execute(
            "update builds set page_version = page_version + 1 where id = %(b)s",
            {"b": finished["id"]},
        )
    job = run_redraft()
    assert job["status"] == "failed" and job["error"]["code"] == "page_changed"


@needs_db
def test_redrafting_the_unwritten_lines_clears_the_copy_error(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    state = desk(client, user, finished)
    refused = post(client, user, finished, "redraft",
                   base_version=state["build"]["page_version"], scope="unwritten")  # fmt: skip
    assert refused.status_code == 422  # nothing was left unwritten

    with transaction() as conn:
        template = conn.execute(
            "select t.html_path from builds b join templates t on t.id = b.template_id "
            "where b.id = %(b)s",
            {"b": finished["id"]},
        ).fetchone()
        assert template is not None
        error = "1 of 2 parts of the copy couldn't be rewritten."
        conn.execute(
            "update builds set report = %(r)s where id = %(b)s",
            {"r": Jsonb({"copy": {"error": error}, "warnings": [error, "Other"]}),
             "b": finished["id"]},
        )  # fmt: skip
    put_page(finished, storage.download("library", template["html_path"]).decode())
    state = desk(client, user, finished)
    started = post(client, user, finished, "redraft",
                   base_version=state["build"]["page_version"], scope="unwritten")  # fmt: skip
    assert started.status_code == 200, started.text
    job = run_redraft()
    assert job["status"] == "succeeded", job["error"]
    assert job["result"]["rewritten"] > 0
    with transaction() as conn:
        row = conn.execute(
            "select report from builds where id = %(b)s", {"b": finished["id"]}
        ).fetchone()
    assert row is not None
    assert row["report"]["copy"]["error"] is None and row["report"]["warnings"] == ["Other"]


COLOURED = (
    '<html data-lp-palette="primary:#2f6fde;dark:#1d4ea6;tint:#eaf1fd;accent:#2f6fde">'
    "<head><style>.btn{background:#2f6fde;color:#fff}.box{background:#eaf1fd}</style></head>"
    '<body><section data-lp-section="hero"><h1>Glow in 7 days</h1>'
    '<a class="btn" href="#">Shop now</a></section></body></html>'
)
PLUM = {"primary": "#7a2e8f", "dark": "#4a1c57", "tint": "#f4eaf6", "accent": "#7a2e8f"}


@needs_db
def test_recolouring_the_page_is_an_undoable_change(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    put_page(finished, COLOURED)
    state = desk(client, user, finished)
    assert state["colors"]["page"]["primary"] == "#2f6fde"
    version = state["build"]["page_version"]
    same = post(client, user, finished, "recolor", base_version=version,
                colors=state["colors"]["page"])  # fmt: skip
    assert same.status_code == 422

    done = post(client, user, finished, "recolor", base_version=version, colors=PLUM)
    assert done.status_code == 200, done.text
    after = done.json()
    assert after["colors"]["page"] == PLUM
    assert after["snapshots"][0]["reason"] == "Recoloured the page"
    with transaction() as conn:
        row = conn.execute(
            "select working_html_path from builds where id = %(b)s", {"b": finished["id"]}
        ).fetchone()
    assert row is not None
    html = storage.download("builds", row["working_html_path"]).decode()
    assert "#7a2e8f" in html and "#2f6fde" not in html and "#f4eaf6" in html

    undone = post(client, user, finished, "undo", base_version=version + 1)
    assert undone.status_code == 200 and undone.json()["colors"]["page"]["primary"] == "#2f6fde"
