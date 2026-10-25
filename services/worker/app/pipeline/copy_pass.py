"""The copy pass's calls (BUILD_SPEC §10.3), shared by the build's `copy_rewrite` node and the
review desk's redraft job: 40 fragments per call, up to 4 calls at once, 3 attempts per call (waits
of 2 s and 6 s), strict re-prompts for clones, then up to two shortening passes for replacements
over their budget. What happens to the replacements (protection, reinjection) is the caller's.
"""

import contextvars
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import partial
from typing import Any

import structlog

from app.engines import copy_rules as rules
from app.engines.fragments import Fragment
from app.providers import anthropic

log = structlog.get_logger()
MAX_PARALLEL = 4
ATTEMPT_WAITS = (0, 2, 6)
SHORTENING_PASSES = 2
STRICT_PASSES = 2
MAX_OUTPUT_TOKENS = 8000


@dataclass
class PassResult:
    # Fragment id → replacement, for the targets only.
    replacements: dict[str, str]
    chunks: int
    # Chunks that failed all their attempts: their fragments keep their text.
    failed: int
    # Replacements still over their budget after the shortening passes.
    too_long: list[str]


def ask(system: str, prompt: str) -> dict[str, str]:
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


def parallel(calls: list[Callable[[], dict[str, str]]]) -> list[dict[str, str] | Exception]:
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


def extra_locked(brand: dict[str, Any], product: dict[str, Any]) -> tuple[str, ...]:
    """Slots the pipeline fills from data rather than the copy pass: selling points (when the
    product has some) and the promo line (the brand's promo text, or removed with no sale)."""
    extra: list[str] = ["data-lp-usp-text"] if product["usps"] else []
    if brand["promo_text"] or not brand["sale_percent"]:
        extra.append("data-lp-promo")
    return tuple(extra)


def brief(
    template: dict[str, Any],
    brand: dict[str, Any],
    product: dict[str, Any],
    wizard: dict[str, Any],
) -> rules.CopyBrief:
    """The copy brief from the build's inputs (load_inputs.read_inputs)."""
    instructions = template["instructions"]
    return rules.CopyBrief(
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
        targeting=rules.targeting_block(wizard),
        template_type=template["type"],
        template_rules=instructions.get("copy_rules", ""),
    )


def run(
    system: str,
    targets: list[Fragment],
    prompt_for: Callable[[list[Fragment]], str],
    budgets: dict[str, int],
    *,
    strict: bool,
) -> PassResult:
    """Drafts every target (`prompt_for` builds a chunk's prompt), re-prompts unchanged ones in
    strict mode, and shortens replacements over their budget."""
    chunk_list = rules.chunks(targets)
    replacements: dict[str, str] = {}
    failed = 0
    for result in parallel([partial(ask, system, prompt_for(chunk)) for chunk in chunk_list]):
        if isinstance(result, Exception):
            failed += 1
        else:
            replacements.update(result)
    by_id = {f.id: f for f in targets}
    replacements = {k: v for k, v in replacements.items() if k in by_id}

    for _ in range(STRICT_PASSES if strict else 0):
        unchanged = [by_id[i] for i in rules.strict_candidates(targets, replacements)]
        if not unchanged:
            break
        for retry in parallel(
            [
                partial(ask, system, rules.strict_prompt(chunk, budgets))
                for chunk in rules.chunks(unchanged)
            ]
        ):
            if not isinstance(retry, Exception):
                replacements.update({k: v for k, v in retry.items() if k in by_id})

    for _ in range(SHORTENING_PASSES):
        over = [
            (by_id[k], v, budgets[k])
            for k, v in replacements.items()
            if len(v.strip()) > budgets[k]
        ]
        if not over:
            break
        for short in parallel(
            [
                partial(ask, system, rules.shorten_prompt(batch))
                for batch in [
                    over[i : i + rules.CHUNK_SIZE] for i in range(0, len(over), rules.CHUNK_SIZE)
                ]
            ]
        ):
            if not isinstance(short, Exception):
                replacements.update({k: v for k, v in short.items() if k in by_id})
    too_long = [k for k, v in replacements.items() if len(v.strip()) > budgets[k]]
    return PassResult(
        replacements=replacements, chunks=len(chunk_list), failed=failed, too_long=too_long
    )
