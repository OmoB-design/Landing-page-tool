"""Compliance scan (BUILD_SPEC §13.1, both paths). Pure: the page's visible text and image alt
text are checked against `compliance_rules.RULES`. Reports; never changes the page."""

import re
from dataclasses import asdict, dataclass

from bs4 import Tag

from app.engines.compliance_rules import RULES, Rule
from app.engines.html import element_path, parse, text_nodes

SNIPPET_CHARS = 140
_COMPILED: list[tuple[Rule, re.Pattern[str]]] = [
    (r, re.compile(r.pattern, re.IGNORECASE)) for r in RULES
]


@dataclass(frozen=True)
class Finding:
    rule: str
    category: str
    severity: str
    text: str
    location: str
    reason: str


def _snippet(text: str, match: re.Match[str]) -> str:
    start = max(0, match.start() - 50)
    end = min(len(text), match.end() + 50)
    snippet = text[start:end].strip()
    return ("…" if start else "") + snippet[:SNIPPET_CHARS] + ("…" if end < len(text) else "")


def scan(html: str) -> dict[str, object]:
    soup = parse(html)
    findings: list[Finding] = []
    sources: list[tuple[str, Tag]] = []
    for node in text_nodes(soup):
        parent = node.parent
        if isinstance(parent, Tag) and node.strip():
            sources.append((str(node), parent))
    for img in soup.find_all("img", alt=True):
        if isinstance(img, Tag) and str(img["alt"]).strip():
            sources.append((str(img["alt"]), img))
    # Text split across inline tags ("clinically <b>proven</b>") is checked per block too.
    for block in soup.find_all(["p", "li", "h1", "h2", "h3", "h4", "blockquote", "td", "summary"]):
        if isinstance(block, Tag):
            sources.append((block.get_text(" ", strip=True), block))

    seen: set[tuple[str, str]] = set()
    for text, element in sources:
        for rule, pattern in _COMPILED:
            match = pattern.search(text)
            if not match:
                continue
            location = element_path(element)
            key = (rule.id, match.group(0).lower())
            if key in seen:
                continue
            seen.add(key)
            findings.append(
                Finding(
                    rule.id,
                    rule.category,
                    rule.severity,
                    _snippet(text, match),
                    location,
                    rule.reason,
                )
            )
    order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: order.get(f.severity, 3))
    counts = {level: sum(1 for f in findings if f.severity == level) for level in order}
    return {
        "findings": [asdict(f) for f in findings],
        "high_risk_count": counts["high"],
        "counts": counts,
        "clean": not findings,
    }
