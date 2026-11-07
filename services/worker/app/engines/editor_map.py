"""The editor map (B4.1, D120; BUILD_SPEC §12.6). Pure.

How a page divides into Shopify sections and which of its texts and images become blocks people can
edit in Shopify's theme editor. The old tool asked an AI "architect" for this; ours is worked out
from the markers every template already carries: each top-level `data-lp-section` is a section
(named from the template's own section label, at most 25 characters), each line the editor numbers
(`paragraphs`) is a text block, and each picture is an image block. A block's role (its block type
in Shopify, `lp-<role>`) comes from a rule in the map first, then our markers (`data-lp-cta`,
`-price`, `-number`, `-person`, `-product`, `-scene`, `-logo`…), then class hints, then the tag.

`derive` makes a template's map from its sections; `effective` brings a stored map up to date
with the template's sections now; `plan` is the dry run for one page (a template or a build):
what becomes editable, what stays as it is, and what goes over Shopify's limits; `report` sums it
up for the template editor's "Shopify editing" card. Nothing here talks to Shopify (that's B4.2).
"""

import hashlib
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, get_args

from bs4 import BeautifulSoup
from bs4.element import Tag
from pydantic import ValidationError
from soupsieve import SelectorSyntaxError

from app.engines.html import parse
from app.engines.paragraphs import _index
from app.engines.sections import DUPLICATE_KEY, top_level_sections
from app.models.editor_map import (
    EditorMap,
    ImageBlock,
    ImageRole,
    MapIssue,
    MapOverrides,
    MapPart,
    MapPlan,
    MapReport,
    MapSection,
    MapSectionSummary,
    MediaBlock,
    MediaKind,
    SectionParts,
    SectionPlan,
    TextBlock,
    TextRole,
    TextSetting,
)

# Shopify's limits (BUILD_SPEC §12.6; shopify.dev "Theme limits", 2026-11-06): 25 sections in a
# template. Blocks placed with `content_for "block"` (static blocks, which B4.2 uses) don't count
# toward the 50-a-section and 1,250-a-template block limits; the template's size (512 KB) is what
# bounds them, checked when the files are made.
MAX_SECTIONS = 25
MAX_NAME = 25
MAX_FILE_KEY = 50

TEXT_ROLES: tuple[str, ...] = get_args(TextRole)
IMAGE_ROLES: tuple[str, ...] = get_args(ImageRole)

# Parts that always stay exactly as they are: a dropdown's options and a drawn canvas can't hold
# blocks, and `data-lp-static` lets a template keep a part as it is on purpose. (Words in forms,
# videos and embeds are editable: owner, 2026-11-06.)
DEFAULT_KEEP_WHOLE = ["select", "canvas", "[data-lp-static]"]
# Every selector ever built in (B4.1's first version also kept forms, videos and embeds whole).
_BUILT_IN_EVER = {*DEFAULT_KEEP_WHOLE, "form", "iframe", "video", "audio"}

_PRICE = ("data-lp-price", "data-lp-variant-price", "data-lp-rank-price")
_NAME = ("data-lp-rank-name", "data-lp-product-name", "data-lp-variant-name")
_RATING = ("data-lp-rank-rating-value",)
_CLASS_HINTS: tuple[tuple[re.Pattern[str], TextRole], ...] = (
    (re.compile(r"byline|author"), "byline"),
    (re.compile(r"eyebrow|kicker|overline|pretitle|pre-title"), "eyebrow"),
    (re.compile(r"badge|pill|chip"), "badge"),
    (re.compile(r"caption"), "caption"),
    (re.compile(r"disclaimer|footnote|fine-?print|legal"), "footnote"),
)
_TAG_ROLES: dict[str, TextRole] = {
    "h1": "headline", "h2": "heading", "h3": "heading", "h4": "subheading", "h5": "subheading",
    "h6": "subheading", "p": "paragraph", "li": "list_item", "blockquote": "quote", "q": "quote",
    "figcaption": "caption", "summary": "question", "dd": "answer", "dt": "label",
    "label": "label", "td": "cell", "th": "cell", "small": "footnote", "button": "cta",
}  # fmt: skip
_SMALL_WORDS = {
    "a", "an", "and", "as", "at", "by", "for", "from", "how", "in", "into", "is", "it", "its",
    "my", "of", "on", "or", "our", "the", "their", "to", "we", "with", "you", "your", "",
}  # fmt: skip
_PRICE_ONLY = re.compile(r"^(?:from |now |only )?[$€£¥₹]\s?\d[\d.,]*(?:\s?(?:USD|EUR|GBP))?$", re.I)
_BYLINE = re.compile(r"^(?:by|written by|reviewed by)\s", re.I)
# Text in a plain container (a div or span): short is a label, long a paragraph.
_LABEL_CHARS = 40
# Inside a text, these keep it "inline rich text" in Shopify (bold, italic, links, line breaks).
_INLINE_RICH = {"strong", "b", "em", "i", "br"}
_LINK_ATTRS = {"href", "title", "target", "rel"}
_MEDIA_KINDS: dict[str, MediaKind] = {"video": "video", "iframe": "embed", "audio": "audio"}


