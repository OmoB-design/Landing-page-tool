"""Fix for phone (BUILD_SPEC §11.2, B3.3b, D112): Claude looks at the page at 390 px and the phone
check's findings, writes CSS that applies on phones only, and checks its work in a second round.

It's a job (`mobile_optimize`, one at a time per page, about 5 to 10 cents): the page stays
editable while it runs; the result lands on the page as it is then (the phone rules too, for a
page built before them) as one undoable desk change, and the preview check runs again. While
Lander or a redraft works on the page it waits for them.
"""

import base64
import json
import time
from collections.abc import Callable
from typing import Any
from uuid import UUID

import structlog

from app import desk, qa
from app.db import transaction
from app.engines import mobile
from app.engines.html import parse
from app.fetch import browser
from app.jobs import queue
from app.models.qa import QaStarted
from app.providers import anthropic
from app.providers.ledger import node_context

log = structlog.get_logger()
KIND = "mobile_optimize"
ROUNDS = 2
WAIT_SECONDS = 300
OUTLINE_LINES = 400

SYSTEM = """You fix landing pages for phones. You see the page at 390 px wide, top to bottom in \
slices, the phone check's findings (each with a CSS path to the element), and an outline of the \
page's markup (tags, classes and a little text).

Write CSS that makes the page work on a phone while keeping its design: stack side-by-side \
boxes, let fixed widths shrink (max-width: 100%, width: auto), make paragraph text at least 14 px \
and buttons at least 44 px tall, stop text overlapping, keep pictures inside the screen. Use the \
selectors in the paths and the outline (classes and data-lp-section attributes). Change only \
what needs it; don't restyle what already works. Your CSS is wrapped in a phone-only media query \
(narrower than 768 px) for you: write plain rules only, no media queries, @import, fonts or \
url(). Add !important only where an inline style would otherwise win.

Reply with the complete CSS to use (it replaces any earlier fixes) and one short sentence for \
the person, in plain words, saying what you changed. If nothing needs fixing, reply with empty \
CSS and say so."""

SCHEMA = {
    "type": "object",
    "properties": {"css": {"type": "string"}, "note": {"type": "string"}},
    "required": ["css", "note"],
    "additionalProperties": False,
}


def running(conn: Any, build_id: UUID) -> UUID | None:
    row = conn.execute(
        """
        select id from jobs where build_id = %(b)s and kind = %(k)s
          and status in ('queued', 'running')
        order by created_at desc limit 1
        """,
        {"b": build_id, "k": KIND},
    ).fetchone()
    return row["id"] if row else None


def start(org_id: UUID, build_id: UUID, user_id: UUID | None) -> QaStarted:
    """Fix for phone on the review desk: one at a time per page."""
    with transaction() as conn:
        build = desk._load(conn, org_id, build_id)
        if build["status"] not in desk.EDITABLE:
            raise desk.DeskEditError("The page can be fixed once it's built.")
        busy = running(conn, build_id)
        if busy is not None:
            return QaStarted(job_id=busy)
        job, _ = queue.enqueue(
            org_id=org_id,
            kind=KIND,
            payload={"build_id": str(build_id)},
            created_by=user_id,
            dedupe_key=f"phone:{build_id}",
            build_id=build_id,
            max_attempts=1,
            conn=conn,
        )
    return QaStarted(job_id=job.id)


def outline(html: str) -> str:
    """The page's markup as an indented outline (tags, ids, classes, data-lp-section, a little
    text), at most 400 lines: enough for Claude to write selectors."""
    soup = parse(html)
    body = soup.find("body") or soup
    lines: list[str] = []

    def walk(node: Any, depth: int) -> None:
        if len(lines) >= OUTLINE_LINES or depth > 10:
            return
        for child in getattr(node, "children", []):
            name = getattr(child, "name", None)
            if not name or name in ("script", "style", "noscript", "svg", "br"):
                continue
            classes = "".join(f".{c}" for c in (child.get("class") or [])[:3])
            ident = f"#{child['id']}" if child.get("id") else ""
            section = child.get("data-lp-section")
            mark = f'[data-lp-section="{section}"]' if section else ""
            own = " ".join(
                " ".join(str(t).split()) for t in child.find_all(string=True, recursive=False)
            ).strip()
            text = f" “{own[:50]}”" if own else ""
            lines.append(f"{'  ' * depth}{name}{ident}{classes}{mark}{text}")
            walk(child, depth + 1)

    walk(body, 0)
    return "\n".join(lines)


