"""Brand draft returned by brand_autofetch (BUILD_SPEC §7.3). Nothing is saved from it until the
user reviews and saves the form; field names match the `brands` table where they overlap."""

from typing import Literal

from pydantic import BaseModel, Field


class Palette(BaseModel):
    primary: str | None = None
    dark: str | None = None
    tint: str | None = None
    accent: str | None = None
    source_hue: int | None = None


class PaletteCandidate(BaseModel):
    hex: str
    label: str
    reason: str
    signal: int = Field(ge=0, le=3)


class Fonts(BaseModel):
    heading: str | None = None
    body: str | None = None


class BrandDraft(BaseModel):
    url: str
    name: str
    prefix: str
    tagline: str | None = None
    positioning: str | None = None
    audience: str | None = None
    brand_context: str | None = None
    voice: str | None = None
    voice_examples: list[str] = Field(default_factory=list)
    language: str = "en"
    cta_text: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    support_email: str | None = None
    palette: Palette = Field(default_factory=Palette)
    palette_candidates: list[PaletteCandidate] = Field(default_factory=list)
    fonts: Fonts = Field(default_factory=Fonts)
    logo_url: str | None = None
    logo_svg: str | None = None
    favicon_url: str | None = None
    fetched_via: Literal["http", "browser"] = "http"
    ai: Literal["mock", "live"] = "mock"
    warnings: list[str] = Field(default_factory=list)


class BrandProfile(BaseModel):
    """The AI pass's output (structured output schema)."""

    name: str
    tagline: str
    positioning: str
    audience: str
    brand_context: str
    voice: str
    voice_examples: list[str]
    cta_text: str
    language: str
    primary_color: str | None
