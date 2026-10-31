"""Templates (BUILD_SPEC §8): the `instructions` a template carries (§8.5) and the
`template.json` manifest of a library template folder (template-onboarding skill)."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

SectionRole = Literal[
    "hero", "problem", "mechanism", "benefits", "ingredients", "social_proof", "testimonials",
    "comparison", "offer", "guarantee", "faq", "cta", "footer_cta", "other",
]  # fmt: skip

TemplateType = Literal[
    "advertorial", "listicle", "versus", "comparison", "long_form", "quiz_bridge",
    "product_page", "top5_ranking", "other",
]  # fmt: skip


class LengthCap(BaseModel):
    model_config = ConfigDict(extra="forbid")

    match: str = Field(min_length=1)
    max_chars: int = Field(gt=0)


class TemplateInstructions(BaseModel):
    """BUILD_SPEC §8.5. Unknown keys are rejected so a typo never silently does nothing."""

    model_config = ConfigDict(extra="forbid")

    copy_rules: str = ""
    length_caps: list[LengthCap] = Field(default_factory=list)
    image_rules: str = ""
    generic_images: list[str] = Field(default_factory=list)
    keep_images: list[str] = Field(default_factory=list)
    forbidden_terms: list[str] = Field(default_factory=list)
    notes: str = ""


class Palette(BaseModel):
    model_config = ConfigDict(extra="forbid")

    primary: str
    dark: str | None = None
    tint: str | None = None
    accent: str | None = None


class SectionSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    role: SectionRole = "other"
    label: str
    removable: bool = True
    duplicable: bool = False


class TemplateManifest(BaseModel):
    """`templates/library/<slug>/template.json`."""

    model_config = ConfigDict(extra="forbid")

    slug: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    name: str
    type: TemplateType
    description: str = ""
    source_palette: Palette
    sections: list[SectionSpec] = Field(min_length=1)
    # "retired" hides a template from the gallery; builds that used it keep working.
    status: Literal["active", "retired"] = "active"


# ── Section editor (BUILD_SPEC §8.3, B1.1b) ───────────────────────────────────


class TextField(BaseModel):
    """A piece of a section's text, shown read-only in the editor (words change per build)."""

    label: str
    text: str


class SectionOutline(BaseModel):
    """What the editor shows about one top-level section of a template's page."""

    key: str
    number: str | None = None  # the section's `data-lp-number` text, e.g. "3"
    title: str = ""  # first heading (without its number), else the first line of text
    fields: list[TextField] = Field(default_factory=list)
    words: int = 0
    images: int = 0
    group: int = 0  # sections only reorder among those with the same group (container)


class TemplateIssue(BaseModel):
    severity: Literal["error", "warning", "info"]
    message: str
    section: str | None = None


class TemplateColour(BaseModel):
    name: str
    token: str
    value: str


class TemplateLook(BaseModel):
    colours: list[TemplateColour] = Field(default_factory=list)
    heading_font: str | None = None
    body_font: str | None = None


class ReorderAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["reorder"]
    keys: list[str] = Field(min_length=1, max_length=100)
    moved: str | None = None  # the section the user moved, for the version's description


class RemoveAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["remove"]
    key: str


class DuplicateAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["duplicate"]
    key: str


class RenameAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["rename"]
    key: str
    label: str = Field(min_length=1, max_length=80)


LayoutAction = Annotated[
    ReorderAction | RemoveAction | DuplicateAction | RenameAction, Field(discriminator="type")
]


class EditorSource(BaseModel):
    """Where a clone came from (B2.1)."""

    url: str | None
    host: str
    name: str | None
    platform: str | None
    verdict: str | None


class EditorAnalysis(BaseModel):
    """A clone's analysis (B2.2), and its review."""

    ai: Literal["claude", "mock"]
    model: str
    analysed_at: datetime
    palette: dict[str, str | None]
    brand_tokens: list[str]
    logo_srcs: list[str]
    cta_hrefs: list[str]
    notes: str
    reviewed_at: datetime | None
    reviewed_by: str | None


class EditorTemplate(BaseModel):
    id: UUID
    name: str
    description: str | None
    type: str
    version: int
    parent_name: str | None
    updated_at: datetime
    origin: Literal["owned", "cloned"] = "owned"
    source: EditorSource | None = None
    analysis: EditorAnalysis | None = None
    # Pages can be built from it: owned, or a clone whose analysis was confirmed.
    ready: bool = True


class EditorSection(SectionOutline):
    role: SectionRole
    label: str
    removable: bool
    duplicable: bool


class EditorVersion(BaseModel):
    version: int
    reason: str | None
    created_at: datetime
    current: bool


class TemplateEditorState(BaseModel):
    template: EditorTemplate
    instructions: TemplateInstructions = Field(default_factory=TemplateInstructions)
    sections: list[EditorSection]
    versions: list[EditorVersion]  # newest first
    can_undo: bool
    can_redo: bool
    issues: list[TemplateIssue]
    look: TemplateLook
    words: int
    read_minutes: int
