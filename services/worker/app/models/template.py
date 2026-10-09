"""Templates (BUILD_SPEC §8): the `instructions` a template carries (§8.5) and the
`template.json` manifest of a library template folder (template-onboarding skill)."""

from typing import Literal

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
