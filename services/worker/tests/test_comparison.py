"""The Top 5 ranking's comparison (BUILD_SPEC §8.7, B2.4b, D103): facts, "Our take", the table,
the disclosures, the trace check and the comparison rules. Pure; no database or network."""

from datetime import date
from pathlib import Path
from typing import Any, cast

from app.engines import comparison as engine
from app.engines.compliance import scan
from app.engines.html import parse
from app.engines.ranking import RankEntry, fill_ranking
from app.models.competitor import Comparison

LIBRARY = Path(__file__).resolve().parents[3] / "templates" / "library"
STARTER = (LIBRARY / "top5-ranking" / "index.html").read_text()

PRODUCT: dict[str, Any] = {
    "name": "Lume Greens",
    "currency": "USD",
    "price": "45.00",
    "sale_price": None,
    "usps": ["Twelve greens in one scoop"],
    "specs": [{"label": "Made in", "value": "USA"}, {"label": "Returns", "value": "60 days"}],
    "selling_context": "Free shipping over $50.",
    "description": "A daily greens powder.",
}
BRAND_B: dict[str, Any] = {
    "rank": 2,
    "status": "pulled",
    "label": "Brand B",
    "currency": "USD",
    "price": "59.00",
    "sale_price": None,
    "rating": "4.40",
    "rating_best": "5",
    "rating_count": 1203,
    "summary": "A greens powder with 40 superfoods.",
    "claims": ["40 superfoods in one scoop", "30-day returns"],
    "reviews": [{"body": "My mornings feel easier.", "author": None}],
}
FACTS = engine.facts_by_rank(PRODUCT, [BRAND_B, {"rank": 3, "status": "failed"}])


def _comparison(**changes: Any) -> Comparison:
    data: dict[str, Any] = {
        "takes": [
            {
                "rank": 2,
                "stands_out": {
                    "text": "It packs 40 superfoods into one scoop.",
                    "sources": ["2.c1"],
                },
                "worth_knowing": {
                    "text": "At $59.00 it costs more than our pick at $45.00.",
                    "sources": ["2.price", "1.price"],
                },
            }
        ],
        "axes": [
            {
                "name": "Returns",
                "cells": [
                    {"rank": 1, "text": "60 days", "sources": ["1.s2"]},
                    {"rank": 2, "text": "30 days", "sources": ["2.c2"]},
                ],
            }
        ],
    }
    data.update(changes)
    return Comparison.model_validate(data)


def _page(comparison: Comparison | None = None) -> str:
    entry = RankEntry(
        rank=2, name="Brand B", price="$59.00", summary=BRAND_B["summary"],
        rating=None, claims=BRAND_B["claims"],
    )  # fmt: skip
    html, _ = fill_ranking(STARTER, [entry])
    html, _ = engine.fill_comparison(html, comparison or _comparison())
    html, _ = engine.fill_disclosures(html, "Lume", date(2026, 11, 4))
    return html


def test_facts_name_every_product_and_skip_pages_that_were_not_read() -> None:
    assert sorted(FACTS) == [1, 2]
    one = {f.id: f.text for f in FACTS[1]}
    assert one["1.price"] == "Price: $45.00" and one["1.s2"] == "Returns: 60 days"
    two = {f.id: f.text for f in FACTS[2]}
    assert two["2.rating"] == "Rating: 4.4 out of 5 from 1,203 reviews"
    assert two["2.c2"] == "30-day returns" and two["2.r1"].endswith("feel easier.")
    assert engine.numbers("$1,203.50, 47% and 6-month, ranked #2") == {"1203.5", "47", "6"}
    assert engine.numbers("$200.00") == engine.numbers("200") == {"200"}


def test_the_pick_is_our_pick_never_a_bare_number_one() -> None:
    assert engine.our_pick("It costs $59.00 against $45.00 for #1.") == (
        "It costs $59.00 against $45.00 for our pick."
    )
    assert (
        engine.our_pick("Unlike the #1 pick, it ships free.")
        == "Unlike our #1 pick, it ships free."
    )
    assert engine.our_pick("It beats the #1 on price.") == "It beats our pick on price."
    assert engine.our_pick("Our #1 pick stays.") == "Our #1 pick stays."


def test_tidy_keeps_what_the_page_can_show() -> None:
    reply = _comparison(
        takes=[
            {"rank": 1, "stands_out": {"text": "x", "sources": []},
             "worth_knowing": {"text": "y", "sources": []}},
            {"rank": 5, "stands_out": {"text": "x", "sources": []},
             "worth_knowing": {"text": "y", "sources": []}},
        ],
        axes=[
            {"name": "Price", "cells": []},
            *({"name": f"Point {i}", "cells": [{"rank": 2, "text": "Yes", "sources": []}]}
              for i in range(6)),
        ],
    )  # fmt: skip
    tidy = engine.tidy(reply, {1, 2})
    assert tidy.takes == []  # #1 has no take; #5 isn't on the page
    assert [a.name for a in tidy.axes] == ["Point 0", "Point 1", "Point 2", "Point 3"]
    assert [(c.rank, c.text) for c in tidy.axes[0].cells] == [(1, "Not stated"), (2, "Yes")]


