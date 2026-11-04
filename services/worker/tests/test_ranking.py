"""The Top 5 ranking builder's pure parts (BUILD_SPEC §8.7, B2.4a): reading a page's rating and
reviews, the competitor slots, neutral naming, the wizard's competitors and the graph's fork."""

from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.competitors import site_name
from app.engines.html import parse
from app.engines.product_extract import reviews_from_html
from app.engines.ranking import RankEntry, fill_ranking, neutral_label, neutralise
from app.models.build import BuildWizard, Competitors
from app.pipeline.graph import ORDER, build_graph, order_for, route_after_load

FIXTURES = Path(__file__).parent / "fixtures"
PAGE = (FIXTURES / "competitor_page.html").read_text()
LIBRARY = Path(__file__).resolve().parents[3] / "templates" / "library"
STARTER = (LIBRARY / "top5-ranking" / "index.html").read_text()
URLS = [f"https://shop{i}.test/products/p" for i in range(4)]


def test_reads_the_rating_and_reviews_a_page_publishes() -> None:
    summary = reviews_from_html(PAGE)
    assert summary.rating == Decimal("4.4") and summary.best == Decimal(5)
    assert summary.count == 1203
    assert [r.author for r in summary.reviews] == ["Maya R.", "Sam"]
    assert summary.reviews[0].rating == Decimal(5) and summary.reviews[0].title == "Love it"
    assert summary.reviews[1].body.startswith("Tastes earthy.")


def test_a_page_without_structured_reviews_has_none() -> None:
    summary = reviews_from_html("<html><body><h1>Plain page</h1></body></html>")
    assert summary.rating is None and summary.count is None and summary.reviews == []
    # A rating above its scale is ignored rather than shown.
    odd = PAGE.replace('"ratingValue": "4.4"', '"ratingValue": "44"')
    assert reviews_from_html(odd).rating is None


def test_neutral_naming_replaces_the_competitors_own_names() -> None:
    assert neutral_label(2) == "Brand B" and neutral_label(5) == "Brand E"
    names = ["Vitality Daily Greens", "Vitality Co", "vitality"]
    assert (
        neutralise("I love Vitality Daily Greens. vitality co ships fast.", names, "Brand B")
        == "I love Brand B. Brand B ships fast."
    )
    # Whole words only: "revitalising" keeps its letters.
    assert neutralise("revitalising", names, "Brand B") == "revitalising"
    assert site_name("https://www.ritual.com/products/x") == "ritual"
    assert site_name("https://shop.brand.co.uk/p") == "brand"


def _entry(rank: int, **extra: Any) -> RankEntry:
    values: dict[str, Any] = {
        "name": neutral_label(rank),
        "price": "$59.00",
        "summary": "A greens powder.",
        "rating": Decimal("4.4"),
        "count": 1203,
        "claims": ["40 superfoods in one scoop", "60-day guarantee"],
        "quote": "My mornings feel easier.",
        "quote_author": None,
    }
    return RankEntry(rank=rank, **{**values, **extra})


def test_fills_the_competitor_slots_and_closes_up_missing_ranks() -> None:
    html, stats = fill_ranking(STARTER, [_entry(2), _entry(3, rating=None, quote=None)])
    soup = parse(html)
    assert stats["filled"] == [2, 3] and stats["removed"] == [4, 5]
    assert soup.select_one('[data-lp-section="rank-4"]') is None
    assert soup.select_one('tr[data-lp-rank-row="5"]') is None
    two = soup.select_one('[data-lp-rank="2"]')
    assert two is not None and two.has_attr("data-lp-lock")
    assert two.select_one("[data-lp-rank-name]").get_text() == "Brand B"  # type: ignore[union-attr]
    assert two.select_one("[data-lp-rank-price]").get_text() == "$59.00"  # type: ignore[union-attr]
    assert two.select_one("[data-lp-rank-stars]")["style"] == "--rating: 88%"  # type: ignore[index]
    assert two.select_one("[data-lp-rank-rating-count]").get_text() == "1,203 reviews"  # type: ignore[union-attr]
    assert [c.get_text() for c in two.select("[data-lp-rank-claim-text]")] == [
        "40 superfoods in one scoop",
        "60-day guarantee",
    ]
    assert two.select_one("[data-lp-rank-quote-author]") is None  # no reviewer name given
    assert two.select_one("img[data-lp-rank-image]")["src"] == "assets/silhouette.svg"  # type: ignore[index]
    three = soup.select_one('[data-lp-rank="3"]')
    assert three is not None
    assert three.select_one("[data-lp-rank-rating]") is None  # no rating: nothing made up
    assert three.select_one("[data-lp-rank-quote]") is None
    row = soup.select_one('tr[data-lp-rank-row="3"]')
    assert row is not None and row.select_one("[data-lp-rank-rating-value]").get_text() == "—"  # type: ignore[union-attr]


def test_real_names_show_the_competitors_photo() -> None:
    html, _ = fill_ranking(
        STARTER, [_entry(2, name="Daily Greens", image_url="https://x.test/a.jpg")]
    )
    img = parse(html).select_one('[data-lp-rank="2"] img[data-lp-rank-image]')
    assert img is not None and img["src"] == "https://x.test/a.jpg" and img["alt"] == "Daily Greens"


def test_the_wizard_takes_four_different_competitor_pages() -> None:
    wizard = BuildWizard.model_validate({"competitors": {"urls": URLS}})
    assert wizard.competitors is not None and wizard.competitors.naming == "neutral"
    with pytest.raises(ValidationError):
        Competitors.model_validate({"urls": URLS[:3]})
    with pytest.raises(ValidationError):
        Competitors.model_validate({"urls": [URLS[0], URLS[0] + "/", URLS[1], URLS[2]]})
    assert BuildWizard().competitors is None


def test_ranking_builds_read_their_competitors_after_loading() -> None:
    ranking: Any = {"template": {"type": "top5_ranking"}}
    other: Any = {"template": {"type": "listicle"}}
    assert route_after_load(ranking) == "pull_competitors"
    assert route_after_load(other) == "apply_section_layout"
    order = order_for("owned", "top5_ranking")
    assert order[:3] == ["load_inputs", "pull_competitors", "apply_section_layout"]
    assert order_for("owned", "listicle") == ORDER["owned"]
    assert "pull_competitors" in set(build_graph().get_graph().nodes)
