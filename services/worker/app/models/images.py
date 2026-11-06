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
    # The studio changed how it's shown (shape, fit, focus): Reset puts it back as it was built.
    changed: bool = False


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


class ImageAI(BaseModel):
    """Making pictures with AI (B3.2b): whether it makes free placeholders (mock mode) and what a
    picture costs once it's live."""

    mock: bool
    price: str | None


class ImageJob(BaseModel):
    """A picture being made for the image: its job (follow it on /jobs/{id})."""

    job_id: UUID
    mode: Literal["generate", "edit"]


# A picture's verdict from the product check (B3.2c): fix, ok, no_product; fixed or failed once a
# match ran; unreadable (couldn't be downloaded) or placeholder (a free mock picture, not checked).
CheckVerdict = Literal["fix", "ok", "no_product", "fixed", "failed", "unreadable", "placeholder"]


class ProductCheckItem(BaseModel):
    number: int
    src: str
    verdict: CheckVerdict
    # The product photo to recreate it with (from 1), for a fix.
    photo: int | None = None
    note: str = ""


class ProductCheck(BaseModel):
    """The product check (B3.2c, D116): which pictures show a product that isn't the real one.
    Kept in the build's report (`images.product_fix`); out of date once the pictures change."""

    checked_at: datetime
    fingerprint: str
    items: list[ProductCheckItem] = Field(default_factory=list)
    skipped: dict[str, int] = Field(default_factory=dict)
    photos: int = 0
    # Why nothing could be checked: no_product_photos, photos_unreadable.
    reason: str | None = None
    # The check's model answered in mock mode (no real look at the pictures).
    mock: bool = False
    # Pictures the check wanted fixed past the 10 a run fixes.
    over: int = 0

    def count(self, verdict: str) -> int:
        return sum(1 for i in self.items if i.verdict == verdict)


class ProductMatch(BaseModel):
    """Match product everywhere, for the image studio: what the last check found and whether a
    check or a match is running now."""

    # unavailable (no product photos), checking, ready, fixing.
    status: Literal["unavailable", "checking", "ready", "fixing"]
    reason: str | None = None
    job_id: UUID | None = None
    checked: int = 0
    to_fix: int = 0
    ok: int = 0
    fixed: int = 0
    # A match fixes at most 10 pictures; what one would cost once pictures are live.
    max_fixes: int = 10
    price: str | None = None
    mock: bool = True


class MatchStarted(BaseModel):
    job_id: UUID


class ImageStudio(BaseModel):
    image: StudioImage
    versions: list[ImageVersion]
    product_photos: list[ImageChoice]
    page_images: list[ImageChoice]
    ai: ImageAI
    # A picture already being made for this image, if any.
    making: ImageJob | None = None
    # Match product everywhere (B3.2c): the page's product check.
    match: ProductMatch | None = None


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


PROMPT_MAX = 600
MAX_REFERENCES = 3


class ImageAIRequest(BaseModel):
    """Make a new picture for the image (generate) or change the one it shows (edit), with up to
    three of the product's photos as references (their numbers, from 1)."""

    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    mode: Literal["generate", "edit"]
    prompt: str = Field(min_length=3, max_length=PROMPT_MAX)
    product_photos: list[int] = Field(default_factory=list, max_length=MAX_REFERENCES)
