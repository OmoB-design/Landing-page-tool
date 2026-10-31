"""A cloned page's analysis (BUILD_SPEC §8.4 "Analyze", B2.2): what the model is asked to
return, and the blueprint saved on the template."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.template import SectionRole


class ReplyPalette(BaseModel):
    primary: str
    dark: str
    tint: str
    accent: str


class ReplySection(BaseModel):
    blocks: list[str]  # consecutive block ids from the digest
    role: SectionRole
    label: str


class AnalysisReply(BaseModel):
    """The model's answer. Images, links and blocks are named by their ids in the digest, so
    nothing it returns can point outside the page."""

    palette: ReplyPalette
    brand_tokens: list[str]
    logo_images: list[int]
    cta_links: list[int]
    variant_blocks: list[str]
    sections: list[ReplySection]
    keep_images: list[int]
    generic_images: list[int]
    forbidden_terms: list[str]
    copy_rules: str
    image_rules: str
    notes: str


class BlueprintPalette(BaseModel):
    model_config = ConfigDict(extra="forbid")

    primary: str
    dark: str | None = None
    tint: str | None = None
    accent: str | None = None


class Blueprint(BaseModel):
    """`templates.blueprint`: how a build rebrands this clone (§8.4; the build reads palette,
    brand_tokens, logo_srcs, cta_hrefs and variant_sections)."""

    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    ai: Literal["claude", "mock"]
    model: str
    analysed_at: datetime
    palette: BlueprintPalette
    brand_tokens: list[str] = Field(default_factory=list)
    logo_srcs: list[str] = Field(default_factory=list)
    cta_hrefs: list[str] = Field(default_factory=list)
    variant_sections: list[str] = Field(default_factory=list)  # section keys
    notes: str = ""
