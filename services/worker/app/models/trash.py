"""Trash (B1.6a, D92): what was deleted, by whom, and until when it can be restored."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

TrashKind = Literal["page", "brand", "product", "template"]


class TrashItem(BaseModel):
    kind: TrashKind
    id: UUID
    name: str
    # Context under the name: the page's or product's brand; what went with a brand.
    detail: str | None = None
    deleted_at: datetime
    deleted_by: str | None
    # After this it's deleted for good (7 days after it was deleted).
    expires_at: datetime


class TrashState(BaseModel):
    items: list[TrashItem]
    # Owners and admins delete for good; everyone can restore.
    can_permanently_delete: bool


class TrashRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
