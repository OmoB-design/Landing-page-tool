"""The image studio (BUILD_SPEC §11.2, B3.2a, D109): one image's details, choices and history, and
the changes to it."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MAX_UPLOAD_BYTES = 8_000_000


class StudioImage(BaseModel):
    number: int
    src: str
    alt: str
    # logo, product, person, scene, kept (from the template) or image.
    kind: str
    section: str | None
    section_label: str | None
    ratio: str
    fit: str
    focus: str


class ImageVersion(BaseModel):
    id: UUID
    seq: int
    # original, product, generated, edited, uploaded or reused.
    source: str
    src: str
    created_at: datetime
    current: bool


class ImageChoice(BaseModel):
    """A picture the image can become: a product photo, or another image on the page."""

    src: str
    label: str
    number: int | None = None


class ImageStudio(BaseModel):
    image: StudioImage
    versions: list[ImageVersion]
    product_photos: list[ImageChoice]
    page_images: list[ImageChoice]


class ImageChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    base_version: int = Field(ge=1)


class ImageReplace(ImageChange):
    src: str = Field(min_length=1, max_length=4000)
    source: Literal["product", "reused", "uploaded"]
    asset_id: UUID | None = None


class ImageAdjust(ImageChange):
    ratio: Literal["original", "1:1", "4:3", "3:4", "16:9"] | None = None
    fit: Literal["cover", "contain"] | None = None
    focus: Literal["center", "top", "bottom"] | None = None
    alt: str | None = Field(default=None, max_length=250)


class ImageRestore(ImageChange):
    version_id: UUID


class ImageUpload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    # A data URL (PNG, JPEG or WebP), sized down in the browser first.
    data_url: str = Field(min_length=1, max_length=12_000_000)


class UploadedImage(BaseModel):
    asset_id: UUID
    url: str
