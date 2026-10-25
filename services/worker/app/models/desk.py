"""The review desk's API shapes (BUILD_SPEC §11.1, D84)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DeskFragment(BaseModel):
    id: str
    text: str
    section: str | None
    # Filled by the pipeline from brand or product data (names, prices): shown, not editable.
    locked: bool
    # Changed on the desk (matched by text, so it survives ids shifting).
    edited: bool
    # The paragraph, heading, list item or button it belongs to (lines of one block share it).
    block: int
    kind: str


class DeskParagraph(BaseModel):
    """A paragraph (or heading, list item, button…) as the desk edits it: one text, even when bold
    words, a link or a price split it into several fragments."""

    number: int
    kind: str
    section: str | None
    text: str
    # Every part is filled from data (a price, the product name): shown, not editable.
    locked: bool
    # Parts filled from data that stay as they are when the rest is edited.
    locked_parts: list[str]
    edited: bool
    fragments: list[str]


class DeskSnapshot(BaseModel):
    seq: int
    # What the change after this snapshot did, e.g. "Edited a line in hero".
    reason: str
    created_at: datetime
    created_by: UUID | None


class DeskBuild(BaseModel):
    id: UUID
    status: str
    page_version: int
    approved_at: datetime | None
    approved_by: UUID | None


class DeskRedraft(BaseModel):
    """A redraft queued or running on the page: the desk pauses changes until it's done."""

    job_id: UUID
    status: str
    scope: str
    section: str | None
    block: int | None


class DeskPalette(BaseModel):
    primary: str
    dark: str
    tint: str
    accent: str


class DeskColors(BaseModel):
    # The four colours on the page now (None when the page's colours aren't known).
    page: DeskPalette | None
    # The brand's colours, with any missing ones derived.
    brand: DeskPalette | None


class DeskState(BaseModel):
    build: DeskBuild
    # The page's fragments (for the preview's clicks and the claims), each with its paragraph.
    fragments: list[DeskFragment]
    paragraphs: list[DeskParagraph]
    # The template's name for each section key ("problem" → "The problem").
    sections: dict[str, str]
    # Newest first; Undo puts back the first.
    snapshots: list[DeskSnapshot]
    redraft: DeskRedraft | None
    colors: DeskColors


class DeskChange(BaseModel):
    """Every desk change carries the page version it was made on (D84)."""

    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    base_version: int = Field(ge=1)


class CopyEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The paragraph's number (DeskParagraph.number).
    block: int = Field(ge=1)
    # The text the editor showed: the save is refused if the paragraph has changed since.
    original: str = Field(max_length=10000)
    text: str = Field(min_length=1, max_length=10000)


class CopyEditRequest(DeskChange):
    edits: list[CopyEdit] = Field(min_length=1, max_length=50)


class StatusRequest(DeskChange):
    status: Literal["approved", "needs_review"]


class SnapshotRestoreRequest(DeskChange):
    seq: int = Field(ge=1)


HEX = r"^#[0-9a-fA-F]{6}$"


class RedraftRequest(DeskChange):
    """Starts a redraft (a job): the whole page, a section, a paragraph, or the lines the build's
    copy pass couldn't write."""

    scope: Literal["page", "section", "paragraph", "unwritten"]
    section: str | None = Field(default=None, max_length=100)
    block: int | None = Field(default=None, ge=1)
    # The editor's direction for the new words ("shorter, more playful").
    note: str | None = Field(default=None, max_length=200)


class RecolorColors(BaseModel):
    model_config = ConfigDict(extra="forbid")

    primary: str = Field(pattern=HEX)
    dark: str = Field(pattern=HEX)
    tint: str = Field(pattern=HEX)
    accent: str = Field(pattern=HEX)


class RecolorRequest(DeskChange):
    colors: RecolorColors
