"""Phone layouts (BUILD_SPEC §11.2, B3.3b, D112): the phone rules in every build, the phone check,
Fix for phone, and Lander's phone-only styles."""

import json
import uuid
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import agent
from app.config import get_settings
from app.db import transaction
from app.engines import mobile, styling
from app.engines.finalize import finalize_common
from app.engines.html import parse
from app.fetch import browser
from app.providers import anthropic, storage
from tests.conftest import DbUser, job_row, needs_db
from tests.test_api import bearer, fake_jwks  # noqa: F401 (autouse fixture)
from tests.test_desk import desk
from tests.test_page_engines import INPUTS, PAGE

SIMPLE = (
    "<html><head><title>T</title></head><body>"
    '<section data-lp-section="hero"><div class="row" style="width: 600px">'
    "<h1>Glow</h1><p>Some words</p></div></section></body></html>"
)


# ── the stylesheets ───────────────────────────────────────────────────────────


def test_every_build_gets_the_phone_rules_once() -> None:
    out, stats = finalize_common(PAGE, INPUTS)
    assert stats["phone_rules"] is True and mobile.has_phone_rules(out)
    again = mobile.with_phone_rules(out)
    assert again.count(f'id="{mobile.RULES_ID}"') == 1
    rules = parse(out).find("style", attrs={"id": mobile.RULES_ID})
    assert rules is not None and "@media (max-width: 767px)" in rules.get_text()


def test_claudes_css_is_cleaned_and_wrapped_for_phones() -> None:
    css = """
      /* a note */
      @import url(evil.css);
      @media (max-width: 600px) { .row { width: auto } }
      .row { width: auto !important; flex-direction: column; background: url(x.png) }
      p { font-size: 15px; behavior: url(x.htc) }
      .x </style><script> { color: red }
    """
    clean, dropped = mobile.clean_css(css)
    assert ".row { width: auto; }" in clean
    assert ".row { width: auto !important; flex-direction: column; }" in clean
    assert "p { font-size: 15px; }" in clean
    assert "url(" not in clean and "@import" not in clean and "script" not in clean
    assert any("background" in d for d in dropped)
    fixed = mobile.with_phone_fixes(SIMPLE, css)
    style = parse(fixed).find("style", attrs={"id": mobile.FIXES_ID})
    assert style is not None and style.get_text().startswith("@media (max-width: 767px) {")
    assert ".row { width: auto !important" in mobile.phone_fixes(fixed)
    replaced = mobile.with_phone_fixes(fixed, "h1 { font-size: 28px }")
    assert mobile.phone_fixes(replaced) == "h1 { font-size: 28px; }"
    assert mobile.FIXES_ID not in mobile.with_phone_fixes(replaced, "")


def test_phone_only_styles_go_in_a_rule_by_class_and_leave_desktop_alone() -> None:
    target = styling.Target(line=1, up=1)
    html, _, _ = styling.apply_phone(SIMPLE, target, {"width": "auto", "gap": "8px"})
    row = parse(html).select_one("div.row")
    assert row is not None and "lp-p1" in (row.get("class") or [])
    assert row["style"] == "width: 600px"  # desktop as it was
    sheet = parse(html).find("style", attrs={"id": mobile.STYLES_ID})
    assert sheet is not None
    assert ".lp-p1 { width: auto !important; gap: 8px !important; }" in sheet.get_text()
    again, _, _ = styling.apply_phone(html, target, {"gap": "unset", "padding": "12px"})
    text = parse(again).find("style", attrs={"id": mobile.STYLES_ID}).get_text()  # type: ignore[union-attr]
    assert ".lp-p1 { width: auto !important; padding: 12px !important; }" in text
    assert again.count("lp-p1") == 2  # the class once, the rule once


# ── the phone check ───────────────────────────────────────────────────────────

MEASURED: dict[str, Any] = {
    "width": 390,
    "scroll_width": 600,
    "wide": [{"tag": "div", "text": "Glow", "section": "hero", "path": "div.row", "over": 210}],
    "small": [{"tag": "p", "text": "Tiny print here", "section": "faq", "path": "p", "size": 11}],
    "taps": [{"tag": "a", "text": "Buy", "section": "hero", "path": "a.btn", "height": 24}],
    "overlaps": [],
}


