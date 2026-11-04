"""The Top 5 ranking's comparison (BUILD_SPEC §8.7, D103). Pure: facts, page and comparison in;
the filled page, stats or trace findings out.

**Facts** are everything the page may say about a product, each with an id: for #1 the brand's
own product data ("1.price", "1.u2" a selling point, "1.s3" a spec), for #2 to #5 what their own
pages said in B2.4a ("2.price", "2.rating", "2.summary", "2.c1" a claim, "2.r1" a review). The
AI's "Our take" lines and table cells cite the facts they rest on, and the page keeps those ids
(`data-lp-sources`), so the trace check can follow every competitor fact back to its page.

**Markup** (the template-onboarding skill lists it): in each competitor entry
`[data-lp-rank-take]` holding `[data-lp-rank-take-strength]` and `[data-lp-rank-take-caveat]`,
each with its `[data-lp-rank-take-text]`; in the comparison table `th[data-lp-compare-axis]` in
the header and `td[data-lp-compare-cell]` in every `tr[data-lp-rank-row]` (#1's row is
`data-lp-rank-row="1"`), cloned once per point compared. Rank cells are `[data-lp-rank-number]`.
The disclosures are `[data-lp-ad-label]` and `[data-lp-disclosure="short"|"full"]`, filled with
fixed wording, the brand and the date.
"""

import copy
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from bs4 import BeautifulSoup, Tag

from app.engines.compliance import Finding, scan
from app.engines.html import element_path, parse, serialize, set_text, text_nodes
from app.engines.money import format_price
from app.engines.ranking import shorten
from app.models.competitor import Comparison, ComparisonAxis, ComparisonCell

NOT_STATED = "Not stated"
MAX_AXES = 4
AXIS_CHARS = 28
CELL_CHARS = 48
TAKE_CHARS = 240
MAX_CLAIM_FACTS = 6
MAX_REVIEW_FACTS = 3
SNIPPET_CHARS = 140
# A number as written ("$1,203.50", "47%", "6-month"); not a rank ("#2") or part of a word.
NUMBER = re.compile(r"(?<![#\w.])\d[\d,]*(?:\.\d+)?")
# Price and rating have their own columns; an axis by that name would repeat them.
# Text the per-entry number check leaves alone: cited lines (their own rule), rank numbers,
# names (a real product or reviewer name may hold a number, "Capri 2", "Jenna, 34").
SKIP_ATTRS = (
    "data-lp-sources", "data-lp-number", "data-lp-rank-number", "data-lp-rank-name",
    "data-lp-rank-quote-author",
)  # fmt: skip
OWN_COLUMNS = {"price", "prices", "rating", "ratings", "rank", "product", "cost"}

AD_LABEL = "Advertisement · Paid content from {brand}"
SHORT = (
    "{brand} makes our #1 pick. Competitor prices, ratings and claims come from their own "
    "product pages, as of {date}."
)
FULL = (
    "Advertisement. This page is paid content from {brand}, the maker of our top pick, and isn't "
    "an independent review. We ranked the products ourselves. Competitor details were taken from "
    "their public product pages on {date} and may have changed since. Product names and "
    "trademarks belong to their owners."
)


@dataclass(frozen=True)
class Fact:
    id: str
    text: str


def _plain(value: Any) -> str | None:
    """A rating or count as the page writes it: Decimal("4.40") is "4.4", "5.00" is "5"."""
    if value is None or value == "":
        return None
    try:
        return f"{Decimal(str(value)).normalize():f}"
    except InvalidOperation:
        return None


def _price(item: dict[str, Any]) -> str | None:
    sale = item.get("sale_price")
    return format_price(sale if sale not in (None, "") else item.get("price"), item.get("currency"))


def product_facts(product: dict[str, Any]) -> list[Fact]:
    """#1: the brand's product as the build loaded it."""
    facts: list[Fact] = [Fact("1.name", f"Name: {product.get('name') or ''}".strip())]
    if price := _price(product):
        facts.append(Fact("1.price", f"Price: {price}"))
    for i, usp in enumerate(u for u in product.get("usps") or [] if str(u).strip()):
        facts.append(Fact(f"1.u{i + 1}", str(usp).strip()))
    for i, spec in enumerate(product.get("specs") or []):
        label, value = str(spec.get("label") or "").strip(), str(spec.get("value") or "").strip()
        if label and value:
            facts.append(Fact(f"1.s{i + 1}", f"{label}: {value}"))
    if context := str(product.get("selling_context") or "").strip():
        facts.append(Fact("1.context", context))
    if about := str(product.get("description") or "").strip():
        facts.append(Fact("1.about", about[:1500]))
    return facts


