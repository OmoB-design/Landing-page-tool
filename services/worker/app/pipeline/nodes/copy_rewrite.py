"""`copy_rewrite` (BUILD_SPEC §10.3): every rewritable fragment is rewritten by Claude in the
brand's voice, 40 fragments per call, up to 4 calls at once.

- Each chunk gets 3 attempts (waits of 2 s and 6 s); a chunk that still fails keeps the
  template's text and sets `copy.error`, which blocks publish; it never fails the build (D23).
- Over-budget replacements get up to two shortening passes; still too long → a warning.
- Strict mode (clones): substantial fragments that came back unchanged get up to two re-prompts.
- Locked slots, structural labels and `data-lp-lock` text are never changed; reinjection
  checks each node still holds its original text (drift).
"""

import contextvars
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any

import structlog

from app.config import get_settings
from app.engines import copy_rules as rules
from app.engines.finalize import fill_names
from app.engines.fragments import dump, reinject
from app.models.template import LengthCap
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState
from app.providers import anthropic

log = structlog.get_logger()
MAX_PARALLEL = 4
ATTEMPT_WAITS = (0, 2, 6)
SHORTENING_PASSES = 2
STRICT_PASSES = 2
MAX_OUTPUT_TOKENS = 8000
REVIEW_LIMIT = 300


def _ask(system: str, prompt: str) -> dict[str, str]:
    """One call with up to three attempts. Raises the last error if all fail."""
    last: Exception | None = None
    for wait in ATTEMPT_WAITS:
        if wait:
            time.sleep(wait)
        try:
            result = anthropic.generate(
                role="copy",
                ledger_kind="copy",
                system=system,
                prompt=prompt,
                max_tokens=MAX_OUTPUT_TOKENS,
                json_schema=rules.REPLY_SCHEMA,
                mock_text=rules.mock_reply(prompt),
            )
            mapping = rules.parse_reply(result.text)
            if mapping:
                return mapping
            last = ValueError("The reply had no replacements.")
        except anthropic.LLMRefusalError as exc:  # a refusal won't change on retry
            raise exc
        except Exception as exc:
            last = exc
            log.warning("copy call failed", error=str(exc))
    assert last is not None
    raise last


def _parallel(calls: list[Callable[[], dict[str, str]]]) -> list[dict[str, str] | Exception]:
    """Runs calls up to four at once. Each runs in a copy of this thread's context, so its
    ledger rows are attributed to this build and node."""
    if not calls:
        return []
    with ThreadPoolExecutor(max_workers=min(MAX_PARALLEL, len(calls))) as pool:
        futures = [pool.submit(contextvars.copy_context().run, call) for call in calls]
        results: list[dict[str, str] | Exception] = []
        for future in futures:
            try:
                results.append(future.result())
            except Exception as exc:
                results.append(exc)
    return results


@node("copy_rewrite", "Rewrote the copy")
def copy_rewrite(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    brand, product, template = state["brand"], state["product"], state["template"]
    html = fill_names(read_page(state), brand_name=brand["name"], product_name=product["name"])
    # Slots finalize will fill or remove anyway: selling points (when the product has some) and
    # the promo line (replaced by the brand's promo text, or removed when there's no sale).
    extra: list[str] = ["data-lp-usp-text"] if product["usps"] else []
    if brand["promo_text"] or not brand["sale_percent"]:
        extra.append("data-lp-promo")
    fragments = dump(html, extra_locked=tuple(extra))
    targets = rules.rewritable(fragments)
    instructions = template["instructions"]
    caps = [LengthCap.model_validate(c) for c in instructions.get("length_caps", [])]
    budgets = {f.id: rules.length_budget(f, caps) for f in targets}
    strict = state["origin"] == "cloned"
    brief = rules.CopyBrief(
        brand_name=brand["name"],
        product_name=product["name"],
        language=brand["language"],
        product_facts={
            "price": product["sale_price"] or product["price"],
            "currency": product["currency"],
            "description": product["description"],
            "selling_points": product["usps"],
            "specs": product["specs"],
            "selling_context": product["selling_context"],
            "options": [v["name"] for v in product["variants"][:12]],
        },
        voice=brand["voice"],
        brand_md=brand["brand_md"],
        brand_context=brand["brand_context"],
        voice_examples=brand["voice_examples"],
        cta=brand["cta_text"],
        targeting=rules.targeting_block(state.get("wizard", {})),
        template_type=template["type"],
        template_rules=instructions.get("copy_rules", ""),
    )
    system = rules.system_prompt(brief)

    # 1. Draft, chunk by chunk.
    chunk_list = rules.chunks(targets)
    results = _parallel(
        [
            partial(_ask, system, rules.chunk_prompt(chunk, fragments, budgets))
            for chunk in chunk_list
        ]
    )
    replacements: dict[str, str] = {}
    failed = 0
    for result in results:
        if isinstance(result, Exception):
            failed += 1
        else:
            replacements.update(result)
    by_id = {f.id: f for f in targets}
    replacements = {k: v for k, v in replacements.items() if k in by_id}
    warnings: list[str] = []

    # 2. Strict mode: substantial fragments that came back unchanged get re-prompted.
    for _ in range(STRICT_PASSES if strict else 0):
        unchanged = [by_id[i] for i in rules.strict_candidates(targets, replacements)]
        if not unchanged:
            break
        for retry in _parallel(
            [
                partial(_ask, system, rules.strict_prompt(chunk, budgets))
                for chunk in rules.chunks(unchanged)
            ]
        ):
            if not isinstance(retry, Exception):
                replacements.update({k: v for k, v in retry.items() if k in by_id})

    # 3. Shortening passes for replacements over their budget.
    for _ in range(SHORTENING_PASSES):
        over = [
            (by_id[k], v, budgets[k])
            for k, v in replacements.items()
            if len(v.strip()) > budgets[k]
        ]
        if not over:
            break
        for short in _parallel(
            [
                partial(_ask, system, rules.shorten_prompt(batch))
                for batch in [
                    over[i : i + rules.CHUNK_SIZE] for i in range(0, len(over), rules.CHUNK_SIZE)
                ]
            ]
        ):
            if not isinstance(short, Exception):
                replacements.update({k: v for k, v in short.items() if k in by_id})
    too_long = [k for k, v in replacements.items() if len(v.strip()) > budgets[k]]
    if too_long:
        warnings.append(
            f"{len(too_long)} {'line is' if len(too_long) == 1 else 'lines are'} longer than the "
            "template allows; check them on the page."
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
        f"{failed} of {len(chunk_list)} parts of the copy couldn't be rewritten, so they keep the "
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
        "chunks": len(chunk_list),
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
