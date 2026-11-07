"""A page as Shopify theme files people can edit in the theme editor (B4.2, BUILD_SPEC §12.6, D121).
Pure.

From the page and its editor map (D120): one Shopify section per map section, the page's own HTML
for that part with each editable piece swapped for a **static block** at the same spot
(`{% content_for "block", type: …, id: … %}`), so the layout stays exactly as built and Shopify's
theme editor lists every text, picture and video to change (static blocks can be edited and hidden,
not moved or removed, and don't count toward Shopify's block limits). A text keeps its element and
only its words become the block; a button (`a[data-lp-cta]`), a picture and a video or embed become
the block whole, the element's other attributes passed along so the page's CSS still matches.

Files per publish, version N of page `<slug>` (file names: `editor_map.file_slug`):

- `blocks/lp-<role>[-rich|-html].liquid`, `blocks/lp-button…`, `blocks/lp-img-<role>.liquid`,
  `blocks/lp-video|embed|audio.liquid`: the block types the page uses, shared by every page and
  uploaded first;
- `layout/lp-page.liquid`: a bare layout that links the page's CSS by the template's name;
- `assets/lp-<slug>-vN.css`: the page's styles (the fonts it links imported at the top);
- `sections/lp-<slug>-vN-s<i>.liquid`: each section, its HTML inside copies of its parents;
- `templates/page.lp-<slug>-vN.json`: the sections in order, every block's starting settings.

Static HTML is kept out of Liquid's way inside `{% raw %}`. Sizes are checked against Shopify's
limits before anything is uploaded (`ThemeTooBigError`).
"""

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from bs4.element import NavigableString, Tag

from app.engines import editor_map as em
from app.engines.html import parse, serialize
from app.models.editor_map import EditorMap, ImageBlock, MediaBlock, TextBlock

LAYOUT_NAME = "lp-page"
MAX_SECTION_BYTES = 250_000
MAX_CSS_BYTES = 1_000_000
MAX_TEMPLATE_BYTES = 500_000  # Shopify: 512 KB a JSON template
_TOKEN = "\x00LPBLOCK:{}\x00"
_TOKEN_RE = re.compile("\x00LPBLOCK:(\\d+)\x00")
_FONT_LINK = re.compile(r"^https://fonts\.(googleapis|bunny)\.(com|net)/", re.I)
_SKIP_ATTRS = ("data-lp-",)
# The layout check's markers (B4.3): one on every element of the page while it's compared; never in
# the files that are uploaded.
PARITY = "data-parity"
# Where a group block's element takes Shopify's selection marker (replaced as the Liquid is made).
_SELECT = "lpselect"
# Wrappers that only group things (no box of their own in the original): their copies take no box
# in Shopify either, so sticky parts and margins behave as on the original page (B4.3).
PASS_CSS = (
    "\n/* LP: wrappers that only group things take no box (layout check, B4.3). */\n"
    ".shopify-section.lp-section, .lp-body, .lp-pass { display: contents !important; }\n"
)

LAYOUT = (
    '<!doctype html>\n<html lang="{{ request.locale.iso_code }}">\n<head>\n'
    '  <meta charset="utf-8">\n'
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
    "  <title>{{ page_title }}</title>\n  {{ content_for_header }}\n"
    # The page's own CSS: `assets/<template suffix>.css` (LP's editable pages, B4.2).
    "  {{ template.suffix | append: '.css' | asset_url | stylesheet_tag }}\n"
    "</head>\n<body>\n  {{ content_for_layout }}\n</body>\n</html>\n"
)


class ThemeTooBigError(Exception):
    """A file would pass one of Shopify's size limits; nothing should be uploaded."""


@dataclass
class ThemeFiles:
    # Uploaded first: Shopify checks a template's block settings against the block types as they
    # were before the upload and silently drops settings it doesn't know.
    blocks: dict[str, str]
    # Then the layout, the CSS, the sections and the template.
    files: dict[str, str]
    suffix: str  # the page template's suffix: `lp-<slug>-vN`
    sections: int
    texts: int
    images: int
    media: int
    notes: list[str] = field(default_factory=list)


