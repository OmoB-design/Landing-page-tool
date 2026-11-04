"""Builds (BUILD_SPEC §9, §10): the wizard payload stored on a build and the request that
creates one. The create wizard (B1.2) fills every field; test builds use the defaults."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

AuthorType = Literal["writer", "expert", "customer", "influencer"]


class Emphasis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    benefits: list[str] = Field(default_factory=list, max_length=3)
    features: list[str] = Field(default_factory=list, max_length=3)
    objections: list[str] = Field(default_factory=list, max_length=3)


class Competitors(BaseModel):
    """A Top 5 ranking build's competitors (BUILD_SPEC §8.7, D102): four product pages, in rank
    order (#2 to #5), and how the page names them. Neutral labels ("Brand B") are the default;
    real names also show their photos."""

    model_config = ConfigDict(extra="forbid")

    urls: list[str] = Field(min_length=4, max_length=4)
    naming: Literal["neutral", "real"] = "neutral"

    @field_validator("urls")
    @classmethod
    def _distinct(cls, urls: list[str]) -> list[str]:
        cleaned = [url.strip() for url in urls]
        if any(not url or len(url) > 2000 for url in cleaned):
            raise ValueError("each competitor needs its product page's address")
        keys = [url.lower().removeprefix("https://").removeprefix("http://") for url in cleaned]
        if len({key.rstrip("/") for key in keys}) != len(keys):
            raise ValueError("each competitor needs a different page")
        return cleaned


class BuildWizard(BaseModel):
    """`builds.wizard` (§9). Template, brand and product are columns on the build."""

    model_config = ConfigDict(extra="forbid")

    author_type: AuthorType = "writer"
    ai_images: bool = True
    image_styles: list[str] = Field(default_factory=list, max_length=8)
    audience: str | None = Field(default=None, max_length=300)
    audience_gender: Literal["any", "women", "men"] = "any"
    audience_age: str | None = Field(default=None, max_length=20)
    emphasis: Emphasis = Field(default_factory=Emphasis)
    competitors: Competitors | None = None


class BuildRequest(BaseModel):
    """POST /builds."""

    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    template_id: UUID
    brand_id: UUID
    product_id: UUID
    wizard: BuildWizard = Field(default_factory=BuildWizard)
