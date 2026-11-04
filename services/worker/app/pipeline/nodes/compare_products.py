"""`compare_products` (BUILD_SPEC §8.7, D103): a Top 5 ranking build's comparison, right after the
competitors are read. One AI call writes "Our take" for #2 to #5 (what stands out, and a fair
trade-off) and picks the points the table compares, citing for every line and cell the facts it
rests on; the page keeps those ids so the claims check can trace them (`engines.comparison`).
The Advertisement line and the disclosures are filled here too, with the brand and today's date.

If the call fails twice, the takes and the extra table columns are left out (the entries still
show their own facts) and the build goes on with a warning. Ranking builds only.
"""

import json
import time
from datetime import UTC, datetime
from typing import Any

import structlog

from app.competitors import own_names
from app.engines import comparison as engine
from app.engines.ranking import neutralise
from app.models.competitor import (
    Comparison,
    ComparisonAxis,
    ComparisonCell,
    Competitor,
    RankTake,
    Sourced,
)
from app.pipeline.runtime import PipelineContext, node, read_page, write_page
from app.pipeline.state import BuildState
from app.providers import anthropic

log = structlog.get_logger()
ATTEMPT_WAITS = (0, 3)

SYSTEM = (
    "You write the comparison for a Top 5 ranking page. The page is an advertisement from the "
    "brand whose product is #1, and says so. For each competitor (#2 and below) write two "
    "sentences: stands_out, what the product offers that a shopper may like; worth_knowing, a "
    "fair trade-off to weigh, such as a higher price than #1, no published rating, a shorter "
    "return window, or something its page doesn't say. Then choose three or four points to "
    "compare (axes) that most of the products' facts cover, such as materials, where it's made, "
    "returns, warranty or comfort features; not price or rating, which have their own columns. "
    "For every product, #1 included, give each point a cell of under six words, or exactly "
    '"Not stated" when its facts don\'t say.\n'
    "Rules: use only the facts given, each with an id. In sources, cite the id of every fact a "
    "sentence or cell rests on; a comparison with #1 cites #1's fact too. Every number you "
    "write must appear in a fact you cite. Never invent or estimate results, tests, awards, "
    "rankings, ratings or prices. Be fair and factual: no disparaging words (worst, cheap, poor, "
    "avoid), nothing about safety, quality, health or results that the facts don't say, and no "
    "superlative stated as fact. Call each competitor only by the label given, and the #1 "
    'product "our pick" (never "#1"). Plain words, no em dashes, under 30 words a sentence.'
)


def _digest(
    product: dict[str, Any], read: list[Competitor], facts: dict[int, list[engine.Fact]]
) -> str:
    products = [{"rank": 1, "label": product["name"], "facts": []}] + [
        {"rank": c.rank, "label": c.label, "facts": []} for c in read
    ]
    for item in products:
        item["facts"] = [{"id": f.id, "text": f.text} for f in facts.get(int(item["rank"]), [])]
    return json.dumps({"products": products}, ensure_ascii=False)


def _mock(read: list[Competitor], facts: dict[int, list[engine.Fact]]) -> str:
    """A reply in the real shape, built from the facts (mock mode: no call is made)."""

    def first(rank: int, *, skip_price: bool = False) -> engine.Fact | None:
        return next(
            (f for f in facts.get(rank, []) if not (skip_price and f.id.endswith(".price"))), None
        )

    takes = []
    for c in read:
        strength, price = first(c.rank, skip_price=True), first(c.rank)
        takes.append(
            {
                "rank": c.rank,
                "stands_out": {"text": f"(mock) {strength.text}" if strength else "",
                               "sources": [strength.id] if strength else []},
                "worth_knowing": {"text": f"(mock) {price.text}" if price else "",
                                  "sources": [price.id] if price else []},
            }
        )  # fmt: skip
    cells = []
    for rank in [1, *(c.rank for c in read)]:
        fact = first(rank, skip_price=True)
        text = fact.text if fact else engine.NOT_STATED
        cells.append({"rank": rank, "text": text, "sources": [fact.id] if fact else []})
    return json.dumps({"takes": takes, "axes": [{"name": "From the page", "cells": cells}]})


