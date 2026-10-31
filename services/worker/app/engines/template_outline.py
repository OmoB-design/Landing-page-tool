"""What the section editor shows about a template's page (BUILD_SPEC §8.3, B1.1b): an outline
of each top-level section, template checks (the Issues tab) and the template's own colours and
fonts (the Look tab). Pure."""

import math
import re
from typing import Any
from urllib.parse import urlsplit

from bs4 import BeautifulSoup, Tag

from app.engines.html import NON_TEXT, parse, style_text, text_nodes
from app.engines.sections import top_level_sections
from app.models.template import (
    SectionOutline,
    TemplateColour,
    TemplateIssue,
    TemplateLook,
    TextField,
)

WORDS_PER_MINUTE = 230
MAX_FIELDS = 6
MAX_FIELD_CHARS = 240
FIELD_SELECTOR = "h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, button, a[data-lp-cta]"
FIELD_LABELS = {"p": "Text", "li": "List item", "blockquote": "Quote", "figcaption": "Caption"}
NOT_CONTENT = NON_TEXT | {"link", "meta", "base"}
LETTER = re.compile(r"[^\W\d_]")
TOKEN = re.compile(r"--lp-(?P<name>[a-z-]+)\s*:\s*(?P<value>[^;}]+)")
COLOUR_TOKENS = (
    ("primary", "Primary"),
    ("primary-dark", "Dark"),
    ("tint", "Tint"),
    ("accent", "Accent"),
)


def _text(tag: Tag) -> str:
    """The element's visible text, without its item number, whitespace collapsed."""
    parts = [
        str(node)
        for node in text_nodes(tag)
        if node.find_parent(attrs={"data-lp-number": True}) is None
    ]
    return " ".join(" ".join(parts).split())


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _fields(section: Tag) -> list[TextField]:
    fields: list[TextField] = []
    taken: list[Tag] = []
    seen: set[str] = set()
    headings = 0
    for tag in section.select(FIELD_SELECTOR):
        if any(tag in t.descendants for t in taken):
            continue  # inside a field already taken (a link in a paragraph)
        text = _text(tag)
        if not text or not LETTER.search(text) or text in seen:
            continue  # desktop and phone copies of the same line count once
        taken.append(tag)
        seen.add(text)
        if tag.name and tag.name[0] == "h" and tag.name[1:].isdigit():
            label = "Headline" if headings == 0 else "Subheading"
            headings += 1
        elif tag.name in ("a", "button"):
            label = "Button"
        else:
            label = FIELD_LABELS.get(tag.name or "", "Text")
        fields.append(TextField(label=label, text=_clip(text, MAX_FIELD_CHARS)))
        if len(fields) == MAX_FIELDS:
            break
    if not fields:  # text in plain divs and spans (bars, badges): one field per element
        for node in text_nodes(section):
            parent = node.parent
            text = _text(parent) if isinstance(parent, Tag) else ""
            if text and LETTER.search(text) and text not in seen:
                seen.add(text)
                fields.append(TextField(label="Text", text=_clip(text, MAX_FIELD_CHARS)))
                if len(fields) == MAX_FIELDS:
                    break
    return fields


def _words(section: Tag) -> int:
    seen: set[str] = set()
    words = 0
    for node in text_nodes(section):
        text = " ".join(str(node).split())
        if text and text not in seen:
            seen.add(text)
            words += len(text.split())
    return words


def outline(html: str) -> list[SectionOutline]:
    """One entry per top-level section, in page order."""
    groups: dict[int, int] = {}
    result: list[SectionOutline] = []
    for section in top_level_sections(parse(html)):
        number = section.select_one("[data-lp-number]")
        fields = _fields(section)
        heading = next((f for f in fields if f.label == "Headline"), None)
        title = heading.text if heading else (fields[0].text if fields else "")
        result.append(
            SectionOutline(
                key=str(section["data-lp-section"]),
                number=number.get_text(strip=True) or None if number else None,
                title=_clip(title, 90),
                fields=fields,
                words=_words(section),
                images=len(section.select("img:not([data-lp-keep]), .lp-media-slot")),
                group=groups.setdefault(id(section.parent), len(groups)),
            )
        )
    return result


def read_minutes(words: int) -> int:
    return max(1, math.ceil(words / WORDS_PER_MINUTE))


def _visible(tag: Tag) -> bool:
    if tag.select_one("img, svg, video, picture, iframe"):
        return True
    return any(LETTER.search(str(node)) for node in text_nodes(tag))


def _untagged(root: Tag) -> list[Tag]:
    """Blocks with content that sit outside every section."""
    blocks: list[Tag] = []
    for child in root.find_all(True, recursive=False):
        if child.name in NOT_CONTENT or child.has_attr("data-lp-section"):
            continue
        if child.has_attr("data-lp-fixed"):
            continue  # page frame (progress bar, side rail) left outside sections on purpose
        if child.select_one("[data-lp-section]"):
            blocks.extend(_untagged(child))
        elif _visible(child):
            blocks.append(child)
    return blocks


def _describe(tag: Tag) -> str:
    classes = [c for c in tag.get_attribute_list("class") if c]
    snippet = _clip(_text(tag), 40)
    name = f"{tag.name}.{classes[0]}" if classes else str(tag.name)
    return f"{name}, “{snippet}”" if snippet else name


def _host(url: str) -> str:
    return urlsplit(url).hostname or url


