"""Phone layouts (BUILD_SPEC §11.2, B3.3b, D112). Pure: HTML in, HTML out.

Three layers, all inside `@media (max-width: 767px)` so desktop never changes:
- **phone rules** (`<style id="lp-phone-rules">`, every build): pictures and boxes never wider
  than the screen, no sideways scrolling, long words wrap, wide tables scroll;
- **phone fixes** (`<style id="lp-phone-fixes">`, Fix for phone): CSS Claude wrote from the
  phone screenshots and the check, cleaned here; a new run replaces it;
- **phone styles** (`<style id="lp-phone-styles">`, Lander's phone-only styling): a rule per
  element, by a class (`lp-pN`) that survives export.

`judge` turns the browser's measurements at 390 px into the phone check: nothing wider than the
screen, body text at least 14 px, buttons at least 40 px to tap, no text overlapping.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup, Tag

from app.engines.html import parse, serialize

PHONE = "(max-width: 767px)"
RULES_ID, FIXES_ID, STYLES_ID = "lp-phone-rules", "lp-phone-fixes", "lp-phone-styles"
PHONE_RULES = f"""@media {PHONE} {{
  html, body {{ max-width: 100%; overflow-x: clip; }}
  img, video, iframe, canvas, svg {{ max-width: 100% !important; height: auto; }}
  table {{ display: block; max-width: 100%; overflow-x: auto; }}
  pre {{ white-space: pre-wrap; }}
  h1, h2, h3, h4, p, li, a, blockquote, td, th, figcaption {{ overflow-wrap: break-word; }}
}}"""
MAX_CSS = 8000
MAX_RULES = 80
MIN_TEXT_PX = 14
MIN_TAP_PX = 40
_COMMENT = re.compile(r"/\*.*?\*/", re.S)
_FORBIDDEN = re.compile(
    r"@import|@charset|@font-face|@namespace|url\s*\(|expression\s*\(|javascript:|behavior\s*:"
    r"|-moz-binding|</|<!--|\\",
    re.I,
)
_RULE = re.compile(r"([^{}]+)\{([^{}]*)\}")
_PROP = re.compile(r"^-?[a-z][a-z-]*$")


# ── the stylesheets ───────────────────────────────────────────────────────────


def _head(soup: BeautifulSoup) -> Tag | None:
    head = soup.find("head")
    return head if isinstance(head, Tag) else None


def _set_style(soup: BeautifulSoup, style_id: str, css: str | None) -> None:
    head = _head(soup)
    if head is None:
        return
    existing = soup.find("style", attrs={"id": style_id})
    if not css:
        if isinstance(existing, Tag):
            existing.decompose()
        return
    if isinstance(existing, Tag):
        existing.string = css
        return
    tag = soup.new_tag("style", attrs={"id": style_id})
    tag.string = css
    head.append(tag)  # last, so it wins over the page's own rules at the same strength


def with_phone_rules(html: str) -> str:
    """The page with the phone rules (added once; updated if they were older)."""
    soup = parse(html)
    _set_style(soup, RULES_ID, PHONE_RULES)
    return serialize(soup)


def has_phone_rules(html: str) -> bool:
    return f'id="{RULES_ID}"' in html


def clean_css(css: str) -> tuple[str, list[str]]:
    """Claude's CSS as plain rules only: no imports, fonts, addresses or scripts, no media queries
    of its own (it's wrapped in the phone one), at most 80 rules. Returns the CSS and what was
    dropped (why)."""
    dropped: list[str] = []
    text = _COMMENT.sub("", css or "")
    # Statements like @import ...; or @charset ...; go first, so they can't swallow the next rule.
    text = re.sub(r"@[a-zA-Z-]+[^;{}]*;", "", text)
    # Unwrap media blocks Claude may have written itself: their rules are kept, the query isn't.
    text = re.sub(r"@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)\s*\}", r"\1", text)
    rules: list[str] = []
    for selector, body in _RULE.findall(text):
        selector = " ".join(selector.split())
        if (
            not selector
            or len(selector) > 300
            or selector.startswith("@")
            or _FORBIDDEN.search(selector)
        ):
            dropped.append(f"selector “{selector[:40]}”")
            continue
        decls = []
        for part in body.split(";"):
            prop, sep, value = part.partition(":")
            prop, value = prop.strip().lower(), " ".join(value.split())
            if not sep or not prop or not value:
                continue
            if not _PROP.match(prop) or _FORBIDDEN.search(value) or len(value) > 200:
                dropped.append(f"{prop}: {value[:30]}")
                continue
            decls.append(f"{prop}: {value}")
        if decls:
            rules.append(f"  {selector} {{ {'; '.join(decls)}; }}")
        if len(rules) >= MAX_RULES:
            dropped.append("rules past 80")
            break
    body = "\n".join(rules)
    if len(body) > MAX_CSS:
        body = body[:MAX_CSS].rsplit("\n", 1)[0]
        dropped.append("CSS past 8,000 characters")
    return body, dropped


def with_phone_fixes(html: str, css: str) -> str:
    """The page with Fix for phone's CSS (cleaned, inside the phone media query), replacing any
    earlier fixes; no CSS takes them off."""
    body, _ = clean_css(css)
    soup = parse(html)
    _set_style(soup, FIXES_ID, f"@media {PHONE} {{\n{body}\n}}" if body else None)
    return serialize(soup)


def phone_fixes(html: str) -> str:
    """The page's current Fix for phone CSS (the rules inside the media query), or ""."""
    soup = parse(html)
    tag = soup.find("style", attrs={"id": FIXES_ID})
    if not isinstance(tag, Tag):
        return ""
    text = tag.get_text()
    inner = text[text.find("{") + 1 : text.rfind("}")] if "{" in text else ""
    return inner.strip()


# ── Lander's phone-only styles ────────────────────────────────────────────────


def phone_class(soup: BeautifulSoup, node: Tag) -> str:
    """The element's phone-styles class (`lp-pN`), given it if it has none."""
    for name in node.get("class") or []:
        if isinstance(name, str) and re.fullmatch(r"lp-p\d+", name):
            return name
    used = {
        int(m.group(1))
        for tag in soup.select('[class*="lp-p"]')
        for c in (tag.get("class") or [])
        if isinstance(c, str) and (m := re.fullmatch(r"lp-p(\d+)", c))
    }
    name = f"lp-p{max(used, default=0) + 1}"
    node["class"] = " ".join([*(str(c) for c in node.get("class") or []), name])
    return name


def set_phone_styles(soup: BeautifulSoup, class_name: str, styles: dict[str, str]) -> None:
    """Merges `styles` into the element's phone-only rule (`unset` takes a property off); the
    rule is `!important`, so it wins over the element's own inline style on phones."""
    tag = soup.find("style", attrs={"id": STYLES_ID})
    rules: dict[str, dict[str, str]] = {}
    if isinstance(tag, Tag):
        for selector, body in _RULE.findall(tag.get_text().replace(f"@media {PHONE} {{", "")):
            key = selector.strip().lstrip(".")
            rules[key] = {
                p.strip(): v.replace("!important", "").strip()
                for p, _, v in (d.partition(":") for d in body.split(";"))
                if p.strip() and v.strip()
            }
    current = rules.setdefault(class_name, {})
    for prop, value in styles.items():
        if value == "unset":
            current.pop(prop, None)
        else:
            current[prop] = value
    rules = {k: v for k, v in rules.items() if v}
    css = "\n".join(
        f"  .{k} {{ {'; '.join(f'{p}: {v} !important' for p, v in decls.items())}; }}"
        for k, decls in rules.items()
    )
    _set_style(soup, STYLES_ID, f"@media {PHONE} {{\n{css}\n}}" if css else None)


# ── the phone check ───────────────────────────────────────────────────────────


@dataclass
class PhoneIssue:
    kind: str  # wide, small_text, tap, overlap
    title: str
    detail: str
    count: int
    # Up to three: the words in it (or what it is) and the section it's in.
    examples: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class PhoneCheck:
    passed: bool
    issues: list[PhoneIssue]

    def as_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "issues": [issue.__dict__ for issue in self.issues],
        }


