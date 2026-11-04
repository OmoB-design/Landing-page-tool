"""Lander's styling engine (BUILD_SPEC §11.3, B3.1d, D107): finding the box around a line by the
CSS that styles it, and setting a safe set of properties on it."""

import pytest

from app.engines import styling
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
