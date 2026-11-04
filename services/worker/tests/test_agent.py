"""Lander, the page editor's agent (BUILD_SPEC §11.3, B3.1c, D106): its tools on a page, and a
request through the API and the job with a scripted model (D15: tests never call Claude)."""

import uuid
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import agent
from app.config import get_settings
from app.db import transaction
from app.engines import paragraphs
from app.jobs import queue
from app.jobs.kinds import agent_turn
from app.jobs.registry import KINDS
from app.jobs.runner import Runner
from app.models.agent import AgentTarget
from app.models.desk import DeskPalette
from app.providers import anthropic
from tests.conftest import DESK_PAGE, DbUser, job_row, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (autouse fixture)
from tests.test_desk import desk, edit

PAGE = DESK_PAGE.replace(
    "<p>Yes, for every skin.</p>",
    "<p>Yes, for every skin.</p><p><span data-lp-price>$29</span></p>",
)
RULES = {
    "hero": {"key": "hero", "label": "Hero", "removable": False, "duplicable": True},
    "faq": {"key": "faq", "label": "Questions", "removable": True, "duplicable": False},
}


def work(html: str = PAGE) -> agent.Work:
    colors = DeskPalette(primary="#112233", dark="#000000", tint="#f5f5f5", accent="#ff8800")
    return agent.Work(html=html, rules=RULES, colors=colors)


def number(w: agent.Work, text: str) -> int:
    return next(p.number for p in paragraphs.paragraphs(w.html) if p.text == text)


# ── the tools ─────────────────────────────────────────────────────────────────


def test_lander_reads_the_page_by_section_with_numbered_lines() -> None:
    outline = work().outline()
    assert "1. hero (Hero): can be copied" in outline
    assert "2. faq (Questions): can be removed" in outline
    assert "Colours: primary #112233" in outline
    assert "[Hero]\n1: Glow in 7 days" in outline
    assert "(data) $29" in outline  # a line filled from data, marked so Claude leaves it


def test_lander_edits_lines_by_the_desks_rules() -> None:
    w = work()
    out, failed, step = w.run(
        "edit_lines",
        {
            "edits": [
                {"number": number(w, "Glow in 7 days"), "text": "Calmer skin in a week"},
                {"number": number(w, "$29"), "text": "$19"},  # filled from data
                {"number": number(w, "Is it gentle?"), "text": "Is it gentle?</br>"},  # markup
                {"number": number(w, "Yes, for every skin."), "text": "Yes, for every skin."},
            ]
        },
    )
    assert not failed and step.ok
    assert step.label == "Rewrote 1 line in Hero"
    assert "filled from the brand or product" in out and "plain text only" in out
    assert "already reads that way" in out
    assert step.change and step.change["lines"] == [
        {"number": 1, "before": "Glow in 7 days", "after": "Calmer skin in a week"}
    ]
    assert "Calmer skin in a week" in w.html and "$29" in w.html
    # Nothing it may change: a failed step, and the page as it was.
    out, failed, step = work().run("edit_lines", {"edits": [{"number": 99, "text": "Hi"}]})
    assert failed and not step.ok and "no line 99" in out


def test_lander_moves_copies_and_removes_sections_by_the_templates_rules() -> None:
    w = work()
    out, failed, step = w.run("move_section", {"key": "faq", "position": 1})
    assert not failed and step.label == "Moved Questions up"
    assert "Sections, top to bottom:\n1. faq" in out  # the new order and numbers come back
    out, failed, step = w.run("remove_section", {"key": "hero"})
    assert failed and "can't be removed" in out
    out, failed, step = w.run("duplicate_section", {"key": "hero"})
    assert not failed and [s.key for s in w.layout()] == ["faq", "hero", "hero-2"]
    out, failed, step = w.run("duplicate_section", {"key": "nope"})
    assert failed and "no section nope" in out
    assert w.reason() == "Lander: moved Questions up and 1 more change"


def test_lander_recolours_and_checks_claims() -> None:
    w = work(PAGE.replace("<body>", '<body style="color:#112233">'))
    out, failed, step = w.run(
        "recolor_page",
        {"primary": "#AA0000", "dark": "#111111", "tint": "#fafafa", "accent": "#00aa00"},
    )
    assert not failed and step.change and step.change["after"]["primary"] == "#aa0000"
    assert w.colors and w.colors.primary == "#aa0000"
    out, failed, step = w.run("check_claims", {"text": "Clinically proven to cure acne."})
    assert not failed and "Flagged" in out and step.label.startswith("Checked the wording: ")
    out, failed, step = w.run("check_claims", {"text": "A gentle serum for every morning."})
    assert out == "Nothing flagged." and step.label == "Checked the wording: nothing flagged"