def suffix_for(slug: str, version: int) -> str:
    return f"lp-{em.file_slug(slug)}-v{version}"


# ── Liquid ───────────────────────────────────────────────────────────────────


def _liquid_string(value: str) -> str:
    """A value as a double-quoted Liquid string inside a tag: quotes and the characters that
    would end the tag become HTML entities (browsers read them back in attributes)."""
    clean = re.sub(r"\s+", " ", value)  # runs of spaces as one, a lone space kept
    clean = clean.replace('"', "&quot;").replace("%}", "%&#125;").replace("}}", "}&#125;")
    return f'"{clean}"'


def _attrs(tag: Tag, drop: set[str], skip: tuple[str, ...] = (*_SKIP_ATTRS, PARITY)) -> str:
    """The element's attributes as one string for the block to print, without LP's markers."""
    parts: list[str] = []
    for name, value in tag.attrs.items():
        if name in drop or name.startswith(skip):
            continue
        text = " ".join(value) if isinstance(value, list) else str(value)
        parts.append(f"{name}='{text.replace(chr(39), '&#39;')}'" if text != "" else name)
    return " ".join(parts)


def _schema(data: dict[str, Any]) -> str:
    return "{% schema %}\n" + json.dumps(data, indent=2, ensure_ascii=False) + "\n{% endschema %}\n"


def _label(role: str) -> str:
    return em.text_name(role)


def _text_block(role: str, fmt: str) -> tuple[str, str]:
    """(type, file) for a text block type: the element and its words, the words editable. The
    element comes whole (`tag` and its `attrs`, passed in) with Shopify's selection marker, so
    clicking it in the theme editor's preview selects it; without a `tag` (the element is a
    section's own), only the words."""
    kind = {"text": "", "inline_richtext": "-rich", "html": "-html"}[fmt]
    name = f"lp-{role.replace('_', '-')}{kind}"
    label = _label(role)
    if fmt == "text":
        words = "{{ block.settings.text | escape }}"
        setting = {"type": "textarea", "id": "text", "label": label}
    elif fmt == "inline_richtext":
        words = "{{ block.settings.text }}"
        setting = {"type": "inline_richtext", "id": "text", "label": label}
    else:
        words = "{{ block.settings.html }}"
        setting = {"type": "html", "id": "html", "label": label}
    title = label if fmt != "html" else f"{label} (HTML)"
    opening = (
        "{%- if tag != blank -%}<{{ tag }} {{ attrs }} {{ block.shopify_attributes }}>"
        "{%- endif -%}{{ lead }}"
    )
    closing = "{{ trail }}{%- if tag != blank -%}</{{ tag }}>{%- endif -%}\n"
    return name, opening + words + closing + _schema({"name": title, "settings": [setting]})


def _button_block(fmt: str) -> tuple[str, str]:
    """(type, file) for a button: the whole link, its words and its address editable."""
    kind = {"text": "", "inline_richtext": "-rich", "html": "-html"}[fmt]
    words = {
        "text": ("{{ block.settings.label | escape }}", {"type": "text", "id": "label"}),
        "inline_richtext": (
            "{{ block.settings.label }}",
            {"type": "inline_richtext", "id": "label"},
        ),
        "html": ("{{ block.settings.label }}", {"type": "html", "id": "label"}),
    }[fmt]
    body = (
        "<a href=\"{{ block.settings.link | default: '#' }}\" {{ attrs }} "
        "{{ block.shopify_attributes }}>" + words[0] + "</a>\n"
    )
    settings = [{**words[1], "label": "Words"}, {"type": "url", "id": "link", "label": "Link"}]
    return f"lp-button{kind}", body + _schema({"name": "Button", "settings": settings})


