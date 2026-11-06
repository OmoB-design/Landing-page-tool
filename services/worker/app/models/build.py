"""Builds (BUILD_SPEC §9, §10): the wizard payload stored on a build and the request that
creates one. The create wizard (B1.2) fills every field; test builds use the defaults."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

AuthorType = Literal["writer", "expert", "customer", "influencer"]
# A batch's folder in the Pages list (B3.5b, owner 2026-11-06); red until its team picks another.
FolderColor = Literal["blue", "black", "red", "purple"]


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


MAX_BATCH = 20  # the workspace's hourly cap on builds, so one batch can never be more


class BatchRequest(BaseModel):
    """POST /builds/batch (B3.5, D115): one product, a page from each template."""

    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    template_ids: list[UUID] = Field(min_length=1, max_length=MAX_BATCH)
    brand_id: UUID
    product_id: UUID
    wizard: BuildWizard = Field(default_factory=BuildWizard)


class BatchPage(BaseModel):
    """One page of a batch, as the batch screen shows it."""

    id: UUID
    key: str
    title: str
    template_id: UUID
    template_name: str
    template_type: str
    status: str  # the build's: queued, building, needs_review, failed …
    job_id: UUID | None
    # What its build is doing now ("Writing the copy"), from its job's newest progress event.
    step: str | None
    # Its place in line among the workspace's builds still waiting (1 is next), while queued.
    waiting: int | None
    error: str | None
    # For the batch screen's list (B3.5b), as the Pages list shows them.
    origin: str
    residue_score: int | None
    cost_usd: float
    created_by: UUID | None
    updated_at: datetime
    started_at: datetime | None  # its build job's, for the time it's been building
    finished_at: datetime | None


class BatchState(BaseModel):
    batch_id: UUID
    brand: str
    product: str
    created_at: datetime
    pages: list[BatchPage]
    folder_color: FolderColor = "red"


class BatchFolderRequest(BaseModel):
    """PATCH /builds/batch/{id} (B3.5b): the colour of the batch's folder, for the whole team."""

    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    folder_color: FolderColor


class BatchFolder(BaseModel):
    folder_color: FolderColor
