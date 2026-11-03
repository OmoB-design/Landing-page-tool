"""What a finished step found (I3), as it rides on a progress event. Pure."""

from app.jobs.found import found


def test_nothing_found_is_none() -> None:
    assert found() is None
    assert found("  ", [None, "not a colour"]) is None


def test_colours_are_normalised_deduplicated_and_capped() -> None:
    result = found(colors=["#E4572E", "rgb(228, 87, 46)", "#abc", None, "#111", "#222", "#333"])
    assert result == {"text": None, "colors": ["#e4572e", "#aabbcc", "#111111", "#222222"]}


def test_text_is_one_short_line() -> None:
    assert found("Lumé\n  Skin") == {"text": "Lumé Skin", "colors": []}
    long = found("word " * 40)
    assert long is not None and long["text"] is not None
    assert len(long["text"]) == 80 and long["text"].endswith("…")
