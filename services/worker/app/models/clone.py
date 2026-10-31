"""The clone path's requests and state (BUILD_SPEC §8.4)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.template import TemplateType

MAX_PASTE_CHARS = 4_000_000  # the web app's request limit is 4.5 MB


class CloneTermsState(BaseModel):
    clone_enabled: bool
    accepted_at: datetime | None
    accepted_by: str | None  # their name, else their email
    can_accept: bool  # owners and admins accept for the workspace


class CloneTermsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    accept: bool

    @field_validator("accept")
    @classmethod
    def must_accept(cls, value: bool) -> bool:
        if not value:
            raise ValueError("the terms can only be accepted")
        return value


def _address(value: str | None) -> str | None:
    value = (value or "").strip()
    if not value:
        return None
    if not value.lower().startswith(("http://", "https://")):
        value = f"https://{value}"
    return value


class CloneRequest(BaseModel):
    """A page's address, or its HTML (with, optionally, the address it came from)."""

    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    url: str | None = Field(default=None, max_length=2000)
    html: str | None = Field(default=None, max_length=MAX_PASTE_CHARS)
    source_url: str | None = Field(default=None, max_length=2000)
    name: str | None = Field(default=None, max_length=120)
    type: TemplateType = "advertorial"

    @field_validator("url", "source_url")
    @classmethod
    def address(cls, value: str | None) -> str | None:
        return _address(value)

    @field_validator("name")
    @classmethod
    def tidy_name(cls, value: str | None) -> str | None:
        return " ".join((value or "").split()) or None

    @model_validator(mode="after")
    def one_source(self) -> "CloneRequest":
        if self.html is not None and not self.html.strip():
            self.html = None
        if bool(self.url) == (self.html is not None):
            raise ValueError("give either the page's address or its HTML")
        return self