def _image_block(role: str) -> tuple[str, str]:
    body = (
        "{%- if block.settings.image != blank -%}\n"
        "  {%- assign source = block.settings.image | image_url: width: 2400 -%}\n"
        "{%- else -%}\n  {%- assign source = fallback -%}\n{%- endif -%}\n"
        '{%- if source != blank -%}<img src="{{ source }}" '
        'alt="{{ block.settings.alt | escape }}" {{ attrs }} {{ block.shopify_attributes }}>'
        "{%- endif -%}\n"
    )
    settings = [
        {"type": "image_picker", "id": "image", "label": "Picture"},
        {"type": "text", "id": "alt", "label": "Description (for screen readers)"},
    ]
    name = em.image_name(role)
    return f"lp-img-{role}", body + _schema({"name": name, "settings": settings})


def _media_block(kind: str) -> tuple[str, str]:
    tag = {"video": "video", "embed": "iframe", "audio": "audio"}[kind]
    body = (
        f'<{tag} src="{{{{ block.settings.src }}}}" {{{{ attrs }}}} '
        f"{{{{ block.shopify_attributes }}}}></{tag}>\n"
    )
    name = em.MEDIA_NAMES[kind]
    settings = [{"type": "url", "id": "src", "label": "Address"}]
    return f"lp-{kind}", body + _schema({"name": name, "settings": settings})


# ── The page's CSS ───────────────────────────────────────────────────────────


def _css(soup: BeautifulSoup) -> str:
    """The page's `<style>` blocks in order, fonts it links imported first; all of them removed
    from the page."""
    imports: list[str] = []
    for link in soup.find_all("link"):
        if not isinstance(link, Tag):
            continue
        rel_value: Any = link.get("rel") or []
        rel = " ".join(rel_value) if isinstance(rel_value, list) else str(rel_value)
        href = str(link.get("href") or "")
        if "stylesheet" in rel and _FONT_LINK.match(href):
            imports.append(f'@import url("{href}");')
        if "stylesheet" in rel or "preconnect" in rel or "preload" in rel:
            link.decompose()
    blocks = []
    for style in soup.find_all("style"):
        if isinstance(style, Tag):
            blocks.append(style.get_text())
            style.decompose()
    return "\n".join(imports + blocks) + "\n"


# ── Sections ─────────────────────────────────────────────────────────────────


def _clean(tag: Tag, skip: tuple[str, ...]) -> None:
    for node in [tag, *tag.find_all(True)]:
        if isinstance(node, Tag):
            for name in [n for n in node.attrs if n.startswith(skip)]:
                del node[name]


def _shell(soup: BeautifulSoup, element: Tag, skip: tuple[str, ...], passing: bool) -> Tag:
    attrs = {
        k: " ".join(v) if isinstance(v, list) else str(v)
        for k, v in element.attrs.items()
        if not k.startswith(skip)
    }
    if passing:
        attrs["class"] = f"{attrs.get('class', '')} lp-pass".strip()
    return soup.new_tag(element.name, attrs=attrs)


def _wrapped(
    soup: BeautifulSoup,
    root: Tag,
    skip: tuple[str, ...] = (*_SKIP_ATTRS, PARITY),
    transparent: Callable[[Tag], bool] | None = None,
) -> str:
    """The part inside copies of its parent elements (not the body), so the page's CSS that
    depends on them still matches; the body's classes go on an outer `div.lp-body`. Copies of
    wrappers that only group things (`transparent`) take no box (`lp-pass`, B4.3)."""
    chain = [p for p in root.parents if isinstance(p, Tag) and p.name not in ("body", "html")]
    chain = [p for p in chain if p.name != "[document]"]
    html = serialize(root)
    for parent in chain:
        shell = _shell(soup, parent, skip, bool(transparent and transparent(parent)))
        shell.append(NavigableString("\x00INNER\x00"))
        html = serialize(shell).replace("\x00INNER\x00", html)
    body = soup.body
    class_value: Any = (body.get("class") if body else None) or []
    classes = " ".join(class_value) if isinstance(class_value, list) else str(class_value)
    return f'<div class="lp-body{" " + classes if classes else ""}">{html}</div>'


