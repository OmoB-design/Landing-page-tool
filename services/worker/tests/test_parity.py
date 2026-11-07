"""The layout check (B4.3, D122): Shopify's render of an editable page compared with the page in a
browser, at desktop, tablet and phone, and the split fixed until they match: plain sections stay
apart, columns side by side are kept together, a sticky header works across sections."""

import pytest

from app.engines import editor_map as em
from app.publish import parity

pytest.importorskip("playwright")

STYLE = """
<style>
  body { margin: 0; font-family: sans-serif; }
  section { padding: 40px 24px; }
  p { margin: 0 0 12px; line-height: 1.5; }
  .wrap { max-width: 960px; margin: 0 auto; }
  .cols { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
  @media (max-width: 700px) { .cols { grid-template-columns: 1fr; } }
  .shell { overflow: hidden; padding: 0 8px; }
  .bar { position: sticky; top: 0; background: #222; color: #fff; padding: 12px; }
  .tall { height: 900px; }
</style>
"""


def page(body: str) -> str:
    return (
        f'<html><head><meta name="viewport" content="width=device-width">{STYLE}</head>'
        f"<body>{body}</body></html>"
    )


def rows(*keys: str) -> list[dict[str, str]]:
    return [{"key": k, "label": k.capitalize()} for k in keys]


def test_plain_sections_stay_apart() -> None:
    html = page(
        '<div class="wrap">'
        '<section data-lp-section="hero"><h1>Glow in 7 days</h1><p>A calm serum.</p></section>'
        '<section data-lp-section="proof"><p>Loved by thousands.</p></section>'
        '<section data-lp-section="offer"><p>Only $42 today.</p>'
        '<a data-lp-cta="" href="/x">Shop</a></section></div>'
    )
    result = parity.check(html, em.derive(rows("hero", "proof", "offer")), slug="p", version=1)
    assert result.matched and result.mode == "sections"
    assert result.files.sections == 3 and result.kept_together == []
    assert all(result.widths.values())
    assert all("data-parity" not in c for c in result.files.files.values())  # never uploaded


def test_columns_side_by_side_are_kept_together() -> None:
    html = page(
        '<section data-lp-section="top"><h1>The story</h1></section>'
        '<div class="cols"><div>'
        '<section data-lp-section="story"><p class="tall">Long story.</p></section>'
        '<section data-lp-section="more"><p>More of it.</p></section></div>'
        '<aside data-lp-section="card"><p>The drink I found</p></aside></div>'
    )
    result = parity.check(
        html, em.derive(rows("top", "story", "more", "card")), slug="p", version=1
    )
    assert result.matched and result.mode == "grouped"
    assert set(result.kept_together) == {"Story", "More", "Card"}
    assert result.files.sections == 2  # the title, then the columns as one section
    assert any(path.startswith("blocks/lp-p-v1-p") for path in result.files.blocks)


def test_a_sticky_header_works_across_sections() -> None:
    html = page(
        '<div class="shell">'
        '<header class="bar" data-lp-section="bar"><p>Jessica&#39;s 30-day review</p></header>'
        '<section data-lp-section="one"><p class="tall">One.</p></section>'
        '<section data-lp-section="two"><p class="tall">Two.</p></section></div>'
    )
    result = parity.check(html, em.derive(rows("bar", "one", "two")), slug="p", version=1)
    assert result.matched, result.log
    assert result.files.sections >= 1
