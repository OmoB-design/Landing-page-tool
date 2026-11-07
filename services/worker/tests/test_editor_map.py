"""The Shopify editor map (B4.1, D120): worked out from the templates' markers, brought up to date
with their sections, and the dry run of what becomes editable, within Shopify's limits."""

import json
from pathlib import Path

import pytest

from app.engines import editor_map as em
from app.models.editor_map import EditorMap, MapOverrides, RoleRule

LIBRARY = Path(__file__).resolve().parents[3] / "templates" / "library"
SLUGS = sorted(p.name for p in LIBRARY.iterdir() if (p / "template.json").exists())


def page(*sections: str) -> str:
    return "<html><body>" + "".join(sections) + "</body></html>"


def section(key: str, inner: str) -> str:
    return f'<section data-lp-section="{key}">{inner}</section>'


ROWS = [
    {"key": "hero", "role": "hero", "label": "Headline and byline"},
    {"key": "offer", "role": "offer", "label": "The offer you can't miss on this page today"},
]


def test_names_fit_shopify_and_dont_end_on_small_words() -> None:
    assert em.short_name("Headline and byline") == "Headline and byline"
    assert em.short_name("Headline and how we tested them all") == "Headline"
    assert em.short_name("One Bag for Every Part of Your Day") == "One Bag for Every Part"
    assert len(em.short_name("x" * 40)) == 25
    built = em.derive(ROWS)
    assert [s.name for s in built.sections] == ["Headline and byline", "The offer you can't miss"]
    assert all(len(s.name) <= 25 for s in built.sections)
    twice = em.derive([{"key": "a", "label": "Reviews"}, {"key": "b", "label": "Reviews"}])
    assert [s.name for s in twice.sections] == ["Reviews", "Reviews 2"]


def test_rules_set_by_hand_and_parts_kept_whole() -> None:
    built = em.derive(
        ROWS,
        MapOverrides(
            names={"offer": "Offer"},
            roles=[RoleRule(match=".deal", role="badge")],
            keep_whole=[".calculator"],
        ),
    )
    assert built.sections[1].name == "Offer"
    assert built.roles[0].role == "badge"
    assert built.keep_whole == [".calculator"]  # the built-in ones apply anyway
    # A map saved with B4.1's first built-in list (forms, videos and embeds kept whole) loses it.
    older = built.model_dump() | {"keep_whole": ["form", "iframe", ".calculator"]}
    assert em.effective(older, ROWS).keep_whole == [".calculator"]


def test_a_stored_map_follows_the_template_as_it_changes() -> None:
    stored = em.derive(ROWS).model_dump()
    stored["sections"][0]["name"] = "Top"
    rows = [*ROWS, {"key": "faq", "role": "faq", "label": "Questions"}]
    current = em.effective(stored, rows)
    assert [(s.key, s.name) for s in current.sections] == [
        ("hero", "Top"), ("offer", "The offer you can't miss"), ("faq", "Questions"),
    ]  # fmt: skip
    # Gone from the template: gone from the map. An older format: worked out again.
    assert [s.key for s in em.effective(stored, ROWS[:1]).sections] == ["hero"]
    old = {"version": 1, "ai": "mock", "sections": [{"match": "x", "name": "y"}]}
    assert em.effective(old, ROWS).sections[0].name == "Headline and byline"


@pytest.mark.parametrize("slug", SLUGS)
def test_every_library_template_is_ready_for_shopify(slug: str) -> None:
    folder = LIBRARY / slug
    manifest = json.loads((folder / "template.json").read_text())
    html = (folder / "index.html").read_text()
    result = em.plan(html, em.derive(manifest["sections"]), template=True)
    summary = em.report(result, manifest["slug"])
    assert summary.ready, summary.issues
    marked = [s.key for s in result.sections if not s.loose]
    assert marked == [s["key"] for s in manifest["sections"]]
    assert summary.texts > 30 and summary.images > 0 and summary.unclear == 0
    assert summary.static == 0  # everything on the page can be edited in Shopify
    assert all(len(s.name) <= em.MAX_NAME for s in result.sections)
    roles = {t.role for s in result.sections for t in s.texts}
    assert {"headline", "cta"} <= roles
    # Texts the line numbering splits (a bold phrase in a div) come back as one block.
    lines = [t.line for s in result.sections for t in s.texts]
    assert len(lines) == len(set(lines))