def competitor_facts(competitor: dict[str, Any]) -> list[Fact]:
    """#2 to #5: what one competitor's page said (a `Competitor` as JSON, names already
    neutralised when the build uses neutral labels)."""
    rank = int(competitor["rank"])
    facts: list[Fact] = [Fact(f"{rank}.name", f"Name: {competitor.get('label') or ''}".strip())]
    if price := _price(competitor):
        facts.append(Fact(f"{rank}.price", f"Price: {price}"))
    if rating := _plain(competitor.get("rating")):
        best = _plain(competitor.get("rating_best")) or "5"
        count = competitor.get("rating_count")
        reviews = f" from {count:,} {'review' if count == 1 else 'reviews'}" if count else ""
        facts.append(Fact(f"{rank}.rating", f"Rating: {rating} out of {best}{reviews}"))
    if summary := str(competitor.get("summary") or "").strip():
        facts.append(Fact(f"{rank}.summary", summary))
    for i, claim in enumerate(competitor.get("claims") or []):
        if i < MAX_CLAIM_FACTS and str(claim).strip():
            facts.append(Fact(f"{rank}.c{i + 1}", str(claim).strip()))
    bodies = [r.get("body") for r in competitor.get("reviews") or [] if r.get("body")]
    for i, body in enumerate(bodies[:MAX_REVIEW_FACTS]):
        facts.append(Fact(f"{rank}.r{i + 1}", f"Customer review: {str(body)[:400]}"))
    return facts


def facts_by_rank(
    product: dict[str, Any], competitors: list[dict[str, Any]]
) -> dict[int, list[Fact]]:
    """Every product on the page and its facts: #1 and each competitor that was read."""
    out = {1: product_facts(product)}
    for c in competitors:
        if c.get("status") == "pulled":
            out[int(c["rank"])] = competitor_facts(c)
    return out


def numbers(text: str) -> set[str]:
    """The numbers a text states, normalised so "$200.00", "200" and "200.0" are the same."""
    out: set[str] = set()
    for match in NUMBER.finditer(text):
        raw = match.group(0).rstrip(",").replace(",", "")
        if value := _plain(raw):
            out.add(value)
    return out


def our_pick(text: str) -> str:
    """The page's own #1 called "our pick": "#1" alone reads as a claim to be the market's #1
    (the claims check flags it), "our pick" is the page's opinion (D103)."""
    for pattern, repl in (
        (r"\bthe\s+#1(\s+pick)", r"our #1\1"),
        (r"\bthe\s+#1\b", "our pick"),
        (r"(?<!\bour )#1(\s+pick)", r"our #1\1"),
        (r"(?<!\bour )(?<!\w)#1\b", "our pick"),
    ):
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)
    return text


def tidy(comparison: Comparison, ranks: set[int]) -> Comparison:
    """The AI's comparison made safe to show: takes only for competitors on the page (and with
    something to say), at most four points with different names (none repeating the price or
    rating columns), every product with a cell, and lengths capped."""
    takes = []
    seen: set[int] = set()
    for take in comparison.takes:
        if take.rank in ranks and take.rank != 1 and take.rank not in seen:
            seen.add(take.rank)
            for line in (take.stands_out, take.worth_knowing):
                line.text = shorten(our_pick(line.text), TAKE_CHARS)
            if take.stands_out.text or take.worth_knowing.text:
                takes.append(take)
    axes: list[ComparisonAxis] = []
    names: set[str] = set()
    for axis in comparison.axes:
        name = shorten(axis.name.strip(), AXIS_CHARS)
        key = name.lower()
        if not name or key in OWN_COLUMNS or key in names or len(axes) == MAX_AXES:
            continue
        names.add(key)
        cells = {c.rank: c for c in axis.cells if c.rank in ranks}
        for rank in ranks:
            cell = cells.get(rank)
            if cell is None or not cell.text.strip():
                cells[rank] = ComparisonCell(rank=rank, text=NOT_STATED, sources=[])
            else:
                cell.text = shorten(our_pick(cell.text), CELL_CHARS)
        axes.append(
            axis.model_copy(update={"name": name, "cells": [cells[r] for r in sorted(ranks)]})
        )
    return Comparison(takes=sorted(takes, key=lambda t: t.rank), axes=axes)


