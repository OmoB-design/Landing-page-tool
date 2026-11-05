"""`agent_turn` (BUILD_SPEC §11.3, B3.1c, D106): one request to Lander, the page editor's agent.

Claude (LP_MODEL_AGENT) works on a copy of the page in a tool-use loop of up to 8 rounds
(app/agent.py has the tools and the prompt). Each thing it does is a progress event the thread
shows live: its plan, then a step per tool call (with the lines before and after, so the change
cards fill in as it goes), then its closing line. The result is saved as one desk change, one
undo step, and only if the page hasn't changed since the request; nothing is saved if the request
fails part-way. Stop (the user's) is checked between steps: what Lander did by then is saved.
The reply is kept in the conversation either way.
"""

import time
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app import agent, desk, images
from app.db import transaction
from app.engines import comparison, paragraphs
from app.fetch import browser
from app.jobs.context import JobContext
from app.jobs.errors import JobInterrupted, UserFacingError
from app.models.agent import REQUEST_MAX, AgentTarget
from app.pipeline import copy_pass
from app.pipeline.nodes.load_inputs import read_inputs
from app.providers import anthropic, storage
from app.providers.ledger import node_context

MAX_OUTPUT_TOKENS = 4096


class AgentPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    build_id: UUID
    base_version: int = Field(ge=1)
    thread_id: UUID
    message_id: UUID
    text: str = Field(min_length=1, max_length=REQUEST_MAX)
    target: AgentTarget | None = None
    # The request's pictures, stored beside the page (B3.1d).
    images: list[str] = Field(default_factory=list)


def dedupe_key(payload: AgentPayload) -> str:
    return f"redraft:{payload.build_id}"


def _event(ctx: JobContext, message: str, kind: str, **data: Any) -> None:
    ctx.progress(message, data={"agent": {"type": kind, **data}})


def _mock_blocks(
    round_index: int, work: agent.Work, target: AgentTarget | None
) -> list[dict[str, Any]]:
    """Mock mode (LP_MOCK_LLM=1): a scripted plan, one line marked as rewritten, a closing line;
    enough to see the thread work without paying for Claude."""
    if round_index > 0:
        return [{"type": "text", "text": "Done. In mock mode I marked one line as rewritten."}]
    line = next(
        (
            p
            for p in paragraphs.paragraphs(work.html)
            if not p.locked and (target is None or p.section == target.key)
        ),
        None,
    )
    plan = {"type": "text", "text": "I'll rewrite one line (mock mode)."}
    if line is None:
        return [plan]
    return [
        plan,
        {
            "type": "tool_use",
            "id": "mock_1",
            "name": "edit_lines",
            "input": {"edits": [{"number": line.number, "text": f"{line.text} (mock)"}]},
        },
    ]


def run(ctx: JobContext) -> dict[str, Any]:
    payload = AgentPayload.model_validate(ctx.job.payload)
    job_id, user_id = ctx.job.id, ctx.job.created_by
    started = time.monotonic()
    reply: dict[str, Any] = {"state": "working", "plan": None, "steps": [], "changes": []}
    try:
        result = _run(ctx, payload, reply)
    except JobInterrupted:
        raise  # the worker is stopping: the job runs again elsewhere (nothing was saved)
    except Exception as exc:
        message = str(exc) if isinstance(exc, UserFacingError) else "Lander couldn't finish that."
        agent.save_reply(
            payload.build_id,
            payload.thread_id,
            job_id,
            user_id,
            {**reply, "state": "failed", "error": message, "changes": [], "took": _took(started)},
        )
        raise
    agent.save_reply(
        payload.build_id, payload.thread_id, job_id, user_id, {**result, "took": _took(started)}
    )
    return result


def _took(started: float) -> int:
    return max(1, round(time.monotonic() - started))


