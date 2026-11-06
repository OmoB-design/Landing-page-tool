"""The editor map (B4.1, D120): how a page divides into Shopify sections and which of its texts and
images become blocks people can edit in Shopify's theme editor (M4, BUILD_SPEC §12.6)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# The roles a text block can have: each becomes a block type (`lp-<role>`) in B4.2, named in
# Shopify's editor ("Headline", "Price"). "text" is the fallback for text with no clear role.
TextRole = Literal[
    "headline", "subheadline", "heading", "subheading", "eyebrow", "paragraph", "byline",
    "caption", "quote", "list_item", "cta", "price", "badge", "rating", "name", "number",
    "question", "answer", "label", "cell", "footnote", "text",
]  # fmt: skip
ImageRole = Literal["hero", "product", "scene", "person", "logo", "icon", "image"]
# How a text block's words are kept in Shopify: plain text, text with bold / italic / links, or
# HTML (anything else inside, such as styled spans).
TextSetting = Literal["text", "inline_richtext", "html"]


class MapSection(BaseModel):
    """One of the template's sections (its `data-lp-section` key) as a Shopify section."""

    model_config = ConfigDict(extra="forbid")

    key: str
    # Shopify's section name: 25 characters at most.
    name: str = Field(max_length=25)
    role: str = "other"


class RoleRule(BaseModel):
    """Texts or images matching `match` (a CSS selector) take this role, before any guess."""

    model_config = ConfigDict(extra="forbid")

    match: str
    role: str


class EditorMap(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    # Worked out from the template's markers ("markup"), from a clone's analysis ("analysis"), or
    # adjusted by hand ("manual").
    source: Literal["markup", "analysis", "manual"] = "markup"
    sections: list[MapSection] = Field(default_factory=list)
    roles: list[RoleRule] = Field(default_factory=list)
    # Parts of the page kept exactly as they are (nothing inside becomes a block), set by hand; the
    # built-in ones (dropdowns, canvases, `data-lp-static`) always apply too.
    keep_whole: list[str] = Field(default_factory=list)


class MapOverrides(BaseModel):
    """What a library template's template.json may set by hand (optional `editor_map`)."""

    model_config = ConfigDict(extra="forbid")

    names: dict[str, str] = Field(default_factory=dict)
    roles: list[RoleRule] = Field(default_factory=list)
    keep_whole: list[str] = Field(default_factory=list)


class TextBlock(BaseModel):
    line: int  # the page's line number (the same numbering as the editor's)
    role: TextRole
    setting: TextSetting
    preview: str


class ImageBlock(BaseModel):
    role: ImageRole
    src: str


MediaKind = Literal["video", "embed", "audio"]


class MediaBlock(BaseModel):
    """A video, an embed (an iframe) or a sound: its address is what's changed in Shopify."""

    kind: MediaKind
    src: str


class SectionPlan(BaseModel):
    key: str
    name: str
    role: str
    texts: list[TextBlock]
    images: list[ImageBlock]
    media: list[MediaBlock] = Field(default_factory=list)
    # Parts outside the marked sections, gathered into a section of their own.
    loose: bool = False
    # Texts and images in this section that can't be edited in Shopify (inside a part kept whole).
    static: int = 0
    # Shopify sections it makes: one for each 600 blocks.
    parts: int = 1
    # Past Shopify's 24 sections, the rest of the page goes into the last one (still editable).
    merged_into: str | None = None


class MapIssue(BaseModel):
    level: Literal["error", "warning", "info"]
    message: str


class MapPlan(BaseModel):
    """What would become editable in Shopify for one page (a template or a build): the dry run."""

    sections: list[SectionPlan]
    # Outside every section (only on a page with no sections marked at all).
    outside_texts: int
    outside_images: int
    issues: list[MapIssue]


class MapSectionSummary(BaseModel):
    key: str
    name: str
    texts: int
    images: int
    media: int = 0
    loose: bool = False


class MapReport(BaseModel):
    """The template editor's "Shopify editing" card."""

    sections: list[MapSectionSummary]
    texts: int
    images: int
    media: int = 0
    # Texts and images that can't be edited in Shopify (they still show on the page): inside a part
    # kept whole, or on a page with no sections marked.
    static: int
    # Texts with no clear role (shown in Shopify as "Text").
    unclear: int
    issues: list[MapIssue]
    ready: bool
