"""The residue scan (BUILD_SPEC §13.2, B2.3): how much of the source is still on a cloned page.
Pure; reports and never changes the page. Score = max(0, 100 - 7 * everything found)."""

import re

from bs4 import Tag

from app.engines.clone import CSS_URL
from app.engines.clone_build import URL_IN_TEXT, Hosts, Source
from app.engines.html import element_path, parse, style_text, text_nodes

PER_FINDING = 7
MAX_FINDINGS = 40
CLAIMS = re.compile(
    r"\bFDA\b|clinically[ -]proven|\bcGMP\b|money[ -]back guarantee|\bcures?\b|\bcured\b|"
    r"\bguaranteed\b",
    re.I,
)


def _where(tag: Tag | None) -> str:
    return element_path(tag) if isinstance(tag, Tag) else "page"


def _snippet(text: str, found: str) -> str:
    """The found words with a little of the sentence around them."""
    at = text.lower().find(found.lower())
    start = max(0, at - 40)
    end = min(len(text), at + len(found) + 40)
    clip = text[start:end].strip()
    return ("…" if start else "") + clip + ("…" if end < len(text) else "")


def scan(html: str, source: Source, hosts: Hosts) -> dict[str, object]:
    """Counts the source's names in visible text and alt text, foreign images (CSS backgrounds
    too), foreign links and inherited claims, with where each one is."""
    soup = parse(html)
    counts = {"brand": 0, "images": 0, "links": 0, "claims": 0}
    findings: list[dict[str, str]] = []

    def note(kind: str, text: str, tag: Tag | None) -> None:
        counts[kind] += 1
        if len(findings) < MAX_FINDINGS:
            findings.append({"kind": kind, "text": text, "where": _where(tag)})

    for node in text_nodes(soup):
        text = str(node)
        parent = node.parent if isinstance(node.parent, Tag) else None
        for found in source.find(text):
            note("brand", _snippet(text, found), parent)
        for match in CLAIMS.finditer(text):
            note("claims", _snippet(text, match.group(0)), parent)
    for tag in soup.find_all(alt=True):
        if isinstance(tag, Tag):
            alt = str(tag.get("alt") or "")
            for found in source.find(alt):
                note("brand", f"Image text: {_snippet(alt, found)}", tag)

    for img in soup.find_all("img"):
        if isinstance(img, Tag) and hosts.foreign(str(img.get("src") or "")):
            note("images", str(img.get("src")), img)
    for tag in soup.find_all(style=True):
        if isinstance(tag, Tag):
            for match in CSS_URL.finditer(str(tag.get("style") or "")):
                if hosts.foreign(match.group("url")):
                    note("images", match.group("url"), tag)
    for style in soup.find_all("style"):
        if isinstance(style, Tag):
            for match in CSS_URL.finditer(style_text(style)):
                url = match.group("url")
                if hosts.foreign(url) and not re.search(r"\.(woff2?|ttf|otf|eot)(\?|$)", url, re.I):
                    note("images", url, None)

    for link in soup.find_all(["a", "form"]):
        if not isinstance(link, Tag):
            continue
        target = str(link.get("href") or link.get("action") or "")
        if hosts.foreign(target):
            note("links", target, link)
    for tag in soup.find_all(["script", "link", "iframe", "source"]):
        if isinstance(tag, Tag):
            for attr in ("src", "href", "srcset"):
                for url in URL_IN_TEXT.findall(str(tag.get(attr) or "")):
                    if hosts.foreign(url):
                        note("links", url, tag)

    total = sum(counts.values())
    return {
        "score": max(0, 100 - PER_FINDING * total),
        "clean": total == 0,
        "counts": counts,
        "findings": findings,
    }