# ── The map itself ───────────────────────────────────────────────────────────


def short_name(label: str, limit: int = MAX_NAME) -> str:
    """A section's name for Shopify: at most `limit` characters, cut at a word where possible."""
    text = " ".join(label.split()) or "Section"
    if len(text) <= limit:
        return text
    head = text[: limit + 1]
    words = (head.rsplit(" ", 1)[0] if " " in head else text[:limit]).split(" ")
    # Not ending on a small word ("Publication and", "One Bag for Every Part of").
    while len(words) > 1 and words[-1].lower().strip(",.;:&") in _SMALL_WORDS:
        words.pop()
    cut = " ".join(words)
    return cut[:limit].rstrip(" ,.;:-&\u2013\u2014") or text[:limit]


def _unique(name: str, seen: set[str]) -> str:
    candidate, n = name, 2
    while candidate.lower() in seen:
        suffix = f" {n}"
        candidate = short_name(name, MAX_NAME - len(suffix)) + suffix
        n += 1
    seen.add(candidate.lower())
    return candidate


def _key_name(key: str) -> str:
    return key.replace("-", " ").replace("_", " ").strip().capitalize() or "Section"


def derive(
    rows: list[dict[str, Any]],
    overrides: MapOverrides | None = None,
    *,
    source: str = "markup",
) -> EditorMap:
    """A template's map from its sections (`key`, `role`, `label`) and any rules set by hand."""
    extra = overrides or MapOverrides()
    seen: set[str] = set()
    sections = [
        MapSection(
            key=row["key"],
            name=_unique(
                short_name(
                    extra.names.get(row["key"]) or row.get("label") or _key_name(row["key"])
                ),
                seen,
            ),
            role=row.get("role") or "other",
        )
        for row in rows
    ]
    keep = [k for k in extra.keep_whole if k not in DEFAULT_KEEP_WHOLE]
    return EditorMap.model_validate(
        {"source": source, "sections": sections, "roles": extra.roles, "keep_whole": keep}
    )


def effective(stored: Any, rows: list[dict[str, Any]]) -> EditorMap:
    """The stored map brought up to date with the template's sections now: their names kept,
    sections added since named from their labels, sections gone left out. A map in an older
    format (the first analysis drafts) is worked out again."""
    base = derive(rows)
    if not stored:
        return base
    try:
        saved = EditorMap.model_validate(stored)
    except ValidationError:
        return base
    names = {s.key: s.name for s in saved.sections}
    seen: set[str] = set()
    sections = [
        s.model_copy(update={"name": _unique(names.get(s.key, s.name), seen)})
        for s in base.sections
    ]
    # Only parts kept whole by hand are stored; the built-in ones (of any earlier version) are
    # applied when the map is used.
    by_hand = [k for k in saved.keep_whole if k not in _BUILT_IN_EVER]
    return saved.model_copy(update={"sections": sections, "keep_whole": by_hand})


# ── Theme file names (B4.2 writes them; Shopify caps a key at 50 characters) ─────


