"""`agent_turn` (BUILD_SPEC §11.3, B3.1c, D106): one request to Lander, the page editor's agent.

Claude (LP_MODEL_AGENT) works on a copy of the page in a tool-use loop within the request's budget:
rounds, money and time, whichever runs out first (B3.1f, D114; app/agent.py has the tools, the
prompt and the budget). Out of budget, it saves what it did and offers Keep going. Each thing it
does is a progress event the thread shows live: its plan, then a step per tool call (with the lines
before and after, so the change cards fill in as it goes), then its closing line. The result is
saved as one desk change, one undo step, and only if the page hasn't changed since the request;
nothing is saved if the request fails part-way. Stop (the user's) is checked between steps: what
Lander did by then is saved. The reply is kept in the conversation either way.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app import agent, desk, fidelity, image_ai, images
from app.config import get_settings
from app.db import transaction
from app.engines import comparison, image_edits, paragraphs
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


def _about(target: AgentTarget | None) -> str:
    """What the request is about, after its words: the whole page, a section, or one part of a
    section (B4.4: a line by its number, a picture by its number)."""
    if target is None:
        return "\n\n(The request is about the whole page.)"
    if target.part is None:
        return (
            f"\n\n(The user has {target.label} selected: section key {target.key}. The request "
            "is about it unless it says otherwise.)"
        )
    part = target.part
    where = (
        f"line {part.line}"
        if part.line is not None
        else f"picture {part.image}"
        if part.image is not None
        else "a video or embed"
    )
    return (
        f"\n\n(The user has one part of {target.label} selected: {part.name}, {where}, in "
        f"section key {target.key}. The request is about that part only unless it says "
        "otherwise; leave the rest of the page as it is.)"
    )


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
            if not p.locked
            and (target is None or p.section == target.key)
            and (target is None or target.part is None or target.part.line in (None, p.number))
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
        message = str(exc) if isinstance(exc, UserFacingError) else "Buddy couldn't finish that."
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
    # Said at once, so the thread shows a step before the page and brief have loaded (owner,
    # 2026-11-05: "Working on it…" sat alone for seconds).
    _event(ctx, "Reading the page…", "doing", phase="Reading", text="Reading the page…")
    changed_elsewhere = UserFacingError(
        "The page changed before Buddy finished, so nothing was saved. Ask again.",
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

    # The brief's inputs and the product's photos load side by side.
    def photos() -> list[str]:
        with transaction() as conn:
            return images._product_photos(conn, org_id, payload.build_id)

    with ThreadPoolExecutor(max_workers=2) as pool:
        loading_inputs = pool.submit(read_inputs, org_id, payload.build_id, template_html=False)
        loading_photos = pool.submit(photos)
        inputs, _ = loading_inputs.result()
        product_photos = loading_photos.result()

    def own_styles() -> dict[int, str]:
        """Images' styles from the page's oldest version: only an image reset needs them."""
        with transaction() as conn:
            return images.own_styles(conn, payload.build_id)

    brief = copy_pass.brief(
        inputs["template"],
        inputs["brand"],
        inputs["product"],
        inputs.get("wizard", {}),
        inputs.get("offer"),
    )
    report = build["report"] or {}
    looks = 0

    def look(page: str, selector: str, width: int) -> tuple[bytes, str | None]:
        """Lander looks (B3.1d): the page rendered in the guarded browser, one section pictured
        and kept beside the page so the thread can show it."""
        nonlocal looks
        try:
            picture = browser.screenshot_part(page, selector, width=width)
        except browser.NotShownError as exc:
            raise agent.PartNotShown(str(exc)) from exc
        looks += 1
        path = f"{org_id}/{payload.build_id}/{agent.FOLDER}/{job_id}-look-{looks}.jpg"
        try:
            storage.upload(desk.BUCKET, path, picture, "image/jpeg", upsert=True)
        except storage.StorageError:
            return picture, None
        return picture, path

    def make_picture(
        mode: str, number: int, prompt: str, refs: list[str], html: str
    ) -> tuple[str, UUID | None, bool]:
        """A picture for Lander (B3.2b): fal, or a free placeholder in mock mode; stored as one of
        the workspace's assets."""
        shown = next(i for i in image_edits.page_images(html) if i.number == number)
        width, height = image_ai.size_for(html, number)
        with node_context("image_studio"):
            data, mime, mock = image_ai.make(
                "edit" if mode == "edit" else "generate", prompt, shown.src, refs, width, height
            )
        asset = storage.store_asset(org_id, data, mime)
        return asset.url, asset.id, mock

    def start_match() -> str:
        """Match product everywhere (B3.2c): its job waits for this request to save, then checks
        the pictures and places the fixes as one change."""
        try:
            fidelity.start(org_id, payload.build_id, ctx.job.created_by)
        except desk.DeskEditError as exc:
            return f"Couldn't start it: {exc}"
        price = (
            "free placeholders in mock mode" if get_settings().lp_mock_images else "$0.15 a picture"
        )
        return (
            "Started. It checks every picture against the product photos, recreates the ones "
            f"that show a different product (up to 10, {price}) and puts them on the page as one "
            "change after this request is saved. Tell the user that, briefly."
        )

    work = agent.Work(
        html=html,
        rules=rules_by_key,
        colors=colors,
        author_type=(build["wizard"] or {}).get("author_type"),
        facts=comparison.facts_from_report(report),
        looker=look,
        product_photos=product_photos,
        own_styles_loader=own_styles,
        imager=make_picture,
        matcher=start_match,
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

    request = payload.text + _about(target)
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
    # The request's budget (B3.1f, D114): rounds, money and time, whichever runs out first.
    budget = agent.Budget.from_settings(get_settings())
    out_of_budget = False
    round_index = 0
    while True:
        if agent.stop_requested(org_id, job_id):
            stopped = True
            break
        if not budget.left(round_index):
            out_of_budget = True
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
        budget.spend(result.cost_usd)
        round_index += 1
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
        note = budget.note(round_index)
        if note:
            outputs.append({"type": "text", "text": note})
        messages.append({"role": "user", "content": outputs})

    if out_of_budget:
        closing = (
            f"I ran out of this request's budget ({budget.describe()}) before finishing. "
            + ("What I did is saved, and Undo takes it back. " if work.changes else "")
            + "Press Keep going and I'll carry on from here."
        )

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
                        asset_id=change.get("asset_id"), prompt=change.get("prompt"),
                    )  # fmt: skip
            if any(c.get("mock") for c in work.changes if c["kind"] == "image"):
                # A placeholder is on the page: the publish gate says so.
                conn.execute(
                    "update builds set mock_images = true where id = %(b)s", {"b": payload.build_id}
                )
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
        # It ran out of budget: the thread offers Keep going (B3.1f).
        "more": out_of_budget,
    }
