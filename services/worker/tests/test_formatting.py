"""Text formatting (B3.1g, D118): exactly the selected characters get the format, in one line or
across several; taking a format off splits what's around it so the rest keeps it; Word's sizes."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import agent
from app.engines import formatting, proof
from app.engines.formatting import Format, FormatError, Range
from app.engines.html import parse
from tests.conftest import DbUser, needs_db
from tests.test_api import fake_jwks  # noqa: F401 (autouse fixture)
from tests.test_desk import desk, post

PAGE = (
    "<html><body>"
    '<section data-lp-section="hero">'
    "<h1>Glow in 7 days</h1>"
    "<p>A calm serum for <strong>every skin</strong> type.</p>"
    '<p>Written by <span data-lp-lock="">Jessica Kim</span> today.</p>'
    "</section>"
    '<section data-lp-section="faq"><p>Is it <a href="/faq">gentle</a> on skin?</p></section>'
    "</body></html>"
)


def lines(html: str) -> list[Any]:
    return parse(html).select("h1, p")


def test_bold_reaches_exactly_the_selected_words_in_one_line() -> None:
    # "calm serum" in line 2 ("A calm serum for every skin type.")
    result = formatting.apply(PAGE, [Range(2, 2, 12)], Format(bold=True))
    p = lines(result.html)[1]
    assert str(p) == "<p>A <strong>calm serum</strong> for <strong>every skin</strong> type.</p>"
    assert (result.words, result.lines) == (2, 1)
    assert formatting.reason(Format(bold=True), result) == "Made 2 words bold in hero"


def test_a_selection_across_lines_formats_each_part() -> None:
    # From "7 days" in the heading to "A calm" in the next line.
    result = formatting.apply(PAGE, [Range(1, 8, 14), Range(2, 0, 6)], Format(highlight="#fff3a3"))
    h1, p = lines(result.html)[:2]
    assert str(h1) == (
        '<h1>Glow in <span data-lp-fmt="" style="background-color: #fff3a3">7 days</span></h1>'
    )
    assert p.decode_contents().startswith(
        '<span data-lp-fmt="" style="background-color: #fff3a3">A calm</span> serum'
    )
    assert formatting.reason(Format(highlight="#fff3a3"), result) == (
        "Highlighted text in 2 lines in hero"
    )


def test_taking_bold_off_part_of_a_bold_phrase_keeps_the_rest_bold() -> None:
    # "every" out of "every skin".
    result = formatting.apply(PAGE, [Range(2, 17, 22)], Format(bold=False))
    p = lines(result.html)[1]
    assert str(p) == "<p>A calm serum for every<strong> skin</strong> type.</p>"


def test_a_heading_bold_from_its_styles_is_made_normal_where_selected() -> None:
    result = formatting.apply(PAGE, [Range(1, 0, 4)], Format(bold=False))
    h1 = lines(result.html)[0]
    assert str(h1) == (
        '<h1><span data-lp-fmt="" style="font-weight: normal">Glow</span> in 7 days</h1>'
    )


def test_colour_and_size_replace_rather_than_pile_up() -> None:
    first = formatting.apply(PAGE, [Range(1, 0, 4)], Format(color="#ff0000")).html
    second = formatting.apply(first, [Range(1, 0, 4)], Format(color="var(--lp-accent)")).html
    h1 = lines(second)[0]
    assert h1.decode_contents().count("<span") == 1
    assert 'style="color: var(--lp-accent)"' in str(h1)
    sized = formatting.apply(second, [Range(1, 0, 4)], Format(size=36)).html
    assert "font-size: 36px" in sized
    unsized = formatting.apply(sized, [Range(1, 0, 4)], Format(size=0)).html
    assert "font-size" not in unsized and "color: var(--lp-accent)" in unsized
    uncoloured = formatting.apply(unsized, [Range(1, 0, 4)], Format(color="")).html
    assert str(lines(uncoloured)[0]) == "<h1>Glow in 7 days</h1>"


def test_links_underline_strike_and_clear() -> None:
    linked = formatting.apply(PAGE, [Range(2, 2, 6)], Format(link="https://lume.test")).html
    assert '<a href="https://lume.test">calm</a>' in linked
    unlinked = formatting.apply(PAGE, [Range(4, 6, 12)], Format(link="")).html
    assert str(lines(unlinked)[3]) == "<p>Is it gentle on skin?</p>"
    struck = formatting.apply(PAGE, [Range(2, 0, 6)], Format(strike=True, underline=True)).html
    assert "<u><s>A calm</s></u>" in struck or "<s><u>A calm</u></s>" in struck
    cleared = formatting.apply(struck, [Range(2, 0, 30)], Format(clear=True)).html
    assert str(lines(cleared)[1]) == "<p>A calm serum for every skin type.</p>"


def test_words_filled_from_data_can_be_formatted_and_stay_marked() -> None:
    # "Jessica Kim" in "Written by Jessica Kim today."
    result = formatting.apply(PAGE, [Range(3, 11, 22)], Format(italic=True))
    p = lines(result.html)[2]
    assert '<span data-lp-lock=""><em>Jessica Kim</em></span>' in str(p)


def test_it_refuses_what_it_cant_do() -> None:
    with pytest.raises(FormatError, match="isn't on the page"):
        formatting.apply(PAGE, [Range(99, 0, 3)], Format(bold=True))
    with pytest.raises(FormatError, match="Select some words"):
        formatting.apply(PAGE, [Range(1, 3, 3)], Format(bold=True))
    with pytest.raises(FormatError, match="web address"):
        formatting.apply(PAGE, [Range(1, 0, 4)], Format(link="javascript:alert(1)"))
    with pytest.raises(FormatError, match="colour"):
        formatting.apply(PAGE, [Range(1, 0, 4)], Format(color="red; position: fixed"))
    with pytest.raises(FormatError, match="6 to 200"):
        formatting.apply(PAGE, [Range(1, 0, 4)], Format(size=500))
    with pytest.raises(FormatError, match="Nothing to change"):
        formatting.apply(PAGE, [Range(1, 0, 4)], Format())
    button = '<body><section data-lp-section="x"><a href="/buy">Buy now</a></section></body>'
    with pytest.raises(FormatError, match="button"):
        formatting.apply(button, [Range(1, 0, 3)], Format(link="https://x.test"))


def test_formatted_lines_come_back_as_the_editor_shows_them() -> None:
    result = formatting.apply(PAGE, [Range(1, 0, 6), Range(2, 0, 4)], Format(bold=True))
    marked = proof.lines(result.html, {1, 2, 99})
    assert sorted(marked) == [1, 2]  # a line that isn't there is left out
    full = parse(proof.mark(result.html))
    for number, html in marked.items():
        element = full.select_one(f'[data-lp-block="{number}"]')
        assert element is not None and element.decode_contents() == html


def test_word_sizes_grow_and_shrink_as_word_does() -> None:
    assert formatting.grow(16) == 18 and formatting.grow(17) == 18 and formatting.grow(28) == 36
    assert formatting.grow(72) == 80 and formatting.grow(85) == 90
    assert formatting.shrink(18) == 16 and formatting.shrink(9) == 8 and formatting.shrink(8) == 7
    assert formatting.shrink(36) == 28 and formatting.shrink(80) == 72


# ── Buddy, and the desk ───────────────────────────────────────────────────────


def test_buddy_formats_words_inside_a_line() -> None:
    work = agent.Work(html=PAGE, rules={}, colors=None)
    _, failed, step = work.run(
        "format_text",
        {"line": 2, "text": "calm serum", "bold": True, "color": "#ff0000",
         "label": "Made “calm serum” bold and red"},
    )  # fmt: skip
    assert not failed and step.label == "Made “calm serum” bold and red"
    assert '<strong><span data-lp-fmt="" style="color: #ff0000">calm serum</span></strong>' in (
        work.html
    ) or '<span data-lp-fmt="" style="color: #ff0000"><strong>calm serum</strong></span>' in (
        work.html
    )
    assert step.change and step.change["styles"] == {"bold": "on", "color": "#ff0000"}
    missing, failed, _ = work.run("format_text", {"line": 2, "text": "nope", "bold": True})
    assert failed and "isn't in line 2" in str(missing)
    nothing, failed, _ = work.run("format_text", {"line": 2, "text": "calm"})
    assert failed and "how to format" in str(nothing)


@needs_db
def test_formatting_through_the_desk_is_one_undoable_change(
    client: TestClient, user: DbUser, finished: dict[str, Any]
) -> None:
    state = desk(client, user, finished)
    line = next(p for p in state["paragraphs"] if len(p["text"]) > 12 and not p["locked"])
    version = state["build"]["page_version"]
    done = post(
        client, user, finished, "format", base_version=version,
        ranges=[{"block": line["number"], "start": 0, "end": 5}], format={"bold": True},
    )  # fmt: skip
    assert done.status_code == 200, done.text
    after = done.json()
    assert after["build"]["page_version"] == version + 1
    assert (
        after["snapshots"][0]["reason"].startswith("Made ")
        and "bold" in (after["snapshots"][0]["reason"])
    )
    # The words read the same; only their look changed.
    assert (
        next(p for p in after["paragraphs"] if p["number"] == line["number"])["text"]
        == (line["text"])
    )
    # The formatted line comes back marked as the editor's page shows it, to swap in place.
    assert [x["block"] for x in after["lines"]] == [line["number"]]
    assert "<strong" in after["lines"][0]["html"] and "data-lp-frag" in after["lines"][0]["html"]
    stale = post(
        client, user, finished, "format", base_version=version,
        ranges=[{"block": line["number"], "start": 0, "end": 5}], format={"italic": True},
    )  # fmt: skip
    assert stale.status_code == 409
    odd = post(
        client, user, finished, "format", base_version=version + 1,
        ranges=[{"block": line["number"], "start": 0, "end": 5}], format={"link": "javascript:x"},
    )  # fmt: skip
    assert odd.status_code == 422 and "web address" in odd.json()["detail"]
