"""Copy pass rules (BUILD_SPEC §10.3). Pure: length budgets, structural protection, strict-mode
candidates, the prompt, and salvaging a partial reply."""

import json
import math
import re
from dataclasses import dataclass, field
from typing import Any

from app.engines import targeting
from app.engines.fragments import Fragment
from app.models.template import LengthCap

CHUNK_SIZE = 40
NEIGHBOUR_CHARS = 120
STRICT_MIN_CHARS = 20
STRICT_MIN_WORDS = 3

COUNTDOWN_UNIT = re.compile(r"^(?:days?|hrs?|hours?|mins?|minutes?|secs?|seconds?)$", re.I)
BYLINE = re.compile(r"^(?:written\s+)?by\s+[A-Z]", re.I)
JOB_TITLE_HINT = re.compile(r"(?:title|role|job|position|credential)", re.I)
BADGE_HINT = re.compile(r"badge|chip|pill|tag\b|label", re.I)


def length_budget(fragment: Fragment, caps: list[LengthCap]) -> int:
    """max(chars + 12, ceil(chars * 1.15)), lowered by any cap whose `match` is in the
    fragment's context."""
    budget = max(fragment.chars + 12, math.ceil(fragment.chars * 1.15))
    for cap in caps:
        if cap.match in fragment.context:
            budget = min(budget, cap.max_chars)
    return budget


def is_structural(fragment: Fragment) -> bool:
    """Text the copy pass must leave alone even though it has letters: countdown units, short
    badges, bylines, short job titles and one-word all-caps labels."""
    text = fragment.text
    if COUNTDOWN_UNIT.match(text) or BYLINE.match(text):
        return True
    if fragment.words <= 3 and BADGE_HINT.search(fragment.context):
        return True
    if fragment.words <= 4 and JOB_TITLE_HINT.search(fragment.context):
        return True
    return fragment.words == 1 and text.isupper() and len(text) <= 14


def protect(fragments: list[Fragment], replacements: dict[str, str]) -> dict[str, str]:
    """Drops replacements for locked and structural fragments (the original stays)."""
    keep = {f.id for f in fragments if not f.locked and not is_structural(f)}
    return {k: v for k, v in replacements.items() if k in keep}


def strict_candidates(fragments: list[Fragment], replacements: dict[str, str]) -> list[str]:
    """Substantial fragments (≥ 20 characters and ≥ 3 words) that came back unchanged."""
    return [
        f.id
        for f in fragments
        if f.chars >= STRICT_MIN_CHARS
        and f.words >= STRICT_MIN_WORDS
        and replacements.get(f.id, f.text).strip() == f.text
    ]


def rewritable(fragments: list[Fragment]) -> list[Fragment]:
    return [f for f in fragments if not f.locked and not is_structural(f)]