def _ask(
    slices: list[bytes], check: mobile.PhoneCheck, html: str, css: str, round_no: int
) -> dict[str, Any]:
    findings = (
        "\n".join(
            f"- {i.title} ({i.count}): {i.detail} "
            + "; ".join(f"“{e['text']}” at {e.get('path') or e.get('section')}" for e in i.examples)
            for i in check.issues
        )
        or "- The phone check found nothing; look for anything else that's broken."
    )
    task = (
        "Fix the page for phones."
        if round_no == 1
        else "This is the page with your CSS applied. Check it: keep what works, fix what "
        "doesn't, and reply with the complete CSS again."
    )
    text = (
        f"{task}\n\nPhone check findings:\n{findings}\n\nCSS applied so far:\n"
        f"{css or '(none)'}\n\nPage outline:\n{outline(html)}"
    )
    content: list[dict[str, Any]] = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": base64.b64encode(s).decode(),
            },
        }
        for s in slices
    ]
    content.append({"type": "text", "text": text})
    with node_context("mobile_optimize"):
        result = anthropic.generate(
            role="vision",
            ledger_kind="vision",
            system=SYSTEM,
            messages=[{"role": "user", "content": content}],
            json_schema=SCHEMA,
            max_tokens=4000,
            mock_text=json.dumps({"css": css or "", "note": "Mock mode: no changes made."}),
        )
    try:
        reply = json.loads(result.text)
    except json.JSONDecodeError:
        reply = {"css": css, "note": ""}
    return reply if isinstance(reply, dict) else {"css": css, "note": ""}


def fix(
    html: str, progress: Callable[[str], None]
) -> tuple[str, mobile.PhoneCheck, mobile.PhoneCheck, str]:
    """The page fixed for phones: the phone rules, then up to two rounds of Claude's CSS. Returns
    the CSS, the check before and after, and Claude's note."""
    base = mobile.with_phone_rules(html)
    css = mobile.phone_fixes(base)
    progress("Looking at the page on a phone")
    slices, measured = browser.phone_look(mobile.with_phone_fixes(base, css))
    before = check = mobile.judge(measured)
    note = ""
    for round_no in range(1, ROUNDS + 1):
        if check.passed and round_no > 1:
            break
        progress("Writing the phone fixes" if round_no == 1 else "Checking the fixes")
        reply = _ask(slices, check, base, css, round_no)
        new_css, _ = mobile.clean_css(str(reply.get("css") or ""))
        note = str(reply.get("note") or note)
        if new_css == css and round_no > 1:
            break
        css = new_css
        slices, measured = browser.phone_look(mobile.with_phone_fixes(base, css))
        check = mobile.judge(measured)
    return css, before, check, note


def apply(
    org_id: UUID,
    build_id: UUID,
    user_id: UUID | None,
    css: str,
    wait: Callable[[float], None],
) -> int:
    """The phone rules and fixes on the page as it is now, as one undoable change; returns the
    page's version. Waits while Lander or a redraft works on the page."""
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        with transaction() as conn:
            build = desk._load(conn, org_id, build_id, lock=True)
            if desk._redraft(conn, build_id) is None:
                if build["status"] not in desk.EDITABLE:
                    raise desk.DeskEditError("The page can't be changed now.")
                html = desk._page(build)
                new_html = mobile.with_phone_fixes(mobile.with_phone_rules(html), css)
                if new_html == html:
                    return int(build["page_version"])
                stale = desk._change(
                    conn, build, reason="Fixed the page for phones", user_id=user_id, html=new_html
                )
                version = int(build["page_version"]) + 1
                qa.enqueue(conn, org_id, build_id, user_id)  # new screenshots of the fixed page
                break
        if time.monotonic() > deadline:
            raise desk.DeskEditError("Buddy was still working on the page. Try again.")
        wait(3)
    desk._remove(stale)
    return version