def test_fills_our_take_and_the_comparison_table() -> None:
    soup = parse(_page())
    two = soup.select_one('[data-lp-rank="2"]')
    assert two is not None
    texts = two.select("[data-lp-rank-take-text]")
    assert [t.get_text() for t in texts] == [
        "It packs 40 superfoods into one scoop.",
        "At $59.00 it costs more than our pick at $45.00.",
    ]
    assert texts[1]["data-lp-sources"] == "2.price 1.price"
    assert [th.get_text() for th in soup.select("th[data-lp-compare-axis]")] == ["Returns"]
    cells = {
        tr["data-lp-rank-row"]: [td.get_text() for td in tr.select("td[data-lp-compare-cell]")]
        for tr in soup.select("tr[data-lp-rank-row]")
    }
    assert cells == {"1": ["60 days"], "2": ["30 days"]}  # ranks 3 to 5 closed up


def test_without_a_comparison_the_takes_and_extra_columns_go() -> None:
    soup = parse(_page(Comparison(takes=[], axes=[])))
    assert soup.select("[data-lp-rank-take]") == []
    assert soup.select("th[data-lp-compare-axis], td[data-lp-compare-cell]") == []
    assert soup.select_one('tr[data-lp-rank-row="2"] [data-lp-rank-price]') is not None


def test_the_disclosures_name_the_brand_and_the_date() -> None:
    soup = parse(_page())
    label = soup.select_one("[data-lp-ad-label]")
    assert label is not None and label.get_text() == "Advertisement · Paid content from Lume"
    short = soup.select_one('[data-lp-disclosure="short"]')
    assert short is not None and short.has_attr("data-lp-lock")
    assert short.get_text().startswith("Lume makes our #1 pick.")
    assert short.get_text().endswith("as of November 4, 2026.")
    full = soup.select_one('[data-lp-disclosure="full"]')
    assert full is not None and "isn't an independent review" in full.get_text()


def test_a_page_built_from_the_facts_traces_cleanly() -> None:
    html = _page()
    assert engine.trace(html, FACTS) == []
    result = engine.check_claims(html, author_type="writer", facts=FACTS)
    assert result["high_risk_count"] == 0, result["findings"]


def test_the_trace_check_catches_what_the_pages_did_not_say() -> None:
    wrong = _comparison(
        takes=[
            {
                "rank": 2,
                "stands_out": {"text": "It packs 50 superfoods.", "sources": ["2.c1"]},
                "worth_knowing": {"text": "Its formula is untested.", "sources": ["2.c9"]},
            }
        ]
    )
    html = _page(wrong).replace("$59.00</span>", "$49.00</span>", 1)
    rules = [(f.rule, f.text) for f in engine.trace(html, FACTS)]
    assert ("comparison_number", "It packs 50 superfoods.") in rules
    assert ("comparison_unsourced", "Its formula is untested.") in rules
    assert ("comparison_number", "$49.00") in rules  # the entry's price isn't what was read
    bare = html.replace("data-lp-ad-label", "data-x").replace("data-lp-disclosure", "data-y")
    assert "ranking_disclosure" in {f.rule for f in engine.trace(bare, FACTS)}
    assert all(f.severity == "high" for f in engine.trace(bare, FACTS))


def test_ranking_pages_hold_superlatives_to_a_higher_bar() -> None:
    page = (
        "<p>Our #1 pick is easy to love.</p><p>It is the best sneaker you can buy.</p>"
        "<p>The #1 brand in America.</p><p>Brand C is the worst of the lot.</p>"
    )

    def findings(**options: Any) -> list[dict[str, str]]:
        return cast(list[dict[str, str]], scan(page, **options)["findings"])

    plain = {f["rule"]: f["severity"] for f in findings()}
    assert plain == {"number_one": "medium"}  # "our #1 pick" is the page's opinion
    ranked = {f["rule"]: f for f in findings(ranking=True)}
    assert set(ranked) == {"number_one", "best_as_fact", "disparaging"}
    assert all(f["severity"] == "high" for f in ranked.values())
    assert "our top pick" in ranked["number_one"]["reason"]


def test_the_desk_can_trace_the_page_again_from_the_report() -> None:
    report = {"comparison": {"facts": engine.facts_to_json(FACTS)}}
    assert engine.facts_from_report(report) == FACTS
    assert engine.facts_from_report({"comparison": {}}) is None
    assert engine.facts_from_report(None) is None


