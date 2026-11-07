"""A page as editable Shopify theme files (B4.2, D121): static blocks at the right spots, block
types shared and uploaded first, the template's settings, Liquid kept out of the page's way, and
Shopify's limits checked before anything goes up."""

import json
import re
from pathlib import Path

import pytest

from app.engines import editor_map as em
from app.engines import shopify_render
from app.engines import shopify_theme as st

LIBRARY = Path(__file__).resolve().parents[3] / "templates" / "library"
SLUGS = sorted(p.name for p in LIBRARY.iterdir() if (p / "template.json").exists())
# A placed block: its type, its id, and what's passed along (which may hold a `%`, never `%}`).
CALL = re.compile(r'\{% content_for "block", type: "([^"]+)", id: "([^"]+)"(.*?)%\}')


def page(body: str) -> str:
    return (
        "<html><head><style>.hero{color:red}</style>"
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head>'
        f'<body class="body-2">{body}<script>alert(1)</script></body></html>'
    )


ROWS = [{"key": "hero", "role": "hero", "label": "Headline"}, {"key": "offer", "label": "Offer"}]
PAGE = page(
    '<div class="wrap"><section data-lp-section="hero"><h1>Glow in <em>7</em> days</h1>'
    '<p class="byline">By Dana Wells</p><img data-lp-product="" src="https://cdn.test/a.jpg" '
    'class="hero-img" alt="The serum" width="400"/></section>'
    '<section data-lp-section="offer"><p>Only <strong>$42</strong> today<br/>and free shipping</p>'
    '<a data-lp-cta="" class="btn" href="https://shop.test/p">Shop "now"</a>'
    '<iframe src="https://youtu.be/x" title="Clip"></iframe></section></div>'
)


def check_files(files: st.ThemeFiles) -> None:
    """What every set of files must be: each block placed has its type and its settings, Liquid
    raw blocks balance, and nothing uses a name Shopify keeps for itself."""
    template = json.loads(files.files[f"templates/page.{files.suffix}.json"])
    assert template["layout"] == "lp-page"
    assert template["order"] == [f"s{i}" for i in range(1, files.sections + 1)]
    for key, entry in template["sections"].items():
        path = f"sections/{entry['type']}.liquid"
        liquid = files.files[path]
        assert liquid.count("{% raw %}") == liquid.count("{% endraw %}")
        placed = {(m.group(1), m.group(2)) for m in CALL.finditer(liquid)}
        assert placed == {(b["type"], i) for i, b in entry["blocks"].items()}, key
        for match in CALL.finditer(liquid):
            assert " src:" not in match.group(3)  # Shopify keeps `src` for itself
        for block in entry["blocks"].values():
            assert block["static"] is True
            assert f"blocks/{block['type']}.liquid" in files.blocks
        assert entry["block_order"] == []
    assert f"assets/{files.suffix}.css" in files.files
    assert "layout/lp-page.liquid" in files.files


def test_a_page_becomes_sections_with_blocks_in_place() -> None:
    files = st.build(
        PAGE,
        em.derive(ROWS),
        slug="LUM-12",
        version=3,
        shop_files={"https://cdn.test/a.jpg": "a.jpg"},
    )
    check_files(files)
    assert files.suffix == "lp-lum-12-v3"
    assert (files.sections, files.texts, files.images, files.media) == (2, 4, 1, 1)
    hero = files.files["sections/lp-lum-12-v3-s1.liquid"]
    # A text block is its whole element (passed along, so it's selectable in Shopify's preview),
    # the words editable. The parents come along for the CSS, the body's classes on an outer div.
    assert '{% content_for "block", type: "lp-headline-rich", id: "t1", tag: "h1"' in hero
    assert "{{ block.shopify_attributes }}" in files.blocks["blocks/lp-headline-rich.liquid"]
    assert hero.startswith('{% raw %}<div class="lp-body body-2"><div class="wrap">')
    assert '"name": "Headline"' in hero
    template = json.loads(files.files["templates/page.lp-lum-12-v3.json"])
    hero_blocks = template["sections"]["s1"]["blocks"]
    assert hero_blocks["t1"]["settings"] == {"text": "Glow in <em>7</em> days"}
    picture = next(b for b in hero_blocks.values() if b["type"] == "lp-img-product")
    assert picture["settings"] == {"alt": "The serum", "image": "shopify://shop_images/a.jpg"}
    assert 'fallback: "https://cdn.test/a.jpg"' in hero and "class='hero-img'" in hero
    offer = template["sections"]["s2"]["blocks"]
    # Line breaks keep the words as HTML; the button is the whole link, words and address.
    assert offer["t3"]["type"] == "lp-paragraph-html"
    button = next(b for b in offer.values() if b["type"].startswith("lp-button"))
    assert button["settings"]["link"] == "https://shop.test/p"
    assert "Shop" in button["settings"]["label"]
    embed = next(b for b in offer.values() if b["type"] == "lp-embed")
    assert embed["settings"] == {"src": "https://youtu.be/x"}
    # The page's CSS, fonts first; scripts never go.
    css = files.files["assets/lp-lum-12-v3.css"]
    assert css.startswith('@import url("https://fonts.googleapis.com/css2?family=Inter");')
    assert ".hero{color:red}" in css
    assert all("alert(1)" not in c for c in files.files.values())
    assert all("data-lp-" not in c for c in files.files.values())
    # Block types: the ones the page uses.
    assert set(files.blocks) >= {
        "blocks/lp-headline-rich.liquid", "blocks/lp-byline.liquid",
        "blocks/lp-img-product.liquid", "blocks/lp-embed.liquid",
    }  # fmt: skip