def _put(el: Tag, text: str, sources: list[str]) -> None:
    set_text(el, text)
    if sources and text != NOT_STATED:
        el["data-lp-sources"] = " ".join(sources)
    else:
        el.attrs.pop("data-lp-sources", None)


def _clone_per(models: list[Tag], count: int) -> list[Tag]:
    """Replaces a run of template cells with `count` copies of the first, in its place."""
    if not models:
        return []
    first = models[0]
    for extra in models[1:]:
        extra.decompose()
    clones = [copy.copy(first) for _ in range(count)]
    for clone in reversed(clones):
        first.insert_after(clone)
    first.decompose()
    return clones


def fill_comparison(html: str, comparison: Comparison) -> tuple[str, dict[str, Any]]:
    soup: BeautifulSoup = parse(html)
    takes = {t.rank: t for t in comparison.takes}
    filled: list[int] = []
    for block in soup.select("[data-lp-rank-take]"):
        holder = block.find_parent(attrs={"data-lp-rank": True})
        rank = int(str(holder["data-lp-rank"])) if isinstance(holder, Tag) else None
        take = takes.get(rank) if rank else None
        if take is None:
            block.decompose()
            continue
        for attr, line in (
            ("data-lp-rank-take-strength", take.stands_out),
            ("data-lp-rank-take-caveat", take.worth_knowing),
        ):
            for row in block.select(f"[{attr}]"):
                if not line.text.strip():
                    row.decompose()
                    continue
                target = row.select_one("[data-lp-rank-take-text]") or row
                _put(target, line.text, line.sources)
        if not block.select("[data-lp-rank-take-strength], [data-lp-rank-take-caveat]"):
            block.decompose()  # nothing left to say: no empty "Our take" box
            continue
        if rank is not None:
            filled.append(rank)

    axes = comparison.axes
    for row in soup.select("tr"):
        heads = row.select("th[data-lp-compare-axis]")
        if not heads:
            continue
        for th, axis in zip(_clone_per(heads, len(axes)), axes, strict=True):
            set_text(th, axis.name)
            th["data-lp-lock"] = ""
    for row in soup.select("tr[data-lp-rank-row]"):
        rank = int(str(row["data-lp-rank-row"]))
        cells = row.select("td[data-lp-compare-cell]")
        if not cells:
            continue
        for td, axis in zip(_clone_per(cells, len(axes)), axes, strict=True):
            cell = next((c for c in axis.cells if c.rank == rank), None)
            _put(td, cell.text if cell else NOT_STATED, cell.sources if cell else [])
    return serialize(soup), {"takes": sorted(set(filled)), "axes": [a.name for a in axes]}


def fill_disclosures(html: str, brand: str, on: date) -> tuple[str, dict[str, int]]:
    """The Advertisement line and the two disclosures, in fixed wording (D103), locked."""
    soup: BeautifulSoup = parse(html)
    when = f"{on:%B} {on.day}, {on.year}"
    stats = {"ad_label": 0, "short": 0, "full": 0}
    for el in soup.select("[data-lp-ad-label]"):
        set_text(el, AD_LABEL.format(brand=brand))
        el["data-lp-lock"] = ""
        stats["ad_label"] += 1
    for el in soup.select("[data-lp-disclosure]"):
        kind = "full" if el.get("data-lp-disclosure") == "full" else "short"
        set_text(el, (FULL if kind == "full" else SHORT).format(brand=brand, date=when))
        el["data-lp-lock"] = ""
        stats[kind] += 1
    return serialize(soup), stats


def _skip(node: Any) -> bool:
    """Text the trace check leaves to its own rule (cited lines) or that isn't a claim: rank
    numbers and the product's name (a real product name may hold a number, "Capri 2")."""
    parent = node.parent
    while isinstance(parent, Tag):
        if any(parent.has_attr(a) for a in SKIP_ATTRS):
            return True
        if parent.has_attr("data-lp-rank") or parent.has_attr("data-lp-rank-row"):
            return False
        parent = parent.parent
    return False


