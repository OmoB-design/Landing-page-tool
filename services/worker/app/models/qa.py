"""The preview check (BUILD_SPEC §11.1, B3.3a, D111): a built page's screenshots at desktop and
phone widths and its share image."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class QaShot(BaseModel):
    """A full-length screenshot (a signed link, for an hour) and its height in CSS px."""

    url: str
    width: int
    height: int


class PhoneExample(BaseModel):
    text: str
    section: str | None


class PhoneIssueOut(BaseModel):
    """Something the phone check found (B3.3b): wide, small_text, tap or overlap."""

    kind: str
    title: str
    detail: str
    count: int
    examples: list[PhoneExample]


class PhoneCheckOut(BaseModel):
    passed: bool
    issues: list[PhoneIssueOut]


class QaState(BaseModel):
    # The page version the screenshots show, and the page's version now (stale when they differ).
    version: int | None
    page_version: int
    taken_at: datetime | None
    desktop: QaShot | None
    phone: QaShot | None
    # The share image (public: apps fetch it by its address).
    share: str | None
    # What a link preview shows beside the picture.
    title: str | None
    description: str | None
    # A check queued or running.
    running: UUID | None
    # The phone check with the screenshots (B3.3b), and a Fix for phone under way.
    phone_check: PhoneCheckOut | None = None
    fixing: UUID | None = None


class QaStart(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID


class QaStarted(BaseModel):
    job_id: UUID
