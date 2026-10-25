"""`copy_rewrite` (BUILD_SPEC §10.3): every rewritable fragment is rewritten by Claude in the
brand's voice, 40 fragments per call, up to 4 calls at once.

- Each chunk gets 3 attempts (waits of 2 s and 6 s); a chunk that still fails keeps the
  template's text and sets `copy.error`, which blocks publish; it never fails the build (D23).
- Over-budget replacements get up to two shortening passes; still too long → a warning.
- Strict mode (clones): substantial fragments that came back unchanged get up to two re-prompts.
- Locked slots, structural labels and `data-lp-lock` text are never changed; reinjection
  checks each node still holds its original text (drift).
"""

from typing import Any

from app.config import get_settings
from app.engines import copy_rules as rules
from app.engines.finalize import fill_names
from app.engines.fragments import dump, reinject
from app.models.template import LengthCap
from app.pipeline import copy_pass
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState

REVIEW_LIMIT = 300


@node("copy_rewrite", "Rewrote the copy")
def copy_rewrite(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    brand, product, template = state["brand"], state["product"], state["template"]
    html = fill_names(read_page(state), brand_name=brand["name"], product_name=product["name"])
    fragments = dump(html, extra_locked=copy_pass.extra_locked(brand, product))
    targets = rules.rewritable(fragments)
    instructions = template["instructions"]
    caps = [LengthCap.model_validate(c) for c in instructions.get("length_caps", [])]
    budgets = {f.id: rules.length_budget(f, caps) for f in targets}
    strict = state["origin"] == "cloned"
    system = rules.system_prompt(copy_pass.brief(template, brand, product, state.get("wizard", {})))

    # 1-3. Draft chunk by chunk, re-prompt unchanged lines (strict), shorten long ones.
    result = copy_pass.run(
        system,
        targets,
        lambda chunk: rules.chunk_prompt(chunk, fragments, budgets),
        budgets,
        strict=strict,
    )
    replacements, failed = result.replacements, result.failed
    by_id = {f.id: f for f in targets}
    warnings: list[str] = []
    if result.too_long:
        count = len(result.too_long)
        warnings.append(
            f"{count} {'line is' if count == 1 else 'lines are'} longer than the template allows; "
            "check them on the page."
        )

    # 4. Protect, then write back.
    replacements = rules.protect(fragments, replacements)
    changed = {k: v for k, v in replacements.items() if v.strip() != by_id[k].text}
    new_html, applied = reinject(
        html, changed, {f.id: f.text for f in fragments}, allow_empty=strict
    )
    drift = list(applied["drift"])  # type: ignore[call-overload]
    rewritten = len(changed) - len(drift)
    ratio = round(rewritten / len(targets), 3) if targets else 1.0
    if strict:
        long_ones = [f for f in targets if f.chars >= 40]
        done = sum(1 for f in long_ones if f.id in changed)
        if long_ones and done < len(long_ones) / 2:
            warnings.append("Less than half of the longer lines were rewritten.")
    error = (
        f"{failed} of {result.chunks} parts of the copy couldn't be rewritten, so they keep the "
        "template's text. Redraft them before publishing."
        if failed
        else None
    )
    copy = {
        "rewritten_ratio": ratio,
        "rewritten": rewritten,
        "eligible": len(targets),
        "fragments": len(fragments),
        "locked": len(fragments) - len(targets),
        "chunks": result.chunks,
        "failed_chunks": failed,
        "error": error,
        "warnings": warnings,
        "drift_warnings": drift,
        "strict": strict,
        "mock": get_settings().lp_mock_llm,
        "review": [
            {"original": by_id[k].text, "replacement": v, "where": by_id[k].context}
            for k, v in list(changed.items())[:REVIEW_LIMIT]
            if k not in drift
        ],
    }
    message = f"Rewrote {rewritten} of {len(targets)} lines" + (" (mock)" if copy["mock"] else "")
    return {
        **write_page(state, "copy_rewrite", new_html),
        "copy": copy,
        "_stats": {k: copy[k] for k in ("rewritten", "eligible", "failed_chunks", "chunks")},
        "_warnings": [*([error] if error else []), *warnings],
        "_message": message,
    }