def test_roles_from_markers_tags_and_hints() -> None:
    html = page(
        section(
            "hero",
            "<h1>Glow in 7 days</h1><p>A calm serum for every skin.</p>"
            '<p class="byline">By Dana Wells</p><span class="eyebrow">New</span>'
            '<a data-lp-cta="" href="#">Shop now</a><p><span data-lp-price="">$42.00</span></p>'
            '<img data-lp-product="" src="p.jpg"/><img src="h.jpg"/>'
            '<img src="i.svg" width="24" height="24"/><img data-lp-scene="" src="s.jpg"/>',
        ),
        section(
            "faq",
            "<h2>Questions</h2><details><summary>Is it gentle?</summary><p>Yes.</p></details>"
            "<ul><li>Vegan</li></ul><table><tr><td>Price</td></tr></table>"
            '<div class="note">Free shipping</div>'
            '<div class="long">' + "Plenty of words here. " * 4 + "</div>",
        ),
    )
    rows = [{"key": "hero", "role": "hero", "label": "Hero"}, {"key": "faq", "label": "FAQ"}]
    result = em.plan(html, em.derive(rows))
    hero, faq = result.sections
    assert [t.role for t in hero.texts] == [
        "headline", "subheadline", "byline", "eyebrow", "cta", "price",
    ]  # fmt: skip
    assert [i.role for i in hero.images] == ["product", "hero", "icon", "scene"]
    assert [t.role for t in faq.texts] == [
        "heading", "question", "paragraph", "list_item", "cell", "label", "paragraph",
    ]  # fmt: skip


def test_what_shopify_keeps_a_texts_words_in() -> None:
    html = page(
        section(
            "s",
            "<p>Plain words</p><p>Some <strong>bold</strong> and <a href='/x'>a link</a></p>"
            '<p>A <span style="color:red">styled</span> word</p>',
        )
    )
    texts = em.plan(html, em.derive([{"key": "s", "label": "S"}])).sections[0].texts
    assert [t.setting for t in texts] == ["text", "inline_richtext", "html"]


def test_forms_videos_and_embeds_are_editable_and_static_parts_stay() -> None:
    html = page(
        section(
            "s",
            "<p>Editable</p><form><label>Email</label><input/><button>Join</button></form>"
            '<video><source src="clip.mp4"/></video><iframe src="https://youtu.be/x"></iframe>'
            '<div data-lp-static=""><p>Fixed</p><img src="x.jpg"/></div>'
            "<select><option>Small</option></select>",
        )
    )
    result = em.plan(html, em.derive([{"key": "s", "label": "S"}]))
    texts = result.sections[0].texts
    assert [(t.preview, t.role) for t in texts] == [
        ("Editable", "paragraph"), ("Email", "label"), ("Join", "cta"),
    ]  # fmt: skip
    assert [(m.kind, m.src) for m in result.sections[0].media] == [
        ("video", "clip.mp4"), ("embed", "https://youtu.be/x"),
    ]  # fmt: skip
    assert result.sections[0].static == 3  # "Fixed", its picture, the dropdown's option
    assert em.report(result, "page").media == 2


def test_parts_outside_the_sections_get_sections_of_their_own() -> None:
    html = page(
        '<div class="notice"><p>Free shipping today</p></div>',
        section("hero", "<h1>A</h1>"),
        '<aside><p>Note one</p><img src="a.jpg"/></aside><p>Note two</p>',
        section("offer", "<p>B</p>"),
        "<footer><p>Small print</p></footer>",
    )
    result = em.plan(html, em.derive(ROWS))
    assert [(s.name, s.loose) for s in result.sections] == [
        ("Page top", True), ("Headline and byline", False),
        ("After Headline and byline", True), ("The offer you can't miss", False),
        ("After The offer you can't", True),
    ]  # fmt: skip
    between = result.sections[2]
    assert [t.preview for t in between.texts] == ["Note one", "Note two"]
    assert len(between.images) == 1
    summary = em.report(result, "page")
    assert summary.static == 0 and summary.ready
    assert sum(1 for i in summary.issues if i.level == "info") == 3


