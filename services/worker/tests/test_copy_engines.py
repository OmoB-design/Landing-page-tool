"""Copy pass engines (BUILD_SPEC §10.3) and the export (§12.2). Pure: no database, no network."""

import base64
import json
from pathlib import Path

from app.engines import copy_rules as rules
from app.engines.export import export_page
from app.engines.fragments import Fragment, dump, reinject
from app.engines.html import parse
from app.models.template import LengthCap

PAGE = (
    Path(__file__).resolve().parents[3]
    / "templates"
    / "library"
    / "advertorial-fixture"
    / "index.html"
).read_text()


def frag(text: str, context: str = "p", *, locked: bool = False) -> Fragment:
    return Fragment(id="f0001", text=text, context=context, locked=locked, section=None)


# ── fragments ────────────────────────────────────────────────────────────────


def test_fragments_are_text_with_letters_or_prices_in_document_order() -> None:
    html = (
        '<html><head><title>Title text</title></head><body><section data-lp-section="hero" '
        'data-lp-role="hero"><h1 class="big bold extra">Hello there</h1><span>4.8</span>'
        "<span>12,000+</span><p>  Only $29 today  </p><script>var x = 'no'</script>"
        "<svg><text>Logo</text></svg><span data-lp-price>$29.00</span></section></body></html>"
    )
    fragments = dump(html)
    assert [f.text for f in fragments] == ["Hello there", "Only $29 today", "$29.00"]
    assert [f.id for f in fragments] == ["f0001", "f0002", "f0003"]
    assert fragments[0].context == "h1.big.bold@hero" and fragments[0].section == "hero"
    assert fragments[2].locked and not fragments[0].locked


def test_template_slots_and_locked_text_are_never_rewritable() -> None:
    fragments = dump(PAGE, extra_locked=("data-lp-usp-text",))
    locked = {f.text for f in fragments if f.locked}
    assert {"Sample Serum", "Fixture Co", "By Dana Wells", "$29.00", "30 ml"} <= locked
    assert "One step, under a minute" in locked  # filled from the product's selling points
    assert not next(f for f in fragments if f.text.startswith("For years my mornings")).locked


def test_reinjection_keeps_whitespace_and_skips_drifted_nodes() -> None:
    html = "<p>  Old one  </p><p>Old two</p><p>Old three</p>"
    originals = {"f0001": "Old one", "f0002": "Old two", "f0003": "Old three"}
    drifted = html.replace("Old two", "Changed meanwhile")
    out, stats = reinject(
        drifted, {"f0001": "New one", "f0002": "New two", "f0003": ""}, originals, allow_empty=False
    )
    assert "<p>  New one  </p>" in out
    assert "Changed meanwhile" in out and stats["drift"] == ["f0002"]
    assert "Old three" in out and stats["applied"] == 1  # owned: "" keeps the original
    out, stats = reinject(html, {"f0003": ""}, originals, allow_empty=True)
    assert "Old three" not in out and stats["applied"] == 1  # clones: "" removes it


# ── rules ────────────────────────────────────────────────────────────────────


def test_length_budgets_and_caps() -> None:
    assert rules.length_budget(frag("x" * 40), []) == 52  # chars + 12
    assert rules.length_budget(frag("x" * 200), []) == 230  # 15 % more
    caps = [LengthCap(match="h1", max_chars=60), LengthCap(match="summary", max_chars=20)]
    assert rules.length_budget(frag("x" * 70, "h1@hero"), caps) == 60
    assert rules.length_budget(frag("x" * 10, "p"), caps) == 22


def test_structural_labels_are_protected() -> None:
    assert rules.is_structural(frag("Hours"))
    assert rules.is_structural(frag("By Dr. Jane Wells"))
    assert rules.is_structural(frag("Reader story", "span.badge@hero"))
    assert rules.is_structural(frag("Head of Research", "div.author-title"))
    assert rules.is_structural(frag("SALE"))
    assert not rules.is_structural(frag("Why this one is different", "h2@mechanism"))
    fragments = [
        Fragment("f0001", "SALE", "span", False, None),
        Fragment("f0002", "A real sentence here", "p", False, None),
        Fragment("f0003", "Locked text", "p", True, None),
    ]
    kept = rules.protect(fragments, {"f0001": "x", "f0002": "y", "f0003": "z"})
    assert kept == {"f0002": "y"}


def test_strict_candidates_are_substantial_and_unchanged() -> None:
    fragments = [
        Fragment("f0001", "This sentence stayed exactly the same", "p", False, None),
        Fragment("f0002", "This sentence was rewritten by the model", "p", False, None),
        Fragment("f0003", "Too short", "p", False, None),
    ]
    replacements = {
        "f0001": "This sentence stayed exactly the same",
        "f0002": "A new sentence",
        "f0003": "Too short",
    }
    assert rules.strict_candidates(fragments, replacements) == ["f0001"]