_ATTR_RE = re.compile(r'\s(data-lp-[\w-]*|data-parity)(="[^"]*")?')


def _strip_markup(markup: str, skip: tuple[str, ...]) -> str:
    """LP's markers out of serialized HTML (the parts were wrapped before being cleaned, so the
    shells' copies of the parents are clean but the part's own markup isn't yet)."""
    if PARITY in skip:
        return _ATTR_RE.sub("", markup)
    return re.sub(r'\s(data-lp-[\w-]*)(="[^"]*")?', "", markup)


def _uses_rich_extras(element: Tag) -> bool:
    """Shopify's inline rich text takes bold, italic and plain links, not line breaks or link
    extras: those keep the words as HTML."""
    if element.find("br"):
        return True
    return any(set(a.attrs) - {"href"} for a in element.find_all("a"))


def build(
    html: str,
    editor_map: EditorMap,
    *,
    slug: str,
    version: int,
    shop_files: dict[str, str] | None = None,
    together: Callable[[Tag], bool] | None = None,
    transparent: Callable[[Tag], bool] | None = None,
    extra_css: str = "",
    keep_markers: bool = False,
) -> ThemeFiles:
    """The theme files for one page. `shop_files`: the page's picture addresses already in the
    store's Files (address → Shopify file name), for the picture blocks' image pickers. From the
    layout check (B4.3): `together` keeps containers whole as one section, `transparent` lets
    wrappers that only group things take no box, `extra_css` adds what it found missing, and
    `keep_markers` keeps its `data-parity` markers (only for its comparison)."""
    files_by_url = shop_files or {}
    skip = _SKIP_ATTRS if keep_markers else (*_SKIP_ATTRS, PARITY)
    soup = parse(html)
    for script in soup.find_all(["script", "noscript"]):
        script.decompose()
    css = _css(soup)
    if transparent is not None:
        css += PASS_CSS
    if extra_css:
        css += "\n" + extra_css + "\n"
    walked = em.walk(soup, editor_map, together=together)
    if not walked.sections:
        raise ThemeTooBigError("The page has no sections marked, so it can't be made editable.")
    suffix = suffix_for(slug, version)

    block_files: dict[str, str] = {}
    calls: list[str] = []  # the Liquid that replaces each token

    def token(call: str) -> str:
        calls.append(call)
        return _TOKEN.format(len(calls) - 1)

    def place(kind: str, block_id: str, params: dict[str, str]) -> str:
        extra = "".join(f", {k}: {_liquid_string(v)}" for k, v in params.items())
        return token(f'{{% content_for "block", type: "{kind}", id: "{block_id}"{extra} %}}')

    # Merged sections (past Shopify's 25) go into the last one.
    targets: dict[str, int] = {}
    kept: list[em.WalkSection] = []
    for section in walked.sections:
        if section.plan.merged_into is None:
            targets[section.plan.key] = len(kept)
            kept.append(section)
    extras: dict[int, list[em.WalkSection]] = {}
    for section in walked.sections:
        if section.plan.merged_into is not None:
            extras.setdefault(targets[section.plan.merged_into], []).append(section)

    template_sections: dict[str, Any] = {}
    order: list[str] = []
    section_files: dict[str, str] = {}
    counts = {"texts": 0, "images": 0, "media": 0}
    # Elements that hold a whole part (a section, a gathered part, a kept-together container):
    # a text that is one of them keeps it and only its words become the block.
    holders = {
        id(root)
        for section in walked.sections
        for part in [section, *section.members]
        for root in part.roots
    }

    def fill(part: em.WalkSection) -> dict[str, Any]:
        """Swaps the part's texts, pictures and videos for its blocks; returns their settings."""
        blocks: dict[str, Any] = {}
        for element, text in part.texts:
            kind, settings = _text_settings(element, text, block_files)
            block_id = f"t{text.line}"
            if element.name == "a" and text.role == "cta":
                element.replace_with(
                    place(kind, block_id, {"attrs": _attrs(element, {"href"}, skip)})
                )
            else:
                # A space at either end of the words is kept around them (Shopify may trim a
                # setting), so the words sit where they did.
                words = element.decode_contents()
                ends = {
                    "lead": " " if words[:1].isspace() else "",
                    "trail": " " if words[-1:].isspace() else "",
                }
                if id(element) in holders:
                    element.clear()
                    element.append(place(kind, block_id, {"tag": "", "attrs": "", **ends}))
                else:
                    element.replace_with(
                        place(
                            kind, block_id,
                            {"tag": element.name, "attrs": _attrs(element, set(), skip), **ends},
                        )
                    )  # fmt: skip
            blocks[block_id] = {"type": kind, "static": True, "settings": settings}
            counts["texts"] += 1
        for number, (img, picture) in enumerate(part.images, start=1):
            kind, file = _image_block(picture.role)
            block_files[f"blocks/{kind}.liquid"] = file
            block_id = f"i{part.plan.key[-12:]}{number}".replace("-", "")
            src = str(img.get("src") or "")
            settings = {"alt": str(img.get("alt") or "")}
            if src in files_by_url:
                settings["image"] = f"shopify://shop_images/{files_by_url[src]}"
            # `src` is a name Shopify keeps for itself in `content_for`: the address goes as
            # `fallback`, shown until a picture is chosen in the image picker.
            params = {"fallback": src, "attrs": _attrs(img, {"src", "srcset", "alt"}, skip)}
            img.replace_with(place(kind, block_id, params))
            blocks[block_id] = {"type": kind, "static": True, "settings": settings}
            counts["images"] += 1
        for number, (item, clip) in enumerate(part.media, start=1):
            kind, file = _media_block(clip.kind)
            block_files[f"blocks/{kind}.liquid"] = file
            block_id = f"m{part.plan.key[-12:]}{number}".replace("-", "")
            for source in item.find_all("source"):
                source.decompose()
            item.replace_with(place(kind, block_id, {"attrs": _attrs(item, {"src"}, skip)}))
            blocks[block_id] = {"type": kind, "static": True, "settings": {"src": clip.src}}
            counts["media"] += 1
        return blocks

    def liquid(markup: str) -> str:
        body = "{% raw %}" + _strip_markup(markup, skip) + "{% endraw %}"
        body = body.replace(
            f' {_SELECT}=""', "{% endraw %} {{ block.shopify_attributes }}{% raw %}"
        )
        body = _TOKEN_RE.sub(lambda m: "{% endraw %}" + calls[int(m.group(1))] + "{% raw %}", body)
        return body.replace("{% raw %}{% endraw %}", "")

    groups = 0
    for index, section in enumerate(kept, start=1):
        blocks: dict[str, Any] = {}
        parts = [section, *extras.get(index - 1, [])]
        if section.members:
            # Kept together (B4.3): the container is the section; each part inside it is a group
            # block of its own (page-specific), its texts and pictures nested in it, so Shopify's
            # sidebar still lists the parts.
            for member in section.members:
                inner = fill(member)
                groups += 1
                kind = f"{suffix}-p{groups}"
                member.roots[0][_SELECT] = ""
                markup = "".join(serialize(root) for root in member.roots)
                block_files[f"blocks/{kind}.liquid"] = (
                    liquid(markup) + "\n" + _schema({"name": member.plan.name, "settings": []})
                )
                member.roots[0].replace_with(place(kind, f"p{groups}", {}))
                for root in member.roots[1:]:
                    root.decompose()
                blocks[f"p{groups}"] = {
                    "type": kind, "static": True, "settings": {}, "blocks": inner,
                    "block_order": [],
                }  # fmt: skip
            parts = parts[1:]
        for part in parts:
            for member in part.members or [part]:
                blocks.update(fill(member))
        wrapped = []
        for part in [section, *extras.get(index - 1, [])]:
            for root in part.roots:
                wrapped.append(_wrapped(soup, root, skip, transparent))
        body = liquid("".join(wrapped))
        section_type = f"{suffix}-s{index}"
        content = body + "\n" + _schema({"name": section.plan.name, "class": "lp-section"})
        if len(content.encode()) > MAX_SECTION_BYTES:
            raise ThemeTooBigError(
                f"The section “{section.plan.name}” is too big for Shopify "
                f"({len(content.encode()) // 1000} KB; Shopify takes 250 KB)."
            )
        section_files[f"sections/{section_type}.liquid"] = content
        key = f"s{index}"
        template_sections[key] = {"type": section_type, "blocks": blocks, "block_order": []}
        order.append(key)
    texts, images, media = counts["texts"], counts["images"], counts["media"]

    if len(css.encode()) > MAX_CSS_BYTES:
        raise ThemeTooBigError(
            f"The page's styles are too big for Shopify ({len(css.encode()) // 1000} KB; "
            "Shopify takes 1,000 KB)."
        )
    template = json.dumps(
        {"layout": LAYOUT_NAME, "sections": template_sections, "order": order},
        ensure_ascii=False,
        indent=1,
    )
    if len(template.encode()) > MAX_TEMPLATE_BYTES:
        raise ThemeTooBigError(
            f"The page has too much to edit for one Shopify page ({len(template.encode()) // 1000} "
            "KB of settings; Shopify takes 512 KB)."
        )
    files = {
        f"layout/{LAYOUT_NAME}.liquid": LAYOUT,
        f"assets/{suffix}.css": css,
        **section_files,
        f"templates/page.{suffix}.json": template,
    }
    notes = [i.message for i in walked.issues if i.level != "error"]
    return ThemeFiles(
        blocks=dict(sorted(block_files.items())),
        files=files,
        suffix=suffix,
        sections=len(kept),
        texts=texts,
        images=images,
        media=media,
        notes=notes,
    )