def trace(html: str | BeautifulSoup, facts: dict[int, list[Fact]]) -> list[Finding]:
    """Every competitor fact on the page traced back to what was read (D103):
    - a cited line ("Our take", a table cell) must cite facts that exist, and every number in it
      must appear in them;
    - every other number in a competitor's entry or table row must appear in that competitor's
      own facts;
    - the page must keep its Advertisement line and a disclosure.
    Names are facts too: a number in any product's name may appear anywhere ("Capri 2"). All
    high risk: they block publishing until fixed or overridden."""
    soup = html if isinstance(html, BeautifulSoup) else parse(html)
    known = {f.id: f for group in facts.values() for f in group}
    named = set().union(*(numbers(f.text) for f in known.values() if f.id.endswith(".name")))
    findings: list[Finding] = []

    def flag(rule: str, text: str, el: Tag | None, reason: str) -> None:
        location = element_path(el) if el is not None else "page"
        findings.append(Finding(rule, "comparison", "high", shorten(text, SNIPPET_CHARS),
                                location, reason))  # fmt: skip

    for el in soup.select("[data-lp-sources]"):
        text = el.get_text(" ", strip=True)
        if not text or text == NOT_STATED:
            continue
        cited = [known[i] for i in str(el["data-lp-sources"]).split() if i in known]
        if not cited:
            flag("comparison_unsourced", text, el,
                 "This comparison line rests on nothing read from the product pages. Rewrite it "
                 "from their facts or remove it.")  # fmt: skip
            continue
        stated = named.union(*(numbers(f.text) for f in cited))
        if extra := sorted(numbers(text) - stated):
            flag("comparison_number", text, el,
                 f"{', '.join(extra)} isn't in the facts this line cites. Use the figure from "
                 "the product's page or remove it.")  # fmt: skip

    for rank, group in facts.items():
        if rank == 1:
            continue
        stated = named.union(*(numbers(f.text) for f in group))
        for scope in soup.select(f'[data-lp-rank="{rank}"], tr[data-lp-rank-row="{rank}"]'):
            for node in text_nodes(scope):
                if _skip(node) or not str(node).strip():
                    continue
                if extra := sorted(numbers(str(node)) - stated):
                    parent = node.parent if isinstance(node.parent, Tag) else None
                    flag("comparison_number", str(node), parent,
                         f"{', '.join(extra)} isn't in what was read from this competitor's "
                         "page.")  # fmt: skip

    labels = [el for el in soup.select("[data-lp-ad-label]") if el.get_text(strip=True)]
    notes = [el for el in soup.select("[data-lp-disclosure]") if el.get_text(strip=True)]
    if not labels or not notes:
        flag("ranking_disclosure", "No advertising disclosure", None,
             "A ranking page must say plainly that it's an advertisement from the brand: keep the "
             "Advertisement line at the top and the disclosure.")  # fmt: skip
    return findings


def facts_to_json(facts: dict[int, list[Fact]]) -> dict[str, list[dict[str, str]]]:
    return {
        str(rank): [{"id": f.id, "text": f.text} for f in group] for rank, group in facts.items()
    }


def facts_from_report(report: dict[str, Any] | None) -> dict[int, list[Fact]] | None:
    """The facts a ranking build saved in its report (None for any other page), so the review
    desk can trace the page again after an edit."""
    saved = ((report or {}).get("comparison") or {}).get("facts")
    if not isinstance(saved, dict):
        return None
    return {
        int(rank): [Fact(str(f["id"]), str(f["text"])) for f in group if "id" in f and "text" in f]
        for rank, group in saved.items()
    }


def check_claims(
    html: str, *, author_type: str | None, facts: dict[int, list[Fact]] | None
) -> dict[str, object]:
    """The claims check (BUILD_SPEC §13.1); on a ranking page (`facts` given) also the comparison
    rules and the trace check (D103). Used by the pipeline and by the review desk after edits."""
    if facts is None:
        return scan(html, author_type=author_type)
    soup = parse(html)  # one parse for both checks; neither changes the page
    return scan(soup, author_type=author_type, ranking=True, extra=trace(soup, facts))