def test_replies_are_parsed_and_partial_ones_salvaged() -> None:
    good = json.dumps(
        {"replacements": [{"id": "f0001", "text": "One"}, {"id": "f0002", "text": 'Two "quoted"'}]}
    )
    assert rules.parse_reply(good) == {"f0001": "One", "f0002": 'Two "quoted"'}
    cut = good[:-12]  # cut off mid-way through the second item
    assert rules.parse_reply(cut) == {"f0001": "One"}
    assert rules.parse_reply("not json") == {}


def test_the_system_prompt_follows_the_spec_order() -> None:
    brief = rules.CopyBrief(
        brand_name="Graza", product_name="Drizzle", language="en-US",
        product_facts={"price": "21.00", "selling_points": ["Made for finishing"], "specs": []},
        voice="Playful and plain-spoken", voice_examples=["Squeeze it on everything"],
        cta="Shop now", targeting="Audience: home cooks", template_type="advertorial",
        template_rules="First-person reader story.",
    )  # fmt: skip
    prompt = rules.system_prompt(brief)
    order = [
        "Brand: Graza", "Brand voice", "Lines in the brand's voice", "Preferred button text",
        "OPERATOR TARGETING", "Rules:", "Template type: advertorial", "TEMPLATE-SPECIFIC RULES",
        "Write every replacement in this language: en-US",
    ]  # fmt: skip
    positions = [prompt.index(part) for part in order]
    assert positions == sorted(positions)
    assert '"specs"' not in prompt  # empty facts are left out
    assert "No health claims" in prompt


def test_targeting_comes_from_the_wizard() -> None:
    assert rules.targeting_block({}) is None
    block = rules.targeting_block(
        {"audience": "Busy parents", "audience_gender": "women", "audience_age": "35-44",
         "emphasis": {"benefits": ["Saves time"], "objections": ["Price"]}}
    )  # fmt: skip
    assert block == (
        "Audience: Busy parents (women, 35-44)\nLead with these benefits: Saves time\n"
        "Answer these objections: Price"
    )


def test_chunk_prompts_carry_budgets_and_neighbours() -> None:
    fragments = [
        Fragment("f0001", "I tried every routine out there.", "h1@hero", False, "hero"),
        Fragment("f0002", "Drizzle", "span@hero", True, "hero"),
        Fragment("f0003", "is the one I kept.", "h1@hero", False, "hero"),
    ]
    targets = rules.rewritable(fragments)
    budgets = {f.id: rules.length_budget(f, []) for f in targets}
    prompt = rules.chunk_prompt(targets, fragments, budgets)
    items = json.loads(prompt[prompt.index("[") :])
    assert [i["id"] for i in items] == ["f0001", "f0003"]
    assert items[1]["before"] == "Drizzle" and items[1]["max_chars"] == 30


def test_mock_replies_mark_sentences_only() -> None:
    items = [{"id": "f0001", "text": "A full sentence here"}, {"id": "f0002", "text": "Buy"}]
    prompt = "Rewrite.\n" + json.dumps(items)
    reply = rules.parse_reply(rules.mock_reply(prompt))
    assert reply == {"f0001": "[mock] A full sentence here", "f0002": "Buy"}


# ── export ───────────────────────────────────────────────────────────────────

ASSET = "http://127.0.0.1:54321/storage/v1/object/public/assets/org/a.png"


def fake_resolve(url: str) -> tuple[bytes, str] | None:
    if url == ASSET:
        return b"PNG", "image/png"
    if url == "http://127.0.0.1:54321/style.css":
        return f'body {{ background: url("{ASSET}") }}'.encode(), "text/css"
    return None


def test_export_inlines_our_assets_and_strips_markers() -> None:
    html = (
        '<html><head><link rel="stylesheet" href="http://127.0.0.1:54321/style.css">'
        f'<link rel="icon" href="{ASSET}"><meta property="og:image" content="{ASSET}">'
        f"<style>.hero {{ background-image: url('{ASSET}'); }}</style></head>"
        f'<body><section data-lp-section="hero"><img data-lp-img="1" src="{ASSET}" '
        f'srcset="{ASSET} 2x"><img src="https://elsewhere.test/x.jpg"></section></body></html>'
    )
    out, stats = export_page(html, fake_resolve)
    data = "data:image/png;base64," + base64.b64encode(b"PNG").decode()
    soup = parse(out)
    assert soup.select_one("img")["src"] == data  # type: ignore[index]
    assert not soup.select_one("img").has_attr("srcset")  # type: ignore[union-attr]
    assert soup.select_one('link[rel="icon"]')["href"] == data  # type: ignore[index]
    assert soup.find("link", rel="stylesheet") is None and out.count(data) >= 4
    assert soup.find("meta", property="og:image")["content"] == ASSET  # type: ignore[index]
    assert "data-lp-" not in out
    assert stats["inlined"] == 1 and stats["stylesheets"] == 1
    assert stats["failed"] == ["https://elsewhere.test/x.jpg"]