def _ask(prompt: str, mock_text: str) -> Comparison:
    last: Exception | None = None
    for wait in ATTEMPT_WAITS:
        if wait:
            time.sleep(wait)
        try:
            result = anthropic.generate(
                role="copy",
                ledger_kind="copy",
                system=SYSTEM,
                prompt=prompt,
                max_tokens=6000,
                effort="medium",
                json_schema=anthropic.strict_schema(Comparison),
                mock_text=mock_text,
            )
            return Comparison.model_validate(result.json())
        except anthropic.LLMRefusalError as exc:  # a refusal won't change on retry
            raise exc
        except Exception as exc:
            last = exc
            log.warning("comparison call failed", error=str(exc))
    assert last is not None
    raise last


def _neutral(comparison: Comparison, read: list[Competitor]) -> Comparison:
    """Neutral naming's backstop: a competitor's own name the reply let slip, in that
    competitor's own take or cells, becomes its label. Only there: a generic name ("Super
    Greens") must not turn up as a competitor's label in #1's cells or another's take."""
    own = {c.rank: (own_names(c.name, c.vendor, c.url), c.label) for c in read}

    def clean(text: str, rank: int) -> str:
        if rank not in own:
            return text
        names, label = own[rank]
        return neutralise(text, names, label)

    takes = [
        RankTake(
            rank=t.rank,
            stands_out=Sourced(text=clean(t.stands_out.text, t.rank), sources=t.stands_out.sources),
            worth_knowing=Sourced(
                text=clean(t.worth_knowing.text, t.rank), sources=t.worth_knowing.sources
            ),
        )
        for t in comparison.takes
    ]
    axes = [
        ComparisonAxis(
            name=a.name,
            cells=[
                ComparisonCell(rank=c.rank, text=clean(c.text, c.rank), sources=c.sources)
                for c in a.cells
            ],
        )
        for a in comparison.axes
    ]
    return Comparison(takes=takes, axes=axes)


@node("compare_products", "Compared the products")
def compare_products(state: BuildState, ctx: PipelineContext) -> dict[str, Any]:
    product, brand = state["product"], state["brand"]
    read = [
        Competitor.model_validate(c)
        for c in state.get("competitors") or []
        if c.get("status") == "pulled"
    ]
    naming = ((state.get("wizard") or {}).get("competitors") or {}).get("naming")
    facts = engine.facts_by_rank(product, [c.model_dump(mode="json") for c in read])
    warnings: list[str] = []
    try:
        reply = _ask(_digest(product, read, facts), _mock(read, facts))
        if naming != "real":
            reply = _neutral(reply, read)
        result = engine.tidy(reply, {1, *(c.rank for c in read)})
    except Exception as exc:
        log.warning("comparison left out", error=str(exc))
        result = Comparison(takes=[], axes=[])
        warnings.append(
            "The comparison couldn't be written, so the page leaves out 'Our take' and the extra "
            "table columns. Each entry still shows its own facts."
        )
    html, stats = engine.fill_comparison(read_page(state), result)
    html, disclosed = engine.fill_disclosures(html, brand["name"], datetime.now(UTC).date())
    if not disclosed["ad_label"] or not (disclosed["short"] or disclosed["full"]):
        warnings.append(
            "The template has no place for the Advertisement line or the disclosure, so the page "
            "doesn't say it's an ad. The claims check flags it."
        )
    return {
        **write_page(state, "compare_products", html),
        # The facts go with it: the claims check traces the page against them, and the report
        # keeps them for the review desk (D103).
        "comparison": {**result.model_dump(mode="json"), "facts": engine.facts_to_json(facts)},
        "_stats": {**stats, **disclosed},
        "_warnings": warnings,
        "_message": (
            f"Compared {len(read) + 1} products on {len(result.axes)} points"
            if result.axes
            else "Compared the products"
        ),
    }
