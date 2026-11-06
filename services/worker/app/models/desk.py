"""The review desk's API shapes (BUILD_SPEC §11.1, D84)."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.template import DuplicateAction, RemoveAction, ReorderAction


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


class DeskSection(BaseModel):
    """A section of the page, in page order, as the editor lists it (B3.1a, D104)."""

    key: str
    label: str
    # The template's rules for it; a copy follows its original's and can always be removed.
    removable: bool
    duplicable: bool
    # Sections in different parts of the page (different containers) can't swap places.
    group: int = 0


class FormattedLine(BaseModel):
    block: int
    html: str


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
    # The page's sections in order, with what the editor may do to each (B3.1a).
    layout: list[DeskSection] = Field(default_factory=list)
    # Redo (B3.1a): the newest undone change, kept until the next new change.
    can_redo: bool = False
    redo_reason: str | None = None
    # Match product everywhere running on the page (B3.2c): its job, so the editor can follow it
    # whoever started it (the studio or Buddy).
    matching: UUID | None = None
    # Only a formatting change fills this (B3.1g): the lines it formatted, marked as the editor's
    # page shows them, so the editor swaps them in where they are instead of loading the page.
    lines: list[FormattedLine] = Field(default_factory=list)


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
    # Saved by the page editor while typing (B3.1a): saves of one line by one person, a minute
    # apart at most, share one undo step.
    typing: bool = False


class FormatRange(BaseModel):
    """Part of a selection (B3.1g): one line (its paragraph number) and where the selection
    starts and ends in its text as the desk shows it."""

    model_config = ConfigDict(extra="forbid")

    block: int = Field(ge=1)
    start: int = Field(ge=0, le=100_000)
    end: int = Field(ge=1, le=100_000)


class TextFormat(BaseModel):
    """One formatting change (B3.1g, D118). A property left out isn't touched; link, color and
    highlight as "" and size as 0 take that formatting off."""

    model_config = ConfigDict(extra="forbid")

    bold: bool | None = None
    italic: bool | None = None
    underline: bool | None = None
    strike: bool | None = None
    link: str | None = Field(default=None, max_length=2000)
    color: str | None = Field(default=None, max_length=60)
    highlight: str | None = Field(default=None, max_length=60)
    size: int | None = Field(default=None, ge=0, le=200)
    clear: bool = False


class FormatRequest(DeskChange):
    ranges: list[FormatRange] = Field(min_length=1, max_length=300)
    format: TextFormat


# The page editor's section changes (B3.1a): the template editor's, without renaming.
SectionAction = Annotated[
    ReorderAction | RemoveAction | DuplicateAction, Field(discriminator="type")
]


class SectionRequest(DeskChange):
    action: SectionAction


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