def _examples(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, Any]] = set()
    out = []
    for row in rows:
        key = (row.get("text"), row.get("section"))
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {"text": row.get("text") or row.get("tag") or "", "section": row.get("section"),
             "path": row.get("path")}
        )  # fmt: skip
        if len(out) == 3:
            break
    return out


def judge(measured: dict[str, Any]) -> PhoneCheck:
    """The phone check from the browser's measurements at 390 px (`PHONE_CHECK_JS`)."""
    issues: list[PhoneIssue] = []
    wide = [w for w in measured.get("wide") or [] if (w.get("over") or 0) > 2]
    if wide or (measured.get("scroll_width") or 0) > (measured.get("width") or 0) + 2:
        over = max([int(w.get("over") or 0) for w in wide] or [0])
        issues.append(
            PhoneIssue(
                "wide", "Wider than the screen",
                f"Runs off the right edge by up to {over} px."
                if over
                else "The page scrolls sideways.",
                len({(w.get("text"), w.get("section")) for w in wide}) or 1, _examples(wide),
            )
        )  # fmt: skip
    small = measured.get("small") or []
    if small:
        least = min(float(s.get("size") or MIN_TEXT_PX) for s in small)
        issues.append(
            PhoneIssue(
                "small_text", f"Text smaller than {MIN_TEXT_PX} px",
                f"Some text is as small as {least:g} px on a phone.", len(small), _examples(small),
            )
        )  # fmt: skip
    taps = measured.get("taps") or []
    if taps:
        issues.append(
            PhoneIssue(
                "tap", "Buttons too small to tap",
                f"Buttons should be at least {MIN_TAP_PX} px tall and wide.", len(taps),
                _examples(taps),
            )
        )  # fmt: skip
    overlaps = measured.get("overlaps") or []
    if overlaps:
        issues.append(
            PhoneIssue(
                "overlap", "Text overlapping", "Some lines sit on top of each other.",
                len(overlaps), _examples(overlaps),
            )
        )  # fmt: skip
    return PhoneCheck(passed=not issues, issues=issues)


# Runs in the page at 390 px (Playwright's page.evaluate): what's wider than the screen, small
# text, small buttons and overlapping text, each with its words, section and a CSS path.
PHONE_CHECK_JS = (Path(__file__).with_name("phone_check.js")).read_text().split("\n", 4)[4]
