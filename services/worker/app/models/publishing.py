"""Publishing's API shapes (BUILD_SPEC §12, D87)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class VercelProject(BaseModel):
    brand_id: str
    name: str


class VercelConnection(BaseModel):
    account: str
    team_id: str | None
    token_last4: str | None
    connected_at: datetime
    # Who connected it, and the brand projects made so far (one per brand, D87).
    connected_by: str | None = None
    projects: list[VercelProject] = []


class ShopifyStore(BaseModel):
    """A brand's Shopify store (one per brand, D90)."""

    brand_id: UUID
    brand_name: str
    shop_domain: str
    connected_at: datetime | None
    # Scopes the app was granted that publishing needs but lacks (empty when all there).
    missing_scopes: list[str] = []


class IntegrationsState(BaseModel):
    vercel: VercelConnection | None
    shopify: list[ShopifyStore] = []
    # The owner's testing switch: placeholder images may be published (until real images, B1.3).
    allow_placeholder_publish: bool
    # The caller's role: owners and admins manage integrations; only owners flip the switch.
    role: Literal["owner", "admin", "member"]


class VercelConnectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    token: str = Field(min_length=10, max_length=200)
    team_id: str | None = Field(default=None, max_length=100)


class ShopifyConnectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    brand_id: UUID
    shop_domain: str = Field(min_length=3, max_length=120)
    client_id: str = Field(min_length=10, max_length=200)
    client_secret: str = Field(min_length=10, max_length=300)


class TestingSwitchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allow_placeholder_publish: bool


class GateBlocker(BaseModel):
    code: str
    message: str
    overridable: bool


class Publication(BaseModel):
    id: UUID
    destination: str
    # "publish" puts the page live; "unpublish" takes it down (D89).
    action: Literal["publish", "unpublish"] = "publish"
    status: str
    url: str | None
    created_at: datetime
    created_by: UUID | None
    gate_overridden: bool
    override_reasons: list[str]
    error: str | None
    # The page version that was published (to tell whether the live page is the current one).
    page_version: int | None
    # The Vercel project and how long the publish took (seconds).
    project: str | None = None
    seconds: int | None = None
    # Shopify: the draft page in the store's admin, and whether it uses the full-width template
    # (False: the theme's own page layout, until the template is added to the theme).
    admin_url: str | None = None
    full_width: bool | None = None


class PublishingState(BaseModel):
    build_id: UUID
    status: str
    page_version: int
    # What blocks publishing now; empty when nothing does.
    gate: list[GateBlocker]
    vercel_connected: bool
    # The newest successful publish to Vercel, if any.
    live: Publication | None
    # A publish queued or running, with its job (the page follows its progress).
    running: Publication | None
    job_id: UUID | None
    publications: list[Publication]
    # The brand's Shopify store, if connected, and the newest draft made there (D90).
    shopify_domain: str | None = None
    shopify_draft: Publication | None = None


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID
    base_version: int = Field(ge=1)
    destination: Literal["vercel", "shopify_page"]
    # Publish although the gate lists reasons (each must allow it); recorded on the publication.
    override: bool = False


class UnpublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    org_id: UUID


class ThemeFile(BaseModel):
    """A file of the full-width template, for the store owner to add by hand (D90)."""

    path: str
    body: str


class ShopifyTemplate(BaseModel):
    files: list[ThemeFile]
