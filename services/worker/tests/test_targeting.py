"""Wizard targeting (BUILD_SPEC §9, D66): the copywriter's block, the build's targeting record,
and the expert-author credential check."""

from app.engines.compliance import scan
from app.engines.targeting import EXPERT_RULE, brief_extra, compose

WIZARD = {
    "author_type": "influencer",
    "ai_images": True,
    "image_styles": ["ugc", "studio"],
    "audience": "Everyday Home Cooks: they cook most nights",
    "audience_gender": "any",
    "audience_age": "25-34",
    "emphasis": {
        "benefits": ["Bold, spicy pop"],
        "features": [],
        "objections": ["Is $21 worth it?"],
    },
}


def test_the_brief_names_audience_emphasis_and_author() -> None:
    assert brief_extra({}) is None
    assert brief_extra(WIZARD) == (
        "Audience: Everyday Home Cooks: they cook most nights (25-34)\n"
        "Lead with these benefits: Bold, spicy pop\n"
        "Answer these objections: Is $21 worth it?\n"
        "Author: write as a content creator recommending the product to their followers. "
        "Keep the template's point of view (first or third person) and its byline names."
    )


def test_an_expert_author_never_claims_credentials() -> None:
    block = brief_extra({"author_type": "expert"}) or ""
    assert "knows the field well" in block and EXPERT_RULE in block
    page = "<p>By Dr. Jane Hale, MD.</p><p>A board-certified pick.</p><p>Our 3RD bottle.</p>"
    findings = scan(page, author_type="expert")["findings"]
    assert isinstance(findings, list)
    rules = [(f["rule"], f["severity"]) for f in findings]
    assert rules.count(("expert_credentials", "high")) == 2
    assert ("expert_author", "low") in rules
    assert scan(page)["clean"] is True  # other authors: no credential rule, no note


def test_the_targeting_record_keeps_choices_and_image_preferences() -> None:
    record = compose(WIZARD)
    assert record["audience"] == WIZARD["audience"] and record["author_type"] == "influencer"
    assert record["emphasis"] == {
        "benefits": ["Bold, spicy pop"],
        "features": [],
        "objections": ["Is $21 worth it?"],
    }
    assert record["image_prefs"] == {
        "ai": True,
        "styles": ["ugc", "studio"],
        "audience": WIZARD["audience"],
    }
    assert record["brief_extra"] == brief_extra(WIZARD)
    desk = compose({"audience": "", "author_type": "writer"})
    assert desk["audience"] is None and desk["image_prefs"]["audience"] is None
