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


RANKED = (
    "<html><head><style>:root { --lp-primary: #ece9e2; --lp-primary-dark: #a39472; "
    "--lp-tint: #f5f3f0; --lp-accent: #ece9e2; --lp-on-accent: #111111; } "
    ".cta { background: var(--lp-accent); color: var(--lp-on-accent); } "
    ".chip { background: #ece9e2; } .stars { color: #f5a524; }</style></head><body>"
    '<section data-lp-section="hero"><h1>The best sneakers</h1>'
    '<span class="chip">Top pick</span><span class="stars">★★★★★</span>'
    '<a class="cta" data-lp-cta href="#">Shop Men</a></section></body></html>'
)


def test_lander_knows_which_colour_the_buttons_use_and_changes_only_that() -> None:
    """The owner's live case (ALL-5): buttons use the accent colour, primary and accent share
    a beige, and gold stars sit nearby. "Make the button black" must change the buttons and
    nothing else."""
    w = agent.Work(
        html=RANKED,
        rules={},
        colors=DeskPalette(primary="#ece9e2", dark="#a39472", tint="#f5f3f0", accent="#ece9e2"),
    )
    assert "On this page: buttons use the accent colour" in w.outline()
    out, failed, step = w.run(
        "recolor_page",
        {"primary": "#ece9e2", "dark": "#a39472", "tint": "#f5f3f0", "accent": "#000000"},
    )
    assert not failed and step.label == "Changed the accent colour (buttons)"
    assert "accent: #ece9e2 → #000000 (used by the buttons)" in out
    assert "primary: unchanged" in out
    tokens = w.html.split('id="lp-brand-tokens"')[1]
    assert "--lp-accent: #000000" in tokens and "--lp-on-accent: #ffffff" in tokens
    # Only the variable moved: colours written into the CSS (the chip, the stars) stay.
    assert ".chip { background: #ece9e2; }" in w.html and "#f5a524" in w.html
    # Changing the primary instead says plainly that the buttons don't use it.
    w2 = agent.Work(
        html=RANKED,
        rules={},
        colors=DeskPalette(primary="#ece9e2", dark="#a39472", tint="#f5f3f0", accent="#ece9e2"),
    )
    out, _, step = w2.run(
        "recolor_page",
        {"primary": "#000000", "dark": "#a39472", "tint": "#f5f3f0", "accent": "#ece9e2"},
    )
    assert step.label == "Changed the primary colour"
    assert "accent: unchanged, #ece9e2 (used by the buttons)" in out
    assert "#f5a524" in w2.html  # no sweep by hue


BYLINE = (
    "<html><head><style>.badge { display: block; padding: 4px 18px 4px 10px }</style></head>"
    '<body><section data-lp-section="hero"><h1>Glow</h1><div class="byline">'
    '<span class="name">Clara Bennett</span><div class="badge"><span>Verified</span></div>'
    "</div></section></body></html>"
)


def test_lander_inspects_styles_and_looks_at_a_box() -> None:
    """The owner's live ask (ALL-1): the Verified frame should hug its text with even padding."""
    shots: list[tuple[str, int]] = []

    def looker(html: str, selector: str, width: int) -> tuple[bytes, str | None]:
        shots.append((selector, width))
        assert "data-lp-look" in html
        return b"jpeg", "org/build/agent/look-1.jpg"

    w = agent.Work(html=BYLINE, rules={}, colors=None, looker=looker)
    out, failed, step = w.run("inspect_element", {"line": 3})
    assert not failed and "line 3, up 1: <div.badge>" in str(out)
    out, failed, step = w.run(
        "style_element",
        {
            "line": 3,
            "up": 1,
            "styles": {"width": "fit-content", "padding": "4px 10px", "position": "fixed"},
            "label": "Fitted the Verified box to its text",
        },
    )
    assert not failed and step.label == "Fitted the Verified box to its text"
    assert "Set width: fit-content; padding: 4px 10px." in str(out) and "position" in str(out)
    assert step.change == {
        "kind": "style",
        "label": "Fitted the Verified box to its text",
        "section": "Hero",
        "styles": {"width": "fit-content", "padding": "4px 10px"},
    }
    assert 'style="width: fit-content; padding: 4px 10px"' in w.html
    out, failed, step = w.run("look", {"line": 3, "view": "phone"})
    assert not failed and step.label == "Looked at Hero (phone)"
    assert step.image == "org/build/agent/look-1.jpg" and shots == [("[data-lp-look]", 390)]
    assert isinstance(out, list) and out[0]["type"] == "image"
    assert out[0]["source"]["media_type"] == "image/jpeg"
    # Without a renderer, looking says so instead of pretending.
    _, failed, step = agent.Work(html=BYLINE, rules={}, colors=None).run("look", {"line": 3})
    assert failed and step.label == "Couldn't look at Hero"


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
    assert "Request: Put them first" in turns[2]["content"][-1]["text"]
    assert script.calls[0]["tools"] == agent.TOOLS and script.calls[0]["cache"] is True
    assert len(conversation(client, user, finished)["messages"]) == 4


