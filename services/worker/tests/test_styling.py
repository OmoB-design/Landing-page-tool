"""Lander's styling engine (BUILD_SPEC §11.3, B3.1d, D107): finding the box around a line by the
CSS that styles it, and setting a safe set of properties on it."""

import pytest

from app.engines import styling
from app.engines.html import parse
from app.engines.styling import StyleError, Target

PAGE = (
    "<html><head><style>.byline { display: flex; gap: 12px } "
    ".badge { display: block; padding: 4px 18px 4px 10px; background: #eef; border-radius: 6px } "
    ".badge:hover { opacity: .8 }</style></head><body>"
    '<section data-lp-section="hero"><h1>Glow in a week</h1>'
    '<div class="byline"><span class="name">Clara Bennett</span>'
    '<div class="badge"><span>Verified buyer</span></div></div></section>'
    '<section data-lp-section="faq"><p>Is it gentle?</p></section></body></html>'
)


def test_it_describes_a_line_and_the_boxes_around_it_by_their_css() -> None:
    text = styling.describe(PAGE, Target(line=3))
    rows = text.splitlines()
    assert rows[0] == "line 3, up 0: <span> “Verified buyer”"
    assert rows[2] == "line 3, up 1: <div.badge> “Verified buyer”"
    assert "display: block; padding: 4px 18px 4px 10px; background: #eef" in rows[3]
    assert "opacity" not in rows[3]  # a hover rule doesn't style it at rest
    assert "line 3, up 2: <div.byline>" in text and "gap: 12px" in text
    assert "(section hero)" in text  # it stops at the section
    assert "section faq: <section> (section faq) “Is it gentle?”" in styling.describe(
        PAGE, Target(section="faq")
    )


def test_it_sets_allowed_properties_inline_and_refuses_the_rest() -> None:
    html, applied, refused = styling.apply(
        PAGE,
        Target(line=3, up=1),
        {
            "width": "fit-content",
            "padding": "4px 10px",
            "background-color": "var(--lp-accent)",
            "position": "fixed",
            "background": "url(https://x.test/a.png)",
            "display": "contents",
        },
    )
    assert applied == {
        "width": "fit-content",
        "padding": "4px 10px",
        "background-color": "var(--lp-accent)",
    }
    assert len(refused) == 3
    assert (
        '<div class="badge" style="width: fit-content; padding: 4px 10px; '
        'background-color: var(--lp-accent)">' in html
    )
    # "unset" takes an earlier value off again; a later value replaces it.
    html, _, _ = styling.apply(html, Target(line=3, up=1), {"width": "unset", "padding": "6px"})
    assert 'style="padding: 6px; background-color: var(--lp-accent)"' in html


def test_it_says_when_there_is_nothing_to_style() -> None:
    with pytest.raises(StyleError, match="no line 99"):
        styling.describe(PAGE, Target(line=99))
    with pytest.raises(StyleError, match="no section nope"):
        styling.apply(PAGE, Target(section="nope"), {"padding": "4px"})
    with pytest.raises(StyleError, match="Nothing set"):
        styling.apply(PAGE, Target(line=1), {"position": "absolute", "color": "red; x: y"})


def test_looking_marks_the_box_around_a_line_or_a_section() -> None:
    html, selector = styling.selector_for(PAGE, Target(line=3, up=1))
    assert selector == "[data-lp-look]"
    assert '<div class="badge" data-lp-look="">' in html
    html, _ = styling.selector_for(PAGE, Target(section="faq"))
    assert (
        'data-lp-look=""'
        in html.split('data-lp-section="faq"')[0][-60:]
        + html.split('data-lp-section="faq"')[1][:20]
    )


PILL = (
    "<html><head><style>.badge-img { width: 92px; height: auto }</style></head><body>"
    '<section data-lp-section="hero"><h1>Glow in a week</h1>'
    '<div class="byline"><div class="name">Clara Bennett</div>'
    '<img class="badge-img" src="https://cdn.example.test/verified.png" alt=""></div>'
    "<p>Sneaker fan</p></section></body></html>"
)


def test_elements_without_a_line_are_listed_and_reached_by_their_path() -> None:
    """The owner's ALL-1 ask: the Verified pill is a picture with no line of its own."""
    text = styling.describe(PILL, Target(line=2, up=1))
    assert "     child 1: <div.name> “Clara Bennett” (line 2)" in text
    assert "     child 2: <img.badge-img> “picture: no alt” (no line) · width: 92px" in text

    inside = styling.describe(PILL, Target(line=2, up=1, child="2"))
    assert inside.startswith("child 2: <img.badge-img>")

    html, applied, _ = styling.apply(
        PILL,
        Target(line=2, up=1, child="2"),
        {
            "width": "74px",
            "height": "22px",
            "object-fit": "cover",
            "object-position": "left center",
        },
    )
    assert applied["object-position"] == "left center"
    assert 'style="width: 74px; height: 22px; object-fit: cover' in html
    marked, selector = styling.selector_for(PILL, Target(line=2, up=1, child="2"))
    looked = parse(marked).select_one(selector)
    assert looked is not None and looked.name == "img"

    for path in ("3", "2.1", "0", "x"):
        with pytest.raises(StyleError):
            styling.apply(PILL, Target(line=2, up=1, child=path), {"width": "10px"})