def _run(ctx: JobContext, payload: AgentPayload, reply: dict[str, Any]) -> dict[str, Any]:
    org_id, job_id = ctx.job.org_id, ctx.job.id
    changed_elsewhere = UserFacingError(
        "The page changed before Lander finished, so nothing was saved. Ask again.",
        code="page_changed",
    )
    try:
        with transaction() as conn:
            build = desk._load(conn, org_id, payload.build_id)
            rules_by_key = desk._rules(conn, build["template_id"])
            html = desk._page(build)
            colors = desk._colors(conn, build, html).page
    except desk.DeskNotFoundError as exc:
        raise UserFacingError("That page isn't there any more.", code="build_missing") from exc
    if build["status"] not in desk.EDITABLE or build["page_version"] != payload.base_version:
        raise changed_elsewhere

    inputs, _ = read_inputs(org_id, payload.build_id, template_html=False)
    with transaction() as conn:
        product_photos = images._product_photos(conn, org_id, payload.build_id)
    brief = copy_pass.brief(
        inputs["template"], inputs["brand"], inputs["product"], inputs.get("wizard", {})
    )
    report = build["report"] or {}
    looks = 0

    def look(page: str, selector: str, width: int) -> tuple[bytes, str | None]:
        """Lander looks (B3.1d): the page rendered in the guarded browser, one section pictured
        and kept beside the page so the thread can show it."""
        nonlocal looks
        looks += 1
        picture = browser.screenshot_part(page, selector, width=width)
        path = f"{org_id}/{payload.build_id}/{agent.FOLDER}/{job_id}-look-{looks}.jpg"
        try:
            storage.upload(desk.BUCKET, path, picture, "image/jpeg", upsert=True)
        except storage.StorageError:
            return picture, None
        return picture, path

    work = agent.Work(
        html=html,
        rules=rules_by_key,
        colors=colors,
        author_type=(build["wizard"] or {}).get("author_type"),
        facts=comparison.facts_from_report(report),
        looker=look,
        product_photos=product_photos,
    )
    target = payload.target
    lines = len(paragraphs.paragraphs(html))
    sections = len(work.layout())
    first = agent.Step(
        f"Read the page: {agent.plural(lines, 'line')} in {agent.plural(sections, 'section')}",
        True,
    )
    reply["steps"].append(first.as_dict())
    _event(ctx, first.label, "step", **first.as_dict())

    request = payload.text + (
        f"\n\n(The user has {target.label} selected: section key {target.key}. The request is "
        "about it unless it says otherwise.)"
        if target
        else "\n\n(The request is about the whole page.)"
    )
    messages: list[dict[str, Any]] = [
        *agent.history(payload.build_id, payload.thread_id, payload.message_id),
        {
            "role": "user",
            "content": [
                *agent.image_blocks(payload.images),
                {
                    "type": "text",
                    "text": f"The page now:\n\n{work.outline()}\n\nRequest: {request}"
                    + (
                        f"\n\n(The user attached {agent.plural(len(payload.images), 'picture')}"
                        " above, for reference.)"
                        if payload.images
                        else ""
                    ),
                },
            ],
        },
    ]
    system = agent.system_prompt(brief)
    closing: str | None = None
    stopped = False
    for round_index in range(agent.MAX_ROUNDS):
        if agent.stop_requested(org_id, job_id):
            stopped = True
            break
        ctx.check_stopping()
        # What Lander is doing, for the thread's status line and running step (owner, 2026-11-05).
        _event(ctx, "Thinking…", "doing", phase="Thinking", text="Thinking…")
        try:
            with node_context("agent"):
                result = anthropic.generate(
                    role="agent",
                    ledger_kind="agent",
                    system=system,
                    messages=messages,
                    tools=agent.TOOLS,
                    cache=True,
                    max_tokens=MAX_OUTPUT_TOKENS,
                    mock_blocks=_mock_blocks(round_index, work, target),
                )
        except anthropic.LLMRefusalError as exc:
            raise UserFacingError(
                "Claude declined that request, so nothing changed.", code="refused"
            ) from exc
        calls = result.tool_calls()
        text = result.text.strip()
        if calls and text and reply["plan"] is None:
            reply["plan"] = text
            _event(ctx, text, "plan", text=text)
        if not calls:
            closing = text or None
            break
        messages.append({"role": "assistant", "content": list(result.blocks)})
        outputs: list[dict[str, Any]] = []
        for call in calls:
            if agent.stop_requested(org_id, job_id):
                stopped = True
                break
            phase, doing = work.doing(str(call["name"]), dict(call.get("input") or {}))
            _event(ctx, doing, "doing", phase=phase, text=doing)
            out, failed, step = work.run(str(call["name"]), dict(call.get("input") or {}))
            outputs.append(
                {
                    "type": "tool_result",
                    "tool_use_id": call["id"],
                    "content": out,
                    "is_error": failed,
                }
            )
            if call["name"] != "read_page" or failed:
                reply["steps"].append(step.as_dict())
                _event(ctx, step.label, "step", **step.as_dict(), image_url=agent.link(step.image))
        if stopped:
            break
        messages.append({"role": "user", "content": outputs})
    else:
        closing = (
            "I stopped after eight rounds of changes. "
            + ("What I did is saved, and you can undo it." if work.changes else "")
        ).strip()

    if stopped:
        closing = "Stopped. " + (
            f"I'd made {agent.plural(len(work.changes), 'change')} by then; "
            "they're saved, and Undo takes them back."
            if work.changes
            else "Nothing changed."
        )

    version: int | None = None
    reason: str | None = None
    if work.changes:
        _event(
            ctx,
            "Saving the page…",
            "doing",
            phase="Saving",
            text="Saving the page and checking the claims…",
        )
        work.settle_numbers()
        reason = work.reason()
        try:
            version = desk.save_redraft(
                org_id,
                payload.build_id,
                ctx.job.created_by,
                payload.base_version,
                work.html,
                reason,
                clear_copy_error=False,
            )
        except desk.DeskConflictError as exc:
            raise changed_elsewhere from exc
        # New pictures join their image's history (B3.2a), so the image studio can restore them.
        with transaction() as conn:
            for change in work.changes:
                if change["kind"] == "image" and change.get("before") is not None:
                    images.record(
                        conn, payload.build_id, change["number"], before=change["before"],
                        src=change["src"], source=change["source"],
                    )  # fmt: skip
        saved = agent.Step("Saved the page and checked the claims", True)
        reply["steps"].append(saved.as_dict())
        _event(ctx, saved.label, "step", **saved.as_dict())
    if closing:
        _event(ctx, closing, "closing", text=closing)
    return {
        "build_id": str(payload.build_id),
        "thread_id": str(payload.thread_id),
        "state": "stopped" if stopped else "done",
        "plan": reply["plan"],
        # Links for the pictures Lander looked at, for the thread while the page is open (the
        # saved conversation signs them again when it's loaded).
        "steps": [
            {**step, "image_url": agent.link(step["image"])} if step.get("image") else step
            for step in reply["steps"]
        ],
        "changes": work.changes,
        "closing": closing,
        "reason": reason,
        "page_version": version,
    }