def file_slug(slug: str) -> str:
    """A page's slug for its theme files: lower case, and long ones shortened to 14 characters, a
    dash and a 6-character hash (21 at most)."""
    clean = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-") or "page"
    if len(clean) <= 21:
        return clean
    return f"{clean[:14].rstrip('-')}-{hashlib.sha1(clean.encode()).hexdigest()[:6]}"


def longest_file_key(slug: str) -> int:
    """The longest theme file key a page with this slug can need (version 999, section 24)."""
    s = file_slug(slug)
    keys = [
        f"sections/lp-{s}-v999-s{MAX_SECTIONS}.liquid",
        f"templates/page.lp-{s}-v999.json",
        f"assets/lp-{s}-v999.css",
        f"sections/lp-{s}-v999-js.liquid",
        *(f"blocks/lp-{role.replace('_', '-')}.liquid" for role in TEXT_ROLES),
        *(f"blocks/lp-img-{role}.liquid" for role in IMAGE_ROLES),
    ]
    return max(len(k) for k in keys)


# ── The dry run ──────────────────────────────────────────────────────────────


def _collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _select(soup: BeautifulSoup, selector: str) -> set[int] | None:
    try:
        return {id(t) for t in soup.select(selector)}
    except (SelectorSyntaxError, ValueError, NotImplementedError):
        return None


def _within(tag: Tag, ids: set[int]) -> bool:
    return any(id(node) in ids for node in (tag, *tag.parents))


def _classes(tag: Tag) -> str:
    value: Any = tag.get("class") or []
    return " ".join(value if isinstance(value, list) else [str(value)]).lower()


def _sole(element: Tag, attrs: tuple[str, ...]) -> bool:
    """The element carries one of these markers, or its words are all one marked part."""
    if any(element.has_attr(a) for a in attrs):
        return True
    text = _collapse(element.get_text())
    return any(
        _collapse(part.get_text()) == text
        for part in element.find_all(lambda t: any(t.has_attr(a) for a in attrs))
    )


def _text_role(
    element: Tag,
    text: str,
    section_role: str,
    after_headline: bool,
    rules: list[tuple[set[int], str]],
) -> TextRole:
    for ids, role in rules:
        if id(element) in ids and role in TEXT_ROLES:
            return role  # type: ignore[return-value]
    if element.has_attr("data-lp-cta") or element.name == "a":
        return "cta"
    if _sole(element, _PRICE):
        return "price"
    if _sole(element, ("data-lp-number",)):
        return "number"
    if _sole(element, _RATING):
        return "rating"
    if _sole(element, _NAME):
        return "name"
    hints = " ".join(_classes(t) for t in (element, element.parent) if isinstance(t, Tag))
    for pattern, role in _CLASS_HINTS:
        if pattern.search(hints):
            return role
    if _PRICE_ONLY.match(text):
        return "price"
    if _BYLINE.match(text):
        return "byline"
    by_tag = _TAG_ROLES.get(element.name)
    if by_tag == "paragraph" and section_role == "hero" and after_headline:
        return "subheadline"
    if by_tag:
        return by_tag
    if element.name in ("div", "span", "strong", "b", "em", "i", "font", "section", "article"):
        return "label" if len(text) <= _LABEL_CHARS else "paragraph"
    return "text"


def _setting(element: Tag) -> TextSetting:
    tags = element.find_all(True)
    if not tags:
        return "text"
    for tag in tags:
        attrs = set(tag.attrs)
        if tag.name == "a" and attrs <= _LINK_ATTRS:
            continue
        if tag.name in _INLINE_RICH and not attrs:
            continue
        return "html"
    return "inline_richtext"


def _image_role(img: Tag, section_role: str, rules: list[tuple[set[int], str]]) -> ImageRole:
    for ids, role in rules:
        if id(img) in ids and role in IMAGE_ROLES:
            return role  # type: ignore[return-value]
    markers: tuple[tuple[str, ImageRole], ...] = (
        ("data-lp-logo", "logo"),
        ("data-lp-person", "person"),
        ("data-lp-product", "product"),
        ("data-lp-scene", "scene"),
    )
    for attr, role in markers:
        if img.has_attr(attr):
            return role
    sizes = [str(img.get(a) or "") for a in ("width", "height")]
    small = any(s.isdigit() and int(s) <= 48 for s in sizes)
    if small or "icon" in _classes(img):
        return "icon"
    return "hero" if section_role == "hero" else "image"