def test_kept_together_sections_list_their_parts_as_group_blocks() -> None:
    page_html = page(
        '<div class="grid"><section data-lp-section="hero"><h1>A</h1></section>'
        '<section data-lp-section="offer"><p>B</p><img src="https://cdn.test/b.jpg"/></section>'
        "</div>"
    )
    files = st.build(
        page_html, em.derive(ROWS), slug="p", version=1,
        together=lambda tag: "grid" in (tag.get("class") or []),
    )  # fmt: skip
    check_files(files)
    assert files.sections == 1
    template = json.loads(files.files["templates/page.lp-p-v1.json"])
    groups = template["sections"]["s1"]["blocks"]
    assert [g["type"] for g in groups.values()] == ["lp-p-v1-p1", "lp-p-v1-p2"]
    assert set(groups["p2"]["blocks"]) == {"t2", "ioffer1"}  # nested: the part's own blocks
    group_file = files.blocks["blocks/lp-p-v1-p2.liquid"]
    assert "{{ block.shopify_attributes }}" in group_file and '"name": "Offer"' in group_file
    # The local render draws it as Shopify would: the same page, wrapped in sections.
    rendered = shopify_render.render(files)
    assert '<div class="grid"><section' in rendered and "<h1 >A</h1>" in rendered
    assert '<img src="https://cdn.test/b.jpg"' in rendered


def test_a_space_at_the_end_of_words_stays() -> None:
    files = st.build(
        page(
            '<section data-lp-section="hero"><div class="by"><span class="a">Written by </span>'
            '<span class="b">Jo Kim</span></div></section>'
        ),
        em.derive(ROWS[:1]), slug="p", version=1,
    )  # fmt: skip
    assert 'trail: " "' in files.files["sections/lp-p-v1-s1.liquid"]
    assert "Written by </span>" in shopify_render.render(files)


def test_values_passed_to_blocks_keep_the_liquid_tag_whole() -> None:
    assert st._liquid_string('a "quoted" %} and }} here') == (
        '"a &quot;quoted&quot; %&#125; and }&#125; here"'
    )
    assert st._liquid_string(" ") == '" "'  # a lone space is kept


@pytest.mark.parametrize("slug", SLUGS)
def test_every_library_template_makes_valid_files(slug: str) -> None:
    folder = LIBRARY / slug
    manifest = json.loads((folder / "template.json").read_text())
    html = (folder / "index.html").read_text()
    files = st.build(html, em.derive(manifest["sections"]), slug=f"{slug}-1", version=1)
    check_files(files)
    result = em.report(em.plan(html, em.derive(manifest["sections"])), slug)
    assert files.sections == len(result.sections)
    assert files.texts == result.texts and files.images == result.images
    assert all(len(k) <= em.MAX_FILE_KEY for k in [*files.blocks, *files.files])
    for content in files.files.values():
        assert len(content.encode()) < st.MAX_SECTION_BYTES * 4


def test_shopifys_limits_stop_it_before_upload() -> None:
    huge = page(
        '<section data-lp-section="s">'
        + "".join(f"<p>{'x' * 200} {i}</p>" for i in range(3000))
        + "</section>"
    )
    with pytest.raises(st.ThemeTooBigError, match="too"):
        st.build(huge, em.derive([{"key": "s", "label": "S"}]), slug="p", version=1)
    with pytest.raises(st.ThemeTooBigError, match="no sections"):
        st.build(page("<p>No sections</p>"), em.derive([]), slug="p", version=1)


def test_past_25_sections_the_rest_go_into_the_last() -> None:
    many = page(
        "".join(f'<section data-lp-section="s{i}"><p>Text {i}</p></section>' for i in range(27))
    )
    rows = [{"key": f"s{i}", "label": f"Part {i}"} for i in range(27)]
    files = st.build(many, em.derive(rows), slug="p", version=1)
    check_files(files)
    assert files.sections == 25 and files.texts == 27
    last = files.files["sections/lp-p-v1-s25.liquid"]
    assert last.count("content_for") == 3


def test_the_draft_page_and_theme_editor_addresses() -> None:
    from app.jobs.kinds.publish_shopify_editable import editor_url

    assert editor_url("four-abc.myshopify.com", 123, "lp-bre-6-v2") == (
        "https://admin.shopify.com/store/four-abc/themes/123/editor?template=page.lp-bre-6-v2"
    )
    assert st.file_names("https://cdn.shopify.com/s/files/1/2/files/a.jpg?v=9") == "a.jpg"