def test_copies_of_a_section_and_sections_the_map_doesnt_know() -> None:
    html = page(section("hero", "<h1>A</h1>"), section("hero-2", "<h1>B</h1>"),
                section("extra-bit", "<p>C</p>"))  # fmt: skip
    result = em.plan(html, em.derive(ROWS))
    assert [s.name for s in result.sections] == [
        "Headline and byline", "Headline and byline 2", "Extra bit",
    ]  # fmt: skip
    assert any("isn't in the editor map" in i.message for i in result.issues)


def test_shopifys_limits() -> None:
    many = page(*(section(f"s{i}", f"<p>Text {i}</p>") for i in range(27)))
    rows = [{"key": f"s{i}", "label": f"Part {i}"} for i in range(27)]
    result = em.plan(many, em.derive(rows))
    assert [s.merged_into for s in result.sections[25:]] == ["s24", "s24"]
    assert any("Shopify takes 25" in i.message for i in result.issues)

    # Blocks placed in a section (static blocks) don't count toward Shopify's block limits: a long
    # section stays one section, all of it editable.
    crowded = page(section("s", "".join(f"<p>Line {i}</p>" for i in range(605))))
    summary = em.report(em.plan(crowded, em.derive([{"key": "s", "label": "S"}])), "page")
    assert len(summary.sections) == 1 and summary.texts == 605 and summary.static == 0

    assert em.file_slug("LUM-12") == "lum-12"
    long = em.file_slug("a-very-long-template-slug-for-a-page")
    assert len(long) == 21 and long.startswith("a-very-long-te")
    assert em.longest_file_key("a-very-long-template-slug-for-a-page") <= em.MAX_FILE_KEY


def test_odd_rules_and_empty_pages_are_reported() -> None:
    broken = EditorMap.model_validate(
        {
            "sections": [{"key": "s", "name": "S"}],
            "roles": [{"match": "p[", "role": "headline"}, {"match": ".none", "role": "badge"},
                      {"match": "p", "role": "nonsense"}],
        }
    )  # fmt: skip
    result = em.plan(page(section("s", "<p>x</p>")), broken, template=True)
    messages = [i.message for i in result.issues]
    assert any("isn't a valid selector" in m for m in messages)
    assert any("matches nothing" in m for m in messages)
    assert any("isn't a block role" in m for m in messages)
    assert not em.report(result, "page").ready
    empty = em.report(em.plan(page("<p>No sections</p>"), em.derive([])), "page")
    assert not empty.ready and empty.static == 1


def test_parts_are_listed_in_page_order_and_named_as_in_shopify() -> None:
    """The page editor's tree (B4.4, D123): each section's texts, pictures and videos in page
    order, named as Shopify names their blocks, with the editor's line and picture numbers."""
    html = page(
        section(
            "hero",
            '<h1>Glow in 7 days</h1><img data-lp-img="3" data-lp-scene="" src="s.jpg" alt="A calm'
            ' morning"/><p>A calm serum for every skin.</p><a data-lp-cta="" href="#">Shop now</a>'
            '<video src="v.mp4"></video>',
        ),
        section("faq", "<h2>Questions</h2><ul><li>Vegan</li></ul>"),
    )
    rows = [{"key": "hero", "role": "hero", "label": "Hero"}, {"key": "faq", "label": "FAQ"}]
    hero, faq = em.parts(html, em.derive(rows))
    assert (hero.key, hero.name) == ("hero", "Hero")
    assert [(p.kind, p.name) for p in hero.parts] == [
        ("text", "Headline"), ("image", "Scene picture"), ("text", "Subheadline"),
        ("text", "Button"), ("media", "Video"),
    ]  # fmt: skip
    assert hero.parts[0].excerpt == "Glow in 7 days" and hero.parts[1].excerpt == "A calm morning"
    assert hero.parts[1].image == 3 and hero.parts[1].line is None
    assert hero.parts[1].thumb == ""  # a thumbnail only for a picture on the web
    lines = [p.line or 0 for p in hero.parts if p.kind == "text"]
    lines += [p.line or 0 for p in faq.parts]
    assert all(lines) and lines == sorted(lines)  # the editor's numbering, in page order
    assert [p.name for p in faq.parts] == ["Heading", "List item"]