@dataclass
class WalkSection:
    """One Shopify section with the page's elements behind it (for B4.2's theme files)."""

    plan: SectionPlan
    # The marked section's element, or the loose parts gathered into it, in page order.
    roots: list[Tag] = field(default_factory=list)
    texts: list[tuple[Tag, TextBlock]] = field(default_factory=list)
    images: list[tuple[Tag, ImageBlock]] = field(default_factory=list)
    media: list[tuple[Tag, MediaBlock]] = field(default_factory=list)
    # Kept together (B4.3): the sections inside, each with its own blocks (they become group
    # blocks in Shopify, so its sidebar still lists them).
    members: list["WalkSection"] = field(default_factory=list)


@dataclass
class Walk:
    soup: BeautifulSoup
    sections: list[WalkSection]
    outside_texts: int
    outside_images: int
    issues: list[MapIssue]


def plan(
    html: str,
    editor_map: EditorMap,
    *,
    template: bool = False,
    together: Callable[[Tag], bool] | None = None,
) -> MapPlan:
    """What would become editable in Shopify for this page. `template`: the page is the template
    itself, so sections in its list but not on the page, and rules matching nothing, are noted.
    `together`: containers whose sections stay one Shopify section (B4.3's layout check)."""
    walked = walk(parse(html), editor_map, template=template, together=together)
    return MapPlan(
        sections=[s.plan for s in walked.sections],
        outside_texts=walked.outside_texts,
        outside_images=walked.outside_images,
        issues=walked.issues,
    )


