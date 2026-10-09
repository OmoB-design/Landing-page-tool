"""The compliance phrase list (BUILD_SPEC §13.1). Extend it here: each rule is a regular
expression (case-insensitive) with a category, a severity and the reason shown to the user.

High-risk findings block publish (§12.1); medium and low ones are warnings.
"""

from dataclasses import dataclass
from typing import Literal

Severity = Literal["high", "medium", "low"]


@dataclass(frozen=True)
class Rule:
    id: str
    category: str
    severity: Severity
    pattern: str
    reason: str


CONDITIONS = (
    r"cancer|tumou?rs?|diabetes|arthritis|alzheimer'?s|dementia|depression|anxiety disorder|"
    r"adhd|autism|eczema|psoriasis|rosacea|acne|hypertension|high blood pressure|heart disease|"
    r"obesity|insomnia|covid|infections?|diseases?|illness(?:es)?|disorders?|asthma|migraines?|"
    r"herpes|fibromyalgia|ibs|crohn'?s|thyroid"
)
CLAIM_VERBS = (
    r"cures?|cured|treats?|treated|treating|prevents?|prevented|preventing|"
    r"diagnos(?:e|es|ed|ing)|heals?|healed|healing|reverses?|reversed|reversing"
)

RULES: list[Rule] = [
    Rule(
        "disease_claim", "health", "high",
        rf"\b(?:{CLAIM_VERBS})\b(?:\W+\w+){{0,6}}?\W+(?:{CONDITIONS})\b|\b(?:{CONDITIONS})\b(?:\W+\w+){{0,3}}?\W+(?:{CLAIM_VERBS})\b",
        "Claims to cure, treat, prevent, diagnose, heal or reverse a condition (a drug claim).",
    ),
    Rule(
        "fda_approved", "regulatory", "high",
        r"\bfda[\s-]*(?:approved|cleared|certified|registered)\b",
        "Claims FDA approval or clearance.",
    ),
    Rule(
        "clinically_proven", "evidence", "high",
        r"\bclinically[\s-]+proven\b",
        "Says \"clinically proven\" without a cited study.",
    ),
    Rule(
        "guaranteed_results", "results", "high",
        r"\bguarantee[sd]?\s+(?:results?|to\s+work|weight\s+loss)\b|\b(?:results?|weight\s+loss)\s+guaranteed\b",
        "Guarantees results.",
    ),
    Rule(
        "weight_loss_amount", "results", "high",
        r"\b(?:lose|lost|drop|dropped|shed|melt)\s+(?:up\s+to\s+)?\d+\s*(?:lbs?|pounds|kg|kilos?|stone)\b",
        "Promises a specific amount of weight loss.",
    ),
    Rule(
        "doctor_recommended", "endorsement", "medium",
        r"\b(?:doctor|dermatologist|physician)[\s-]+(?:recommended|approved)\b",
        "Claims a professional endorsement; needs proof.",
    ),
    Rule(
        "number_one", "superlative", "medium",
        r"(?:#\s?1|\bno\.\s?1|\bnumber\s+one)\b",
        "\"#1\" needs a source.",
    ),
    Rule(
        "best", "superlative", "medium",
        r"\b(?:the\s+)?best[\s-](?:selling|rated|in\s+the\s+world)\b|\bworld'?s\s+best\b",
        "\"Best\" claims need a source.",
    ),
    Rule(
        "miracle", "hype", "low",
        r"\bmiracle\b|\bmagic\s+(?:pill|bullet|cure)\b",
        "Hype words invite scrutiny.",
    ),
    Rule(
        "risk_free", "hype", "low",
        r"\brisk[\s-]free\b|\bno\s+side[\s-]effects\b",
        "\"Risk-free\" and \"no side effects\" are hard to support.",
    ),
]  # fmt: skip