def _text_settings(
    element: Tag, text: TextBlock, block_files: dict[str, str]
) -> tuple[str, dict[str, str]]:
    """The block type for a text (adding its file) and the block's starting settings."""
    fmt = text.setting
    if fmt == "inline_richtext" and _uses_rich_extras(element):
        fmt = "html"
    inner = element.decode_contents()
    if element.name == "a" and text.role == "cta":
        kind, file = _button_block(fmt)
        label = _squash(element.get_text()) if fmt == "text" else _squash(inner)
        href = str(element.get("href") or "")
        settings = {"label": label}
        if href.startswith(("http://", "https://", "/")):
            settings["link"] = href
    else:
        kind, file = _text_block(text.role, fmt)
        if fmt == "text":
            settings = {"text": _squash(element.get_text())}
        elif fmt == "inline_richtext":
            settings = {"text": _squash(inner)}
        else:
            settings = {"html": _squash(inner)}
    block_files[f"blocks/{kind}.liquid"] = file
    return kind, settings


def _squash(text: str) -> str:
    """Runs of spaces and line breaks as one space, ends trimmed (the ends' spaces stay around the
    block, in the page's HTML); non-breaking spaces stay as they are."""
    return re.sub(r"[ \t\n\r\f\v]+", " ", text).strip(" ")


def file_names(shop_url: str) -> str:
    """A Shopify Files address's file name (what an image picker refers to)."""
    return urlparse(shop_url).path.rsplit("/", 1)[-1]


__all__ = [
    "LAYOUT",
    "ImageBlock",
    "MediaBlock",
    "ThemeFiles",
    "ThemeTooBigError",
    "build",
    "file_names",
    "suffix_for",
]