def walk(
    soup: BeautifulSoup,
    editor_map: EditorMap,
    *,
    template: bool = False,
    together: Callable[[Tag], bool] | None = None,
) -> Walk:
    """The dry run on a parsed page, keeping each block's element (B4.2 turns them into files).
    `together` picks containers to keep whole (B4.3): every section and loose part inside the
    topmost one becomes a single Shopify section made of that container, so columns, grids and
    sticky parts that span its sections keep working."""
    issues: list[MapIssue] = []
    by_key = {s.key: s for s in editor_map.sections}

    keep: set[int] = set()
    for selector in [*DEFAULT_KEEP_WHOLE, *editor_map.keep_whole]:
        found = _select(soup, selector)
        if found is None:
            issues.append(MapIssue(level="error", message=f"“{selector}” isn't a valid selector."))
        else:
            keep |= found
    rules: list[tuple[set[int], str]] = []
    for rule in editor_map.roles:
        found = _select(soup, rule.match)
        if found is None:
            issues.append(
                MapIssue(level="error", message=f"“{rule.match}” isn't a valid selector.")
            )
            continue
        if rule.role not in TEXT_ROLES and rule.role not in IMAGE_ROLES:
            issues.append(MapIssue(level="error", message=f"“{rule.role}” isn't a block role."))
            continue
        if template and not found:
            issues.append(
                MapIssue(level="warning", message=f"The rule for “{rule.match}” matches nothing.")
            )
        rules.append((found, rule.role))

    root = soup.body or soup
    tags = top_level_sections(root)
    order = {id(t): i for i, t in enumerate(root.find_all(True))}
    holds_section: set[int] = set()
    for tag in tags:
        holds_section.update(id(parent) for parent in tag.parents)

    # Texts: the page's lines. A line inside another line (a bold phrase that the line numbering
    # counts on its own, in a div with text of its own) goes into it: one block, its words rich.
    entries = [e for e in _index(soup) if e.element is not None]
    elements = {id(e.element) for e in entries}
    inside = {
        id(e.element)
        for e in entries
        if e.element is not None and any(id(p) in elements for p in e.element.parents)
    }
    lines = [
        (e.number, e.element, _collapse(e.element.get_text()))
        for e in entries
        if e.element is not None and id(e.element) not in inside
    ]
    lines = [line for line in lines if line[2]]
    # A picture or video inside a text (in a paragraph, in a button) is part of that text's words
    # (kept as HTML), not a block of its own.
    in_lines = {id(line[1]) for line in lines}

    def inside_a_line(tag: Tag) -> bool:
        return any(id(parent) in in_lines for parent in tag.parents)

    pictures = [
        img
        for img in root.find_all("img")
        if isinstance(img, Tag) and img.find_parent("svg") is None and not inside_a_line(img)
    ]
    media = [
        m
        for m in root.find_all(["video", "iframe", "audio"])
        if isinstance(m, Tag) and not inside_a_line(m)
    ]

    # Parts outside every section get Shopify sections of their own (owner, 2026-11-06: everything
    # editable): neighbouring loose parts go together, named after the section before them.
    def loose_root(tag: Tag) -> Tag:
        node = tag
        while (
            isinstance(node.parent, Tag)
            and node.parent is not root
            and id(node.parent) not in holds_section
        ):
            node = node.parent
        return node

    marked = {id(t) for t in tags}

    def in_marked(tag: Tag) -> bool:
        return any(id(n) in marked for n in (tag, *tag.parents))

    loose: dict[int, Tag] = {}
    if tags:
        for tag in [line[1] for line in lines] + pictures + media:
            if not in_marked(tag):
                top = loose_root(tag)
                loose.setdefault(id(top), top)
    units = sorted(
        [(order.get(id(t), -1), "marked", t) for t in tags]
        + [(order.get(id(t), -1), "loose", t) for t in loose.values()],
        key=lambda u: u[0],
    )

    def group_of(tag: Tag) -> Tag | None:
        if together is None:
            return None
        found = None
        for parent in tag.parents:
            if not isinstance(parent, Tag) or parent is root or parent.name in ("body", "html"):
                break
            if together(parent):
                found = parent  # the topmost one wins
        return found

    def marked_name(tag: Tag) -> tuple[str, str, str]:
        """(key, name, role) for a marked section (a copy takes its original's name)."""
        key = str(tag.get("data-lp-section") or "")
        entry = by_key.get(key)
        suffix = ""
        if entry is None and (match := DUPLICATE_KEY.match(key)):
            entry = by_key.get(match.group("base"))
            suffix = f" {match.group('n')}" if entry else ""
        if entry is None:
            issues.append(
                MapIssue(
                    level="warning",
                    message=f"Section “{key}” isn't in the editor map; it's named from its key.",
                )
            )
            return key, _key_name(key), "other"
        return key, short_name(entry.name, MAX_NAME - len(suffix)) + suffix, entry.role

    owner: dict[int, int] = {}
    seen: set[str] = set()
    plans: list[SectionPlan] = []
    walks: list[WalkSection] = []
    previous: str | None = None
    for _, kind, tag in units:
        if kind == "loose":
            if (
                plans
                and plans[-1].loose
                and previous == plans[-1].key
                and group_of(walks[-1].roots[0]) is group_of(tag)
            ):
                owner[id(tag)] = len(plans) - 1  # next to the last loose part: same section
                walks[-1].roots.append(tag)
                continue
            name = (
                f"After {short_name(plans[-1].name or 'part', MAX_NAME - 6)}"
                if plans
                else "Page top"
            )
            key = f"loose-{sum(1 for p in plans if p.loose) + 1}"
            plans.append(
                SectionPlan(
                    key=key, name=_unique(name, seen), role="other", texts=[], images=[],
                    loose=True,
                )
            )  # fmt: skip
            walks.append(WalkSection(plan=plans[-1], roots=[tag]))
            owner[id(tag)] = len(plans) - 1
            previous = key
            continue
        key, name, role = marked_name(tag)
        plans.append(SectionPlan(key=key, name=_unique(name, seen), role=role, texts=[], images=[]))
        walks.append(WalkSection(plan=plans[-1], roots=[tag]))
        owner[id(tag)] = len(plans) - 1
        previous = key
    if template:
        on_page = {p.key for p in plans}
        for s in editor_map.sections:
            if s.key not in on_page:
                issues.append(
                    MapIssue(
                        level="warning",
                        message=f"Section “{s.name}” is in the template's list but not on the "
                        "page.",
                    )
                )

    def section_of(tag: Tag) -> int | None:
        for node in (tag, *tag.parents):
            if id(node) in owner:
                return owner[id(node)]
        return None

    outside_texts = outside_images = 0
    headline_seen: dict[int, bool] = {}
    for number, element, text in lines:
        index = section_of(element)
        if index is None:
            outside_texts += 1
            continue
        section = plans[index]
        if _within(element, keep):
            section.static += 1
            continue
        role = _text_role(element, text, section.role, headline_seen.get(index, False), rules)
        headline_seen[index] = role == "headline" or (
            headline_seen.get(index, False) and role == "subheadline"
        )
        block = TextBlock(line=number, role=role, setting=_setting(element), preview=text[:60])
        section.texts.append(block)
        walks[index].texts.append((element, block))
    for img in pictures:
        index = section_of(img)
        if index is None:
            outside_images += 1
            continue
        if _within(img, keep):
            plans[index].static += 1
            continue
        picture = ImageBlock(
            role=_image_role(img, plans[index].role, rules), src=str(img.get("src") or "")[:200]
        )
        plans[index].images.append(picture)
        walks[index].images.append((img, picture))
    # Videos and embeds: their address becomes something to change in Shopify.
    for item in media:
        index = section_of(item)
        if index is None:
            continue
        if _within(item, keep):
            plans[index].static += 1
            continue
        source = item.get("src") or next(
            (s.get("src") for s in item.find_all("source") if isinstance(s, Tag)), ""
        )
        clip = MediaBlock(kind=_MEDIA_KINDS[item.name], src=str(source or "")[:300])
        plans[index].media.append(clip)
        walks[index].media.append((item, clip))

    # Kept together (B4.3): the sections inside a container become one Shopify section made of it,
    # each still a part of its own (a group block), named after the first and last of them.
    if together is not None:
        grouped: list[WalkSection] = []
        holders: dict[int, WalkSection] = {}
        for walked in walks:
            container = group_of(walked.roots[0])
            if container is None:
                grouped.append(walked)
                continue
            holder = holders.get(id(container))
            if holder is None:
                key = f"group-{len(holders) + 1}"
                holder = WalkSection(
                    plan=SectionPlan(key=key, name="", role=walked.plan.role, texts=[], images=[]),
                    roots=[container],
                )
                holders[id(container)] = holder
                grouped.append(holder)
            holder.members.append(walked)
            holder.plan.texts += walked.plan.texts
            holder.plan.images += walked.plan.images
            holder.plan.media += walked.plan.media
            holder.plan.static += walked.plan.static
            holder.texts += walked.texts
            holder.images += walked.images
            holder.media += walked.media
        for holder in holders.values():
            names = [m.plan.name for m in holder.members if not m.plan.loose] or [
                m.plan.name for m in holder.members
            ]
            joined = names[0] if len(names) == 1 else f"{names[0]} to {names[-1]}"
            if len(joined) > MAX_NAME:
                joined = f"{short_name(names[0], MAX_NAME - 5)} +{len(names) - 1}"
            holder.plan.name = _unique(short_name(joined), seen)
        walks = grouped
        plans = [w.plan for w in walks]

    for section in plans:
        if section.loose:
            total_found = len(section.texts) + len(section.images) + len(section.media)
            counted = [
                _count(n, noun)
                for n, noun in (
                    (len(section.texts), "text"),
                    (len(section.images), "picture"),
                    (len(section.media), "video or embed"),
                )
                if n
            ]
            issues.append(
                MapIssue(
                    level="info",
                    message=f"{' and '.join(counted) or 'Some parts'} outside the marked sections "
                    f"{'gets' if total_found == 1 else 'get'} a Shopify section of "
                    f"{'its' if total_found == 1 else 'their'} own, “{section.name}”.",
                )
            )

    # Shopify's limits: past 25 sections, the rest go into the last one (still editable).
    if len(plans) > MAX_SECTIONS:
        last = plans[MAX_SECTIONS - 1]
        for extra in plans[MAX_SECTIONS:]:
            extra.merged_into = last.key
        issues.append(
            MapIssue(
                level="info",
                message=f"The page has {len(plans)} sections; Shopify takes {MAX_SECTIONS}, so the "
                f"last {len(plans) - MAX_SECTIONS} go into “{last.name}”, still editable.",
            )
        )
    if not tags:
        issues.append(
            MapIssue(
                level="error",
                message="No sections are marked on the page yet, so nothing can be edited in "
                "Shopify. (A cloned page gets its sections when it's analysed.)",
            )
        )
    return Walk(
        soup=soup,
        sections=walks,
        outside_texts=outside_texts,
        outside_images=outside_images,
        issues=issues,
    )


