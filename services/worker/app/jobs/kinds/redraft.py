"""`redraft` (BUILD_SPEC §11.1, D86): the review desk's "Redraft all", "Redraft" on a section,
"Rewrite" on a line and "Redraft those lines" (the lines the build's copy pass couldn't write).

The copy pass runs again on the chosen lines of the finished page, with the build's brief and an
optional note from the editor: fresh words, the same jobs and facts. Locked lines, bold words,
links and data-filled parts stay; paragraphs edited by hand stay unless that paragraph was asked
for; the template's forbidden terms are purged again. A chunk that fails its three attempts keeps
its lines as they are (they are already the brand's copy). The result is saved as one desk change
(undoable), and only if the page hasn't changed since the redraft started.
"""

import re
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app import desk
from app.db import transaction
from app.engines import copy_rules as rules
from app.engines import redraft as engine
from app.engines.fragments import dump, reinject
from app.engines.purge import purge_terms
from app.jobs.context import JobContext
from app.jobs.errors import UserFacingError
from app.models.template import LengthCap
from app.pipeline import copy_pass
from app.pipeline.nodes.load_inputs import read_inputs
from app.providers.ledger import node_context

TOTAL = 3


class RedraftPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build_id: UUID
    base_version: int = Field(ge=1)
    scope: Literal["page", "section", "paragraph", "unwritten"]
    section: str | None = None
    block: int | None = None
    note: str | None = Field(default=None, max_length=200)


def dedupe_key(payload: RedraftPayload) -> str:
    return f"redraft:{payload.build_id}"


def _label(key: str | None, labels: dict[str, str]) -> str:
    if not key:
        return "the page"
    return labels.get(key) or re.sub(r"[-_]+", " ", key).strip().capitalize()


def _reason(payload: RedraftPayload, labels: dict[str, str], section: str | None) -> str:
    if payload.scope == "page":
        return "Redrafted the page"
    if payload.scope == "section":
        return f"Redrafted {_label(payload.section, labels)}"
    if payload.scope == "paragraph":
        return f"Rewrote a line in {_label(section, labels)}" if section else "Rewrote a line"
    return "Redrafted the lines the build couldn't write"


def run(ctx: JobContext) -> dict[str, Any]:
    payload = RedraftPayload.model_validate(ctx.job.payload)
    org_id = ctx.job.org_id
    changed_elsewhere = UserFacingError(
        "The page changed before the redraft finished, so the new words weren't saved.",
        code="page_changed",
    )
    try:
        with transaction() as conn:
            build = desk._load(conn, org_id, payload.build_id)
    except desk.DeskNotFoundError as exc:
        raise UserFacingError("That page isn't there any more.", code="build_missing") from exc
    if build["status"] not in desk.EDITABLE or build["page_version"] != payload.base_version:
        raise changed_elsewhere

    inputs, template_html = read_inputs(org_id, payload.build_id)
    template, brand, product = inputs["template"], inputs["brand"], inputs["product"]
    html = desk._page(build)
    fragments = dump(html, extra_locked=copy_pass.extra_locked(brand, product))
    template_fragments = dump(template_html)
    edited = set((build["report"] or {}).get("desk", {}).get("edited", []))
    targets, kept = engine.targets(
        html,
        fragments,
        scope=payload.scope,
        section=payload.section,
        block=payload.block,
        edited=edited,
        template_texts={f.text for f in template_fragments},
    )
    if not targets:
        raise UserFacingError(
            "Nothing to redraft there: those lines are filled from the brand or product, or "
            "you edited them by hand.",
            code="nothing_to_redraft",
        )
    instructions = template["instructions"]
    caps = [LengthCap.model_validate(c) for c in instructions.get("length_caps", [])]
    budgets = engine.budgets(fragments, template_fragments, targets, caps)
    system = rules.system_prompt(
        copy_pass.brief(template, brand, product, inputs.get("wizard", {}))
    )
    lines = f"{len(targets)} line{'' if len(targets) == 1 else 's'}"
    ctx.progress(f"Writing {lines}", data={"step": 1, "total": TOTAL})
    with node_context("redraft"):
        result = copy_pass.run(
            system,
            targets,
            lambda chunk: rules.redraft_prompt(chunk, fragments, budgets, payload.note),
            budgets,
            strict=False,
        )

    by_id = {f.id: f for f in targets}
    changed = {
        k: v
        for k, v in rules.protect(fragments, result.replacements).items()
        if v.strip() and v.strip() != by_id[k].text
    }
    if not changed:
        raise UserFacingError(
            "Claude couldn't redraft those lines, so they're as they were. Try again."
            if result.failed
            else "The new words came back the same, so nothing changed.",
            code="redraft_empty",
        )
    new_html, applied = reinject(
        html, changed, {f.id: f.text for f in fragments}, allow_empty=False
    )
    new_html, purge = purge_terms(new_html, instructions.get("forbidden_terms", []))
    drift = list(applied["drift"])  # type: ignore[call-overload]
    written = len(changed) - len(drift)
    ctx.progress(f"Wrote {written} of {lines}", data={"step": 2, "total": TOTAL})

    labels = desk.section_labels(org_id, payload.build_id)
    reason = _reason(payload, labels, targets[0].section)
    try:
        version = desk.save_redraft(
            org_id,
            payload.build_id,
            ctx.job.created_by,
            payload.base_version,
            new_html,
            reason,
            clear_copy_error=result.failed == 0 and payload.scope in ("page", "unwritten"),
        )
    except desk.DeskConflictError as exc:
        raise changed_elsewhere from exc
    ctx.progress("Saved the page", data={"step": 3, "total": TOTAL})
    return {
        "build_id": str(payload.build_id),
        "reason": reason,
        "rewritten": written,
        "eligible": len(targets),
        "kept_edited": kept,
        "failed_chunks": result.failed,
        "too_long": len(result.too_long),
        "purged": len(purge["purged_terms"]),  # type: ignore[arg-type]
        "page_version": version,
    }