def test_the_phone_check_names_what_it_found() -> None:
    check = mobile.judge(MEASURED)
    assert not check.passed
    assert [(i.kind, i.count) for i in check.issues] == [("wide", 1), ("small_text", 1), ("tap", 1)]
    assert check.issues[0].detail == "Runs off the right edge by up to 210 px."
    assert check.issues[1].detail == "Some text is as small as 11 px on a phone."
    clean = mobile.judge({"width": 390, "scroll_width": 390})
    assert clean.passed and clean.issues == []


def test_lander_can_style_for_phones_only() -> None:
    work = agent.Work(html=SIMPLE, rules={}, colors=None)
    _, failed, step = work.run(
        "style_element",
        {
            "line": 1,
            "up": 1,
            "styles": {"width": "auto"},
            "label": "Let the row fit",
            "phone_only": True,
        },
    )
    assert not failed and step.label == "Let the row fit (on phones)"
    assert mobile.STYLES_ID in work.html and 'style="width: 600px"' in work.html


# ── Fix for phone, through the API ────────────────────────────────────────────


class Vision:
    """A scripted vision call: each reply is the next CSS and note."""

    def __init__(self, *replies: dict[str, str]) -> None:
        self.replies = list(replies)
        self.calls: list[dict[str, Any]] = []

    def __call__(self, **kwargs: Any) -> anthropic.LLMResult:
        self.calls.append(kwargs)
        return anthropic.LLMResult(
            text=json.dumps(self.replies.pop(0)), model="scripted", requested_model="scripted",
            input_tokens=0, output_tokens=0, cost_usd=Decimal(0), stop_reason="end_turn",
            fell_back=False, mock=True,
        )  # fmt: skip


def run_job(kind: str) -> dict[str, Any]:
    from app.jobs import queue
    from app.jobs.registry import KINDS
    from app.jobs.runner import Runner

    runner = Runner(get_settings(), kinds=KINDS, worker_id=f"test-{uuid.uuid4().hex[:6]}")
    claimed = queue.claim(runner.worker_id, 5, [kind])
    assert claimed is not None
    runner.execute(claimed)
    return job_row(claimed.id)


@needs_db
def test_fix_for_phone_writes_phone_css_in_two_rounds_as_one_undoable_change(
    client: TestClient, user: DbUser, finished: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    passing: dict[str, Any] = {"width": 390, "scroll_width": 390}
    looks = iter([MEASURED, MEASURED, passing])
    shown: list[str] = []

    def phone_look(html: str) -> tuple[list[bytes], dict[str, Any]]:
        shown.append(html)
        return [b"\xff\xd8jpeg"], next(looks)

    monkeypatch.setattr(browser, "phone_look", phone_look)
    vision = Vision(
        {"css": ".row { width: auto }", "note": "Let the row fit."},
        {
            "css": ".row { width: auto } p { font-size: 15px }",
            "note": "Let the row fit and made text readable.",
        },
    )
    monkeypatch.setattr(anthropic, "generate", vision)
    version = desk(client, user, finished)["build"]["page_version"]
    started = client.post(
        f"/builds/{finished['id']}/phone-fix",
        json={"org_id": finished["org_id"]},
        headers=bearer(user),
    )
    assert started.status_code == 200, started.text
    again = client.post(
        f"/builds/{finished['id']}/phone-fix",
        json={"org_id": finished["org_id"]},
        headers=bearer(user),
    )
    assert again.json()["job_id"] == started.json()["job_id"]  # one at a time per page

    job = run_job("mobile_optimize")
    assert job["status"] == "succeeded", job["error"]
    result = job["result"]
    assert result["page_version"] == version + 1
    assert result["note"] == "Let the row fit and made text readable."
    assert not result["before"]["passed"] and result["after"]["passed"]
    assert len(vision.calls) == 2  # fix, then check
    first = vision.calls[0]["messages"][0]["content"]
    assert first[0]["type"] == "image" and "Wider than the screen" in first[-1]["text"]
    assert "Page outline:" in first[-1]["text"]
    state = desk(client, user, finished)
    assert state["snapshots"][0]["reason"] == "Fixed the page for phones"
    with transaction() as conn:
        build = conn.execute(
            "select working_html_path from builds where id = %(b)s", {"b": finished["id"]}
        ).fetchone()
        queued = conn.execute(
            "select 1 from jobs where build_id = %(b)s and kind = 'qa' and status = 'queued'",
            {"b": finished["id"]},
        ).fetchone()
    assert build is not None and queued is not None  # new screenshots of the fixed page
    page = storage.download("builds", build["working_html_path"]).decode()
    assert mobile.has_phone_rules(page)
    assert mobile.phone_fixes(page) == ".row { width: auto; }\n  p { font-size: 15px; }"