def _count(n: int, noun: str) -> str:
    return f"{n} {noun}" + ("" if n == 1 else "s")


def report(result: MapPlan, slug: str) -> MapReport:
    """The template editor's summary of a dry run, with the theme file names checked."""
    issues = list(result.issues)
    if longest_file_key(slug) > MAX_FILE_KEY:
        issues.append(
            MapIssue(level="error", message="Its theme file names would be too long for Shopify.")
        )
    static = result.outside_texts + result.outside_images + sum(s.static for s in result.sections)
    return MapReport(
        sections=[
            MapSectionSummary(
                key=s.key,
                name=s.name,
                texts=len(s.texts),
                images=len(s.images),
                media=len(s.media),
                loose=s.loose,
            )
            for s in result.sections
        ],
        texts=sum(len(s.texts) for s in result.sections),
        images=sum(len(s.images) for s in result.sections),
        media=sum(len(s.media) for s in result.sections),
        static=static,
        unclear=sum(1 for s in result.sections for t in s.texts if t.role == "text"),
        issues=issues,
        ready=not any(i.level == "error" for i in issues),
    )


# ── Names, as Shopify's theme editor shows each block (B4.2) and LP's section tree (B4.4) ──

ROLE_NAMES = {
    "list_item": "List item", "cta": "Button", "subheadline": "Subheadline",
    "subheading": "Subheading", "footnote": "Small print",
}  # fmt: skip
IMAGE_NAMES = {"hero": "Main picture", "person": "Portrait", "icon": "Icon", "image": "Picture"}
MEDIA_NAMES = {"video": "Video", "embed": "Embed", "audio": "Sound"}


