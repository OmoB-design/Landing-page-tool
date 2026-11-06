"""The client review link (B3.6, BUILD_SPEC §11.4, D55, D119)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ShareLink(BaseModel):
    # The link's token (made from its id with the worker's secret; never stored).
    token: str
    created_at: datetime
    expires_at: datetime
    expired: bool
    views: int
    last_viewed_at: datetime | None


class ShareState(BaseModel):
    """What the review desk's Client link shows."""

    # The page has an approved version a link can show (approved now, or before and edited since).
    can_share: bool
    approved_version: int | None
    approved_at: datetime | None
    page_version: int
    # The page has changed since that approval: the link shows the approved version until the page
    # is approved again.
    changed_since: bool
    link: ShareLink | None


class ShareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID


class ReviewInfo(BaseModel):
    """The client's page around the approved version (no sign-in)."""

    title: str
    approved_at: datetime
