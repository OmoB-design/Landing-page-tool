"""Lander, the page editor's agent (B3.1c, D106): requests, conversations and what a job did."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.desk import DeskState

# The longest request Lander takes (the composer's limit).
REQUEST_MAX = 500
# Pictures a request can carry (B3.1d), and the largest one, decoded.
MAX_IMAGES = 3
MAX_IMAGE_BYTES = 3_000_000


class AgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    base_version: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=REQUEST_MAX)
    # The section the request is about (the composer's chip), or None for the whole page.
    target_key: str | None = Field(default=None, max_length=100)
    # The conversation to continue; None starts a new one.
    thread_id: UUID | None = None
    # Pictures for reference (B3.1d): data URLs (PNG, JPEG or WebP), up to three.
    images: list[str] = Field(default_factory=list, max_length=MAX_IMAGES)


class AgentTarget(BaseModel):
    key: str
    label: str


class AgentStart(BaseModel):
    """A request on its way: the desk (showing Lander's job running), the conversation, the job
    and the request's message."""

    desk: DeskState
    thread_id: UUID
    job_id: UUID
    message_id: UUID


FEEDBACK_REASONS = ("did_not_do_it", "changed_too_much", "wrong_words", "looked_wrong")


class AgentFeedback(BaseModel):
    """A rating on one of Lander's replies (B3.1e): up or down, and for a down any quick reasons
    and a note."""

    rating: Literal["up", "down"]
    reasons: list[str] = Field(default_factory=list)
    note: str | None = None


class AgentMessage(BaseModel):
    id: UUID
    role: Literal["user", "assistant"]
    # user: {text, target}; assistant: {state, plan, steps, changes, closing, reason,
    # page_version, error}.
    content: dict[str, Any]
    job_id: UUID | None
    created_at: datetime
    # The rating given to an assistant reply, if any.
    feedback: AgentFeedback | None = None


class AgentThreadSummary(BaseModel):
    """One of the page's conversations, for Recents (B3.1e)."""

    thread_id: UUID
    title: str
    requests: int
    started_at: datetime
    last_at: datetime


class AgentThreads(BaseModel):
    threads: list[AgentThreadSummary]


class AgentRate(BaseModel):
    """Rate a reply (by the job that wrote it), or take the rating back (`rating` None)."""

    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    job_id: UUID
    rating: Literal["up", "down"] | None
    reasons: list[Literal["did_not_do_it", "changed_too_much", "wrong_words", "looked_wrong"]] = (
        Field(default_factory=list, max_length=4)
    )
    note: str | None = Field(default=None, max_length=500)


class AgentThread(BaseModel):
    """A conversation with Lander about one page (the newest when none is named)."""

    thread_id: UUID | None
    messages: list[AgentMessage]


class AgentStop(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