def test_edited_lines_are_renumbered_after_sections_move() -> None:
    w = work()
    w.run("edit_lines", {"edits": [{"number": number(w, "Is it gentle?"), "text": "Gentle?"}]})
    w.run("move_section", {"key": "faq", "position": 1})
    w.settle_numbers()
    assert w.changes[0]["lines"][0]["number"] == number(w, "Gentle?") == 1


def test_mock_mode_marks_one_line_of_the_target() -> None:
    blocks = agent_turn._mock_blocks(0, work(), AgentTarget(key="faq", label="Q"))
    call = next(b for b in blocks if b["type"] == "tool_use")
    assert call["input"]["edits"][0]["text"] == "Is it gentle? (mock)"
    assert agent_turn._mock_blocks(1, work(), None)[0]["type"] == "text"


# ── a request, through the API and the job ────────────────────────────────────


def run_agent() -> dict[str, Any]:
    runner = Runner(get_settings(), kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, ["agent_turn"])
    assert claimed is not None
    runner.execute(claimed)
    return job_row(claimed.id)


def ask(
    client: TestClient, user: DbUser, build: dict[str, Any], version: int, text: str, **more: Any
) -> Any:
    return client.post(
        f"/builds/{build['id']}/agent",
        json={"org_id": build["org_id"], "base_version": version, "text": text, **more},
        headers=bearer(user),
    )