def test_competitors_quoted_words_keep_the_normal_rules() -> None:
    """Their own claims and reviews, quoted and locked, can't be fixed by the user: the ranking
    rules and their higher bar are for the page's own words (code review, B2.4b)."""
    page = (
        '<article data-lp-rank="2"><ul data-lp-rank-claims><li>The #1 best-selling powder</li>'
        "</ul><blockquote data-lp-rank-quote><p>Avoid them, the others are inferior.</p>"
        "</blockquote></article><p>Our pick is top rated.</p>"
    )
    found = {f["rule"]: f for f in cast(list[dict[str, str]], scan(page, ranking=True)["findings"])}
    assert found["number_one"]["severity"] == "medium"  # quoted: the normal rule, not the bar
    assert "disparaging" not in found  # a quoted review isn't the page running anyone down
    assert found["top_rated"]["severity"] == "high"  # the page's own words


def test_our_number_one_is_an_opinion_only_as_a_pick() -> None:
    def rules(text: str) -> set[str]:
        return {f["rule"] for f in cast(list[dict[str, str]], scan(f"<p>{text}</p>")["findings"])}

    assert rules("Our #1 pick for spring.") == set()
    assert rules("It's our number one choice.") == set()
    assert rules("Your #1 choice for joint relief.") == {"number_one"}
    assert rules("Our #1 bestselling formula.") == {"number_one"}


def test_real_names_and_reviewers_may_hold_numbers() -> None:
    named = {**BRAND_B, "label": "Capri 2 Sneaker"}
    facts = engine.facts_by_rank(PRODUCT, [named])
    reply = _comparison(
        takes=[
            {
                "rank": 2,
                "stands_out": {"text": "The Capri 2 Sneaker packs 40 superfoods.",
                               "sources": ["2.c1"]},
                "worth_knowing": {"text": "It costs $59.00.", "sources": ["2.price"]},
            }
        ]
    )  # fmt: skip
    entry = RankEntry(rank=2, name="Capri 2 Sneaker", price="$59.00", quote="Love it.",
                      quote_author="Jenna R., 34")  # fmt: skip
    html, _ = fill_ranking(STARTER, [entry])
    html, _ = engine.fill_comparison(html, reply)
    html, _ = engine.fill_disclosures(html, "Lume", date(2026, 11, 4))
    assert engine.trace(html, facts) == []


def test_no_empty_take_and_no_repeated_points() -> None:
    blank = _comparison(
        takes=[
            {"rank": 2, "stands_out": {"text": "", "sources": []},
             "worth_knowing": {"text": " ", "sources": []}},
        ],
        axes=[
            {"name": "Materials", "cells": [{"rank": 2, "text": "Leather", "sources": ["2.c1"]}]},
            {"name": "materials", "cells": [{"rank": 2, "text": "Suede", "sources": ["2.c1"]}]},
        ],
    )  # fmt: skip
    tidy = engine.tidy(blank.model_copy(deep=True), {1, 2})
    assert tidy.takes == [] and [a.name for a in tidy.axes] == ["Materials"]
    # Even untidied, a take with nothing to say leaves no empty box.
    assert (
        "data-lp-rank-take"
        not in _page(blank).split('data-lp-rank="3"')[0].split('data-lp-rank="2"')[1]
    )


def test_the_neutral_backstop_only_touches_each_competitors_own_lines() -> None:
    from app.models.competitor import Competitor
    from app.pipeline.nodes.compare_products import _neutral

    greens = Competitor(rank=2, url="https://greens.test/p", status="pulled", label="Brand B",
                        name="Super Greens - 30 Servings")  # fmt: skip
    other = Competitor(rank=3, url="https://other.test/p", status="pulled", label="Brand C")
    reply = Comparison.model_validate(
        {
            "takes": [
                {"rank": 2, "stands_out": {"text": "Super Greens ships fast.", "sources": []},
                 "worth_knowing": {"text": "", "sources": []}},
                {"rank": 3, "stands_out": {"text": "It adds super greens and probiotics.",
                                           "sources": []},
                 "worth_knowing": {"text": "", "sources": []}},
            ],
            "axes": [{"name": "Blend", "cells": [
                {"rank": 1, "text": "Super greens blend", "sources": []},
                {"rank": 2, "text": "Super Greens powder", "sources": []},
            ]}],
        }
    )  # fmt: skip
    clean = _neutral(reply, [greens, other])
    assert clean.takes[0].stands_out.text == "Brand B ships fast."
    assert clean.takes[1].stands_out.text == "It adds super greens and probiotics."
    assert [c.text for c in clean.axes[0].cells] == ["Super greens blend", "Brand B powder"]
