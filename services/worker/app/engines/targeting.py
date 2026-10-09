"""Wizard targeting (BUILD_SPEC §9, D66): the wizard's choices become the copywriter's OPERATOR
TARGETING block (`brief_extra`), the image planner's preferences and the `targeting` record
stored on the build. Pure."""

from typing import Any

AUTHOR_VOICES = {
    "writer": "an article writer who tried the product and reports on it",
    "customer": "a customer telling the story of their own experience with the product",
    "influencer": "a content creator recommending the product to their followers",
    "expert": "someone who knows the field well and explains it plainly",
}
# BUILD_SPEC §9 / O5: an expert byline is a voice, never a qualification.
EXPERT_RULE = (
    "The author must never state or imply credentials, degrees, titles or licences (no "
    '"Dr.", "MD", "PhD", "RD", "nutritionist", "dermatologist", "board-certified") and must '
    "never invent qualifications or affiliations."
)


def brief_extra(wizard: dict[str, Any]) -> str | None:
    """Audience, emphasis and author as an OPERATOR TARGETING block; None when the wizard chose
    nothing (test builds made before the wizard)."""
    lines: list[str] = []
    audience = wizard.get("audience")
    if audience:
        extra = [
            v
            for v in (wizard.get("audience_gender"), wizard.get("audience_age"))
            if v and v != "any"
        ]
        lines.append(f"Audience: {audience}" + (f" ({', '.join(extra)})" if extra else ""))
    emphasis = wizard.get("emphasis") or {}
    for key, label in (
        ("benefits", "Lead with these benefits"),
        ("features", "Feature"),
        ("objections", "Answer these objections"),
    ):
        values = [v for v in emphasis.get(key, []) if v]
        if values:
            lines.append(f"{label}: " + "; ".join(values))
    author = wizard.get("author_type")
    if author in AUTHOR_VOICES:
        lines.append(
            f"Author: write as {AUTHOR_VOICES[author]}. Keep the template's point of view "
            "(first or third person) and its byline names."
        )
        if author == "expert":
            lines.append(EXPERT_RULE)
    return "\n".join(lines) or None


def compose(wizard: dict[str, Any]) -> dict[str, Any]:
    """The `targeting` record stored on the build and shown in its report."""
    emphasis = wizard.get("emphasis") or {}
    audience = wizard.get("audience") or None
    return {
        "audience": audience,
        "audience_gender": wizard.get("audience_gender") or "any",
        "audience_age": wizard.get("audience_age") or None,
        "emphasis": {k: list(emphasis.get(k, [])) for k in ("benefits", "features", "objections")},
        "author_type": wizard.get("author_type") or "writer",
        "image_prefs": {
            "ai": bool(wizard.get("ai_images", True)),
            "styles": list(wizard.get("image_styles", [])),
            "audience": audience,
        },
        "brief_extra": brief_extra(wizard),
    }