def conversation(client: TestClient, user: DbUser, build: dict[str, Any]) -> dict[str, Any]:
    response = client.get(
        f"/builds/{build['id']}/agent", params={"org_id": build["org_id"]}, headers=bearer(user)
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


class Script:
    """A scripted Claude: each call returns the next reply's blocks (or raises)."""

    def __init__(self, *replies: list[dict[str, Any]] | Exception) -> None:
        self.replies = list(replies)
        self.calls: list[dict[str, Any]] = []

    def __call__(self, **kwargs: Any) -> anthropic.LLMResult:
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        text = "".join(b.get("text", "") for b in reply if b["type"] == "text")
        return anthropic.LLMResult(
            text=text,
            model="scripted",
            requested_model="scripted",
            input_tokens=0,
            output_tokens=0,
            cost_usd=Decimal(0),
            stop_reason="tool_use" if any(b["type"] == "tool_use" for b in reply) else "end_turn",
            fell_back=False,
            mock=True,
            blocks=tuple(reply),
        )


def call(name: str, **args: Any) -> dict[str, Any]:
    return {"type": "tool_use", "id": f"t_{uuid.uuid4().hex[:6]}", "name": name, "input": args}


@needs_db
def test_a_request_is_a_job_and_one_undoable_change(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    state = desk(client, user, finished)
    version = state["build"]["page_version"]
    hero = next(s["label"] for s in state["layout"] if s["key"] == "hero")
    started = ask(client, user, finished, version, "Make the hero warmer", target_key="hero")
    assert started.status_code == 200, started.text
    body = started.json()
    assert body["desk"]["redraft"]["scope"] == "agent"
    assert body["desk"]["redraft"]["section"] == "hero"

    # While Lander works the page's other changes wait, and a second request is refused.
    held = edit(client, user, finished, body["desk"], "Glow in 7 days", "Glow fast")
    assert held.status_code == 422
    again = ask(client, user, finished, version, "And the FAQ")
    assert again.status_code == 422

    job = run_agent()  # mock mode: marks one line of the hero
    assert job["status"] == "succeeded", job["error"]
    result = job["result"]
    assert result["state"] == "done" and result["plan"] == "I'll rewrite one line (mock mode)."
    assert [c["label"] for c in result["changes"]] == [f"Rewrote 1 line in {hero}"]
    assert result["reason"] == f"Lander: rewrote 1 line in {hero}"

    state = desk(client, user, finished)
    assert state["build"]["page_version"] == version + 1 and state["redraft"] is None
    assert state["snapshots"][0]["reason"] == f"Lander: rewrote 1 line in {hero}"
    assert any(p["text"] == "Glow in 7 days (mock)" for p in state["paragraphs"])

    # The conversation keeps the request and the reply.
    thread = conversation(client, user, finished)
    assert thread["thread_id"] == body["thread_id"]
    user_turn, reply = thread["messages"]
    assert user_turn["role"] == "user" and user_turn["content"]["text"] == "Make the hero warmer"
    assert user_turn["content"]["target"] == {"key": "hero", "label": hero}
    assert reply["role"] == "assistant" and reply["content"]["state"] == "done"
    assert reply["job_id"] == body["job_id"]

    # One undo takes the whole request back.
    undone = client.post(
        f"/builds/{finished['id']}/undo",
        json={"org_id": finished["org_id"], "base_version": version + 1},
        headers=bearer(user),
    )
    assert undone.status_code == 200, undone.text
    assert any(p["text"] == "Glow in 7 days" for p in undone.json()["paragraphs"])


@needs_db
def test_stop_keeps_what_lander_did_and_follow_ups_see_the_conversation(
    client: TestClient, user: DbUser, finished: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    version = desk(client, user, finished)["build"]["page_version"]
    first = ask(client, user, finished, version, "Tidy the FAQ").json()
    run_agent()
    version += 1

    script = Script(
        [
            {"type": "text", "text": "I'll put the questions first and sharpen them."},
            call("move_section", key="faq", position=1),
            call("edit_lines", edits=[{"number": 1, "text": "Is it kind to skin?"}]),
        ],
        [{"type": "text", "text": "Never reached."}],
    )
    monkeypatch.setattr(anthropic, "generate", script)
    checks = iter([False, False, False, True])  # stop after both tools of the first round
    monkeypatch.setattr(agent, "stop_requested", lambda org, job: next(checks, True))

    follow = ask(client, user, finished, version, "Put them first", thread_id=first["thread_id"])
    assert follow.status_code == 200, follow.text
    assert follow.json()["thread_id"] == first["thread_id"]
    job = run_agent()
    assert job["status"] == "succeeded", job["error"]
    result = job["result"]
    assert result["state"] == "stopped" and result["closing"].startswith("Stopped. I'd made 2")
    assert [c["label"] for c in result["changes"]] == [
        "Moved Questions up",
        "Rewrote 1 line in Questions",
    ]
    assert result["changes"][1]["lines"][0]["number"] == 1  # renumbered on the saved page
    state = desk(client, user, finished)
    assert state["layout"][0]["key"] == "faq"
    assert state["snapshots"][0]["reason"] == "Lander: moved Questions up and 1 more change"

    # Claude saw the earlier request and reply before this one, then the page and the request.
    turns = script.calls[0]["messages"]
    assert turns[0] == {"role": "user", "content": "Tidy the FAQ"}
    assert turns[1]["role"] == "assistant" and "Rewrote 1 line" in turns[1]["content"]
    assert "Request: Put them first" in turns[2]["content"]
    assert script.calls[0]["tools"] == agent.TOOLS and script.calls[0]["cache"] is True
    assert len(conversation(client, user, finished)["messages"]) == 4


@needs_db
def test_a_failed_request_saves_nothing_and_says_so(
    client: TestClient, user: DbUser, finished: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    version = desk(client, user, finished)["build"]["page_version"]
    script = Script(
        [
            {"type": "text", "text": "I'll shorten it."},
            call("edit_lines", edits=[{"number": 1, "text": "Glow"}]),
        ],
        RuntimeError("the API went away"),
    )
    monkeypatch.setattr(anthropic, "generate", script)
    ask(client, user, finished, version, "Shorter headline", target_key="hero")
    job = run_agent()
    assert job["status"] == "failed"
    state = desk(client, user, finished)
    assert state["build"]["page_version"] == version and state["redraft"] is None
    reply = conversation(client, user, finished)["messages"][-1]["content"]
    assert reply["state"] == "failed" and reply["error"] == "Lander couldn't finish that."
    assert reply["changes"] == [] and reply["plan"] == "I'll shorten it."

    # Stop with nothing running says so.
    stop = client.post(
        f"/builds/{finished['id']}/agent/stop",
        json={"org_id": finished["org_id"]},
        headers=bearer(user),
    )
    assert stop.status_code == 422 and "isn't working" in stop.json()["detail"]


@needs_db
def test_stop_marks_the_running_request(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    version = desk(client, user, finished)["build"]["page_version"]
    job_id = ask(client, user, finished, version, "Anything").json()["job_id"]
    stop = client.post(
        f"/builds/{finished['id']}/agent/stop",
        json={"org_id": finished["org_id"]},
        headers=bearer(user),
    )
    assert stop.status_code == 200 and stop.json() == {"stopping": True}, stop.text
    with transaction() as conn:
        row = conn.execute(
            "select cancel_requested_at from jobs where id = %(j)s", {"j": job_id}
        ).fetchone()
    assert row and row["cancel_requested_at"] is not None
    job = run_agent()  # it stops before asking Claude anything
    assert job["result"]["state"] == "stopped" and job["result"]["changes"] == []
    assert job["result"]["closing"] == "Stopped. Nothing changed."