def text_name(role: str) -> str:
    return ROLE_NAMES.get(role, role.replace("_", " ").capitalize())


def image_name(role: str) -> str:
    return IMAGE_NAMES.get(role, f"{role.capitalize()} picture")


def parts(html: str, editor_map: EditorMap) -> list[SectionParts]:
    """Each section's parts in page order (B4.4, D123): its texts, pictures and videos, named as
    Shopify names their blocks, so the page editor's tree and Shopify's sidebar agree. Texts carry
    the editor's line number, pictures their `data-lp-img` number."""
    walked = walk(parse(html), editor_map)
    order = {id(tag): i for i, tag in enumerate(walked.soup.find_all(True))}
    out: list[SectionParts] = []
    for section in walked.sections:
        found: list[tuple[int, MapPart]] = []
        for element, text in section.texts:
            found.append(
                (
                    order.get(id(element), 0),
                    MapPart(
                        kind="text",
                        name=text_name(text.role),
                        role=text.role,
                        excerpt=text.preview,
                        line=text.line,
                        hidden=element.has_attr("data-lp-hidden"),
                    ),
                )
            )
        for img, picture in section.images:
            number = str(img.get("data-lp-img") or "")
            src = str(img.get("src") or "")
            found.append(
                (
                    order.get(id(img), 0),
                    MapPart(
                        kind="image",
                        name=image_name(picture.role),
                        role=picture.role,
                        excerpt=_collapse(str(img.get("alt") or ""))[:60],
                        image=int(number) if number.isdigit() else None,
                        thumb=src if src.startswith(("https://", "http://")) else "",
                        hidden=img.has_attr("data-lp-hidden"),
                    ),
                )
            )
        for item, clip in section.media:
            found.append(
                (
                    order.get(id(item), 0),
                    MapPart(
                        kind="media", name=MEDIA_NAMES[clip.kind], role=clip.kind, excerpt=clip.src
                    ),
                )
            )
        found.sort(key=lambda pair: pair[0])
        out.append(
            SectionParts(
                key=section.plan.key,
                name=section.plan.name,
                loose=section.plan.loose,
                parts=[part for _, part in found],
            )
        )
    return out