PIXEL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


@needs_db
def test_a_picture_goes_with_the_request_and_comes_back_in_the_conversation(
    client: TestClient, user: DbUser, finished: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    version = desk(client, user, finished)["build"]["page_version"]
    script = Script([{"type": "text", "text": "That's a reference picture; nothing to change."}])
    monkeypatch.setattr(anthropic, "generate", script)
    started = ask(client, user, finished, version, "Match this look", images=[PIXEL])
    assert started.status_code == 200, started.text
    bad = ask(client, user, finished, version, "Again", images=["data:text/html;base64,PGI+"])
    assert bad.status_code == 422
    job = run_agent()
    assert job["status"] == "succeeded", job["error"]
    first = script.calls[0]["messages"][-1]["content"]
    assert first[0]["type"] == "image" and first[0]["source"]["media_type"] == "image/png"
    assert "attached 1 picture" in first[-1]["text"]
    request = conversation(client, user, finished)["messages"][0]["content"]
    assert len(request["images"]) == 1 and request["images"][0].endswith(".png")
    assert request["image_urls"][0].startswith("http") and "token=" in request["image_urls"][0]


@needs_db
def test_recents_list_the_pages_conversations_and_replies_can_be_rated(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    version = desk(client, user, finished)["build"]["page_version"]
    first = ask(client, user, finished, version, "Warmer hero").json()
    run_agent()
    follow = ask(client, user, finished, version + 1, "Now shorter", thread_id=first["thread_id"])
    run_agent()
    second = ask(client, user, finished, version + 2, "Rewrite the FAQ").json()  # New chat
    run_agent()

    listed = client.get(
        f"/builds/{finished['id']}/agent/threads",
        params={"org_id": finished["org_id"]},
        headers=bearer(user),
    )
    assert listed.status_code == 200, listed.text
    threads = listed.json()["threads"]
    assert [(t["title"], t["requests"]) for t in threads] == [
        ("Rewrite the FAQ", 1),
        ("Warmer hero", 2),
    ]
    assert threads[0]["thread_id"] == second["thread_id"] and follow.status_code == 200

    def rate(**body: Any) -> Any:
        return client.post(
            f"/builds/{finished['id']}/agent/feedback",
            json={"org_id": finished["org_id"], "job_id": first["job_id"], **body},
            headers=bearer(user),
        )

    assert rate(rating="up").status_code == 200
    down = rate(rating="down", reasons=["changed_too_much"], note=" Too much at once ")
    assert down.status_code == 200, down.text
    reply = next(
        m
        for m in conversation_of(client, user, finished, first["thread_id"])["messages"]
        if m["role"] == "assistant" and m["job_id"] == first["job_id"]
    )
    assert reply["feedback"] == {
        "rating": "down",
        "reasons": ["changed_too_much"],
        "note": "Too much at once",
    }
    assert rate(rating=None).status_code == 200  # taken back
    assert rate(rating="sideways").status_code == 422
    unknown = client.post(
        f"/builds/{finished['id']}/agent/feedback",
        json={"org_id": finished["org_id"], "job_id": str(uuid.uuid4()), "rating": "up"},
        headers=bearer(user),
    )
    assert unknown.status_code == 404
    with transaction() as conn:
        row = conn.execute(
            "select feedback, feedback_at from agent_messages"
            " where job_id = %(j)s and role = 'assistant'",
            {"j": first["job_id"]},
        ).fetchone()
    assert row and row["feedback"] is None and row["feedback_at"] is None


def conversation_of(
    client: TestClient, user: DbUser, build: dict[str, Any], thread_id: str
) -> dict[str, Any]:
    response = client.get(
        f"/builds/{build['id']}/agent",
        params={"org_id": build["org_id"], "thread_id": thread_id},
        headers=bearer(user),
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


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
