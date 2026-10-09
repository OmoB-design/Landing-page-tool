"""Builds (BUILD_SPEC §9, §10): the wizard payload stored on a build and the request that
creates one. The create wizard (B1.2) fills every field; test builds use the defaults."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AuthorType = Literal["writer", "expert", "customer", "influencer"]


class Emphasis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    benefits: list[str] = Field(default_factory=list, max_length=3)
    features: list[str] = Field(default_factory=list, max_length=3)
    objections: list[str] = Field(default_factory=list, max_length=3)


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


class BuildRequest(BaseModel):
    """POST /builds."""

    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    template_id: UUID
    brand_id: UUID
    product_id: UUID
    wizard: BuildWizard = Field(default_factory=BuildWizard)