def chunks(items: list[Fragment], size: int = CHUNK_SIZE) -> list[list[Fragment]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


# ── the reply ────────────────────────────────────────────────────────────────

REPLY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "replacements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "text": {"type": "string"}},
                "required": ["id", "text"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["replacements"],
    "additionalProperties": False,
}
_PAIR = re.compile(r'"id"\s*:\s*"(f\d{4})"\s*,\s*"text"\s*:\s*("(?:[^"\\]|\\.)*")')


def parse_reply(text: str) -> dict[str, str]:
    """{fragment id: replacement} from the model's JSON, salvaging complete pairs from a reply
    cut off part-way (e.g. at max_tokens)."""
    try:
        data = json.loads(text)
        items = data.get("replacements", []) if isinstance(data, dict) else []
        return {
            str(i["id"]): str(i["text"])
            for i in items
            if isinstance(i, dict) and "id" in i and "text" in i
        }
    except ValueError:
        pass
    found: dict[str, str] = {}
    for match in _PAIR.finditer(text):
        try:
            found[match.group(1)] = json.loads(match.group(2))
        except ValueError:
            continue
    return found


# ── the prompt ───────────────────────────────────────────────────────────────

FIXED_RULES = (
    "Rules:\n"
    "- No em dashes or en dashes. No filler words.\n"
    "- No health claims: never say the product cures, treats, prevents, heals or diagnoses "
    "anything, and no medical outcomes in testimonials.\n"
    "- Never invent facts: no prices, numbers, ingredients, awards, certifications, studies or "
    "results that are not in the brand and product facts.\n"
    "- Keep each fragment's job: a heading stays a heading, a button stays a short action, a "
    "question stays a question. Stay within each fragment's character budget.\n"
    "- Fragments are pieces of sentences around fixed words (names, prices). Read the text "
    "before and after so the sentence still reads naturally.\n"
    "- Remove every trace of any other brand or product the original text mentions.\n"
    '- Return "" only for navigation, legal or interface text that should disappear.'
)
TYPE_RULES = {
    "advertorial": (
        "Template type: advertorial. Write as a personal, editorial story: first person, "
        "specific and calm. The product appears as the discovery, not as an advert."
    ),
    "listicle": "Template type: listicle. Keep the numbered list format, one idea per item.",
    "versus": (
        "Template type: versus. Compare fairly; never name real competitors unless the "
        "original text already does."
    ),
    "comparison": (
        "Template type: comparison. Keep comparisons factual and grounded in the product facts."
    ),
    "long_form": "Template type: long-form sales letter. Keep the narrative arc and the headings.",
    "product_page": "Template type: product page. Clear, scannable product copy.",
    "top5_ranking": (
        "Template type: top 5 ranking. The brand's product is the #1 pick; keep the ranking "
        "structure."
    ),
}


@dataclass
class CopyBrief:
    brand_name: str
    product_name: str
    language: str = "en"
    product_facts: dict[str, Any] = field(default_factory=dict)
    voice: str | None = None
    brand_md: str | None = None
    brand_context: str | None = None
    voice_examples: list[str] = field(default_factory=list)
    cta: str | None = None
    targeting: str | None = None
    template_type: str = "other"
    template_rules: str = ""


def targeting_block(wizard: dict[str, Any]) -> str | None:
    """The wizard's audience, emphasis and author as an OPERATOR TARGETING block (BUILD_SPEC §9);
    None when the build has no targeting (test builds)."""
    return targeting.brief_extra(wizard)


def system_prompt(brief: CopyBrief) -> str:
    """BUILD_SPEC §10.3 order: brand and product, voice, targeting, fixed rules, template type
    rules, template copy rules, language."""
    facts = {k: v for k, v in brief.product_facts.items() if v}
    parts = [
        "You rewrite the text of a landing-page template for a brand's product, fragment by "
        "fragment.",
        f"Brand: {brief.brand_name}. Product: {brief.product_name}.",
        "Product facts (JSON): " + json.dumps(facts, ensure_ascii=False),
    ]
    voice = brief.brand_md or brief.voice
    if voice:
        parts.append(f"Brand voice: {voice}")
    if brief.brand_context:
        parts.append(f"Brand context: {brief.brand_context}")
    if brief.voice_examples:
        parts.append("Lines in the brand's voice: " + " | ".join(brief.voice_examples[:3]))
    if brief.cta:
        parts.append(f"Preferred button text: {brief.cta}")
    if brief.targeting:
        parts.append(f"OPERATOR TARGETING:\n{brief.targeting}")
    parts.append(FIXED_RULES)
    if brief.template_type in TYPE_RULES:
        parts.append(TYPE_RULES[brief.template_type])
    if brief.template_rules.strip():
        parts.append(f"TEMPLATE-SPECIFIC RULES: {brief.template_rules.strip()}")
    parts.append(f"Write every replacement in this language: {brief.language}.")
    return "\n\n".join(parts)


def chunk_prompt(chunk: list[Fragment], everything: list[Fragment], budgets: dict[str, int]) -> str:
    """The user turn for one chunk: each fragment with its budget and its neighbours' text."""
    position = {f.id: i for i, f in enumerate(everything)}
    items = []
    for fragment in chunk:
        i = position[fragment.id]
        before = everything[i - 1].text[-NEIGHBOUR_CHARS:] if i > 0 else ""
        after = everything[i + 1].text[:NEIGHBOUR_CHARS] if i + 1 < len(everything) else ""
        items.append(
            {
                "id": fragment.id,
                "text": fragment.text,
                "where": fragment.context,
                "max_chars": budgets[fragment.id],
                "before": before,
                "after": after,
            }
        )
    return (
        "Rewrite each fragment below. Return one replacement for every id, each within its "
        "max_chars.\n" + json.dumps(items, ensure_ascii=False)
    )


def shorten_prompt(over: list[tuple[Fragment, str, int]]) -> str:
    items = [
        {"id": f.id, "text": text, "max_chars": budget, "original": f.text}
        for f, text, budget in over
    ]
    return (
        "These replacements are too long. Shorten each to at most max_chars characters, keeping "
        "its meaning and voice. Return every id.\n" + json.dumps(items, ensure_ascii=False)
    )


def strict_prompt(unchanged: list[Fragment], budgets: dict[str, int]) -> str:
    items = [{"id": f.id, "text": f.text, "max_chars": budgets[f.id]} for f in unchanged]
    return (
        "These fragments came back unchanged. Rewrite each for the brand and product, in its "
        "voice, keeping the meaning. Return every id.\n" + json.dumps(items, ensure_ascii=False)
    )


def mock_reply(prompt: str) -> str:
    """Mock mode (D15): every fragment of three or more words gets a visible [mock] marker, so
    a mock build shows the copy pass ran without paying for it."""
    start = prompt.find("[")
    try:
        items = json.loads(prompt[start:]) if start >= 0 else []
    except ValueError:
        items = []
    replacements = []
    for item in items:
        text = str(item.get("text", ""))
        replacements.append(
            {"id": item.get("id"), "text": f"[mock] {text}" if len(text.split()) >= 3 else text}
        )
    return json.dumps({"replacements": replacements})