def checks(
    html: str,
    keys: list[str],
    *,
    forbidden_terms: list[str] | None = None,
    asset_origins: tuple[str, ...] = (),
    cloned: bool = False,
) -> list[TemplateIssue]:
    """Template checks for the Issues tab, most serious first. `keys` are the template's
    section rows in order; `asset_origins` are where template images may load from. A clone
    (`cloned`, B2.2) has no `data-lp-*` slots: its blueprint names the logos and buy links, and
    the clone-only build steps deal with its images, links and chrome, so those checks are
    skipped and blocks outside sections are only noted."""
    soup = parse(html)
    issues: list[TemplateIssue] = []
    in_page = [str(s["data-lp-section"]) for s in top_level_sections(soup)]
    for key in keys:
        if key not in in_page:
            issues.append(
                TemplateIssue(
                    severity="error",
                    message=f"Section “{key}” is listed but isn't in the page.",
                    section=key,
                )
            )
    for key in in_page:
        if key not in keys:
            issues.append(
                TemplateIssue(
                    severity="warning",
                    message=f"Section “{key}” is in the page but not listed, so builds remove it.",
                )
            )
    body = soup.body or soup
    for block in _untagged(body):
        issues.append(
            TemplateIssue(
                severity="info" if cloned else "warning",
                message=f"A block outside every section ({_describe(block)}) can't be moved "
                "or removed.",
            )
        )
    if cloned:
        return _with_text_checks(issues, soup, body, forbidden_terms)
    if not soup.select_one("[data-lp-product]"):
        issues.append(
            TemplateIssue(
                severity="warning",
                message="No product photo slot (data-lp-product): builds won't show the product.",
            )
        )
    if not soup.select_one("[data-lp-cta]"):
        issues.append(
            TemplateIssue(
                severity="warning",
                message="No buttons are marked data-lp-cta, so none will link to the product.",
            )
        )
    outside_images = sorted(
        {
            _host(str(img["src"]))
            for img in soup.select("img[src]")
            if str(img["src"]).startswith(("http://", "https://"))
            and not str(img["src"]).startswith(asset_origins or ("\0",))
        }
    )
    if outside_images:
        issues.append(
            TemplateIssue(
                severity="warning",
                message="Images load from other sites: " + ", ".join(outside_images) + ".",
            )
        )
    unmarked = [
        img
        for img in soup.select("img")
        if not any(a.startswith("data-lp-") for a in img.attrs)
        and img.find_parent(attrs={"data-lp-keep": True}) is None
    ]
    if unmarked:
        count = len(unmarked)
        issues.append(
            TemplateIssue(
                severity="warning",
                message=f"{count} image{'s' if count != 1 else ''} without a slot "
                "(data-lp-product, -scene, -person, -logo or -keep) stay the same in every build.",
            )
        )
    if not soup.select_one("[data-lp-logo], [data-lp-brand]"):
        issues.append(
            TemplateIssue(
                severity="info",
                message="No logo slot or brand name slot: the brand's name won't appear.",
            )
        )
    links = sorted(
        {
            _host(str(a["href"]))
            for a in soup.select("a[href]")
            if str(a["href"]).startswith(("http://", "https://")) and not a.has_attr("data-lp-cta")
        }
    )
    if links:
        issues.append(
            TemplateIssue(
                severity="info",
                message="Links go to other sites: " + ", ".join(links) + ".",
            )
        )
    return _with_text_checks(issues, soup, body, forbidden_terms)


def _with_text_checks(
    issues: list[TemplateIssue],
    soup: BeautifulSoup,
    body: Any,
    forbidden_terms: list[str] | None,
) -> list[TemplateIssue]:
    """The scripts and forbidden-term notes every template gets, then most serious first."""
    scripts = [s for s in soup.select("script") if s.get("type") != "application/ld+json"]
    if scripts:
        count = len(scripts)
        issues.append(
            TemplateIssue(
                severity="info",
                message=f"{count} script{'s' if count != 1 else ''}: "
                f"{'they run' if count != 1 else 'it runs'} in exports, not in this preview.",
            )
        )
    text = " ".join(str(node) for node in text_nodes(body)).lower()
    mentioned: dict[str, str] = {}
    for term in forbidden_terms or []:
        if term.strip() and term.lower() in text:
            mentioned.setdefault(term.lower(), term)
    if mentioned:
        issues.append(
            TemplateIssue(
                severity="info",
                message="Mentions "
                + ", ".join(mentioned.values())
                + "; builds remove these words.",
            )
        )
    order = {"error": 0, "warning": 1, "info": 2}
    return sorted(issues, key=lambda issue: order[issue.severity])


def _font_name(stack: str) -> str:
    return stack.split(",")[0].strip().strip("'\"")


def look(html: str) -> TemplateLook:
    """The colours and fonts the template declares as `--lp-*` tokens (builds swap them for the
    brand's)."""
    css = "\n".join(style_text(tag) for tag in parse(html).select("style"))
    tokens: dict[str, str] = {}
    for match in TOKEN.finditer(css):
        value = match.group("value").strip()
        if not value.startswith("var("):
            tokens.setdefault(match.group("name"), value)
    return TemplateLook(
        colours=[
            TemplateColour(name=label, token=f"--lp-{name}", value=tokens[name])
            for name, label in COLOUR_TOKENS
            if name in tokens
        ],
        heading_font=_font_name(tokens["heading-font"]) if "heading-font" in tokens else None,
        body_font=_font_name(tokens["body-font"]) if "body-font" in tokens else None,
    )
