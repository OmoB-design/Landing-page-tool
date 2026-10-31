"""The analysis engine (BUILD_SPEC §8.4 "Analyze", B2.2) on made-up clones: finding blocks,
the digest the model reads, applying its answer, undoing it, and the length caps. Pure."""

from pathlib import Path

from bs4 import BeautifulSoup

from app.engines import analysis, clone
from app.engines.html import parse
from app.models.blueprint import AnalysisReply

FIXTURES = Path(__file__).parent / "fixtures" / "clone"
FLAT = (FIXTURES / "funnelish_flat.html").read_text()
REPLO = clone.clone_page(
    (FIXTURES / "replo_advertorial.html").read_text(), "https://vitalis.test/pages/x"
).html


def digest(html: str) -> tuple[analysis.PageDigest, list[analysis.Block], BeautifulSoup]:
    return analysis.digest(html, source_host="vitalis.test", source_name="Vitalis", title="T")


def test_a_flat_page_builder_list_is_cut_into_runs_at_its_headings() -> None:
    page, blocks, _ = digest(FLAT)
    headings = [b["heading"] for b in page.blocks]
    # The sticky bar, the opening run (kicker, h1, six paragraphs), four h2 runs, the footer.
    assert headings[2:6] == [
        "What actually works", "The five-thousand-year-old habit",
        "Why I bought the wrong half", "What I take now",
    ]  # fmt: skip
    assert len(blocks[1].nodes) == 8 and headings[1] == "Why your numbers stay the same"
    assert len(blocks[2].nodes) == 6  # the h2 wrapper, four paragraphs, the image
    footer = page.blocks[-1]
    assert footer["chrome"] and footer["element"].startswith("footer")


def test_the_digest_lists_colours_images_links_and_text() -> None:
    page, _, _ = digest(FLAT)
    saturated = [c["hex"] for c in page.colours if not c["neutral"]]
    assert saturated[0] == "#a82420"  # the brand red appears most
    assert page.images[0]["src"] == "https://img.funnelish.test/p.webp"
    assert page.images[0]["block"] == "b3"
    cta = next(link for link in page.links if "Check availability" in link["text"])
    assert cta["looks_like_cta"] and cta["href"].endswith("/checkout")
    assert page.text.startswith("Discover the solution")
    assert len(page.text) <= analysis.MAX_TEXT
    assert set(page.for_model()) == {
        "page", "colours", "blocks", "images", "links", "headings", "text",
    }  # fmt: skip


def test_apply_tags_blocks_and_wraps_runs_and_groups() -> None:
    _, blocks, soup = digest(FLAT)
    chosen = [
        analysis.ChosenSection(blocks=["b2"], role="hero", label="Hero"),
        # Two consecutive runs that belong together become one wrapped section.
        analysis.ChosenSection(blocks=["b4", "b3"], role="mechanism", label="How it works"),
        analysis.ChosenSection(blocks=["b5"], role="testimonials", label="My story"),
        analysis.ChosenSection(blocks=["b99"], role="other", label="Made up"),
    ]
    html, rows, stats = analysis.apply(soup, blocks, chosen)
    assert [r["key"] for r in rows] == ["hero", "how-it-works", "my-story"]
    assert [r["role"] for r in rows] == ["hero", "mechanism", "testimonials"]
    assert rows[2]["duplicable"] and not rows[0]["duplicable"]
    assert stats == {"sections": 3, "wrapped": 3, "skipped": 1}
    out = parse(html)
    sections = out.select("[data-lp-section]")
    assert [s["data-lp-section"] for s in sections] == ["hero", "how-it-works", "my-story"]
    assert all(s.has_attr("data-lp-wrap") for s in sections)
    assert "What actually works" in sections[1].get_text()
    assert "five-thousand-year-old" in sections[1].get_text()

    # Undone, the page is as it was before analysis.
    undone = parse(analysis.untag(html))
    assert not undone.select("[data-lp-section], [data-lp-role], [data-lp-wrap]")
    assert undone.get_text() == parse(FLAT).get_text()


def test_a_section_of_blocks_that_are_not_siblings_keeps_its_first_block() -> None:
    _, blocks, soup = digest(FLAT)
    # b1 is the sticky bar (outside <main>), b2 the opening run inside it.
    html, _, stats = analysis.apply(
        soup,
        blocks,
        [analysis.ChosenSection(blocks=["b1", "b2"], role="other", label="Top")],
    )
    tagged = parse(html).select_one("[data-lp-section=top]")
    assert tagged is not None and "sticky" in " ".join(tagged.get("class") or [])
    assert stats["wrapped"] == 0


def test_length_caps_cover_headings_and_classed_buttons_only() -> None:
    _, blocks, soup = digest(FLAT)
    html, _, _ = analysis.apply(
        soup,
        blocks,
        [analysis.ChosenSection(blocks=[b.id], role="other", label=f"S{i}")
         for i, b in enumerate(blocks)],
    )  # fmt: skip
    caps = {c["match"]: c["max_chars"] for c in analysis.length_caps(html)}
    assert caps["h1@"] == 34  # "Why your numbers stay the same" (30) + 12 %
    assert caps["h2@"] == 36  # the longest h2 (32) + 12 %
    assert caps["a.btn.btn-v2"] == 23  # "Check availability →" (20) + 12 %
    assert "a" not in caps  # a bare "a" would cap nearly every line


def test_the_mock_answer_fits_the_reply_shape_and_skips_chrome() -> None:
    page, _, _ = digest(REPLO)
    reply = AnalysisReply.model_validate(analysis.heuristic(page))
    assert reply.sections and reply.sections[0].role == "hero"
    assert "Vitalis" in reply.brand_tokens and "Vitalis" in reply.forbidden_terms
    flat, _, _ = digest(FLAT)
    labels = [s["label"] for s in analysis.heuristic(flat)["sections"]]
    assert "What actually works" in labels and len(labels) == 6  # no footer


def test_section_keys_are_unique_slugs() -> None:
    taken: set[str] = set()
    assert analysis.section_key("The problem", taken) == "the-problem"
    assert analysis.section_key("The problem", taken) == "the-problem-2"
    assert analysis.section_key("¿¿??", taken) == "section"


def test_clone_checks_skip_the_library_slot_checks() -> None:
    from app.engines.template_outline import checks

    _, blocks, soup = digest(FLAT)
    html, rows, _ = analysis.apply(
        soup, blocks, [analysis.ChosenSection(blocks=["b2"], role="hero", label="Hero")]
    )
    keys = [r["key"] for r in rows]
    library = [i.message for i in checks(html, keys)]
    assert any("data-lp-product" in m for m in library)
    found = checks(html, keys, cloned=True, forbidden_terms=["Vitalis"])
    messages = [i.message for i in found]
    assert not any("data-lp" in m or "other sites" in m for m in messages)
    assert {i.severity for i in found} == {"info"}  # blocks outside sections are only noted
    assert any(m.startswith("A block outside every section") for m in messages)
