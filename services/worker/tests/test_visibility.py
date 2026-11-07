"""Hiding and showing (B4.4, D123: Shopify's eye): the element stays in the page, out of sight
everywhere the page goes, and showing it puts its own style back as it was."""

import pytest

from app.engines import visibility

PAGE = (
    "<html><body>"
    '<section data-lp-section="hero"><h1 style="color: red">Glow in 7 days</h1>'
    '<img data-lp-img="3" src="s.jpg"/></section>'
    '<section data-lp-section="faq"><p>Is it gentle?</p></section>'
    "</body></html>"
)


def test_a_section_hides_and_shows() -> None:
    html, owner, changed = visibility.toggle(PAGE, hidden=True, key="faq")
    assert changed and owner == "faq"
    assert "data-lp-hidden" in html and "display:none !important" in html
    back, _, changed = visibility.toggle(html, hidden=False, key="faq")
    assert changed and "data-lp-hidden" not in back and "display:none" not in back
    assert visibility.toggle(back, hidden=False, key="faq")[2] is False  # already showing


def test_a_line_keeps_its_own_style() -> None:
    html, owner, _ = visibility.toggle(PAGE, hidden=True, block=1)
    assert owner == "hero" and "color: red;display:none !important" in html
    back, _, _ = visibility.toggle(html, hidden=False, block=1)
    assert 'style="color: red"' in back and "data-lp-hidden" not in back


def test_a_picture_and_something_not_on_the_page() -> None:
    html, owner, _ = visibility.toggle(PAGE, hidden=True, image=3)
    assert owner == "hero" and 'data-lp-img="3"' in html and "display:none" in html
    with pytest.raises(visibility.NotOnPageError):
        visibility.toggle(PAGE, hidden=True, image=9)
