"""Members and invites (B6.1, D129)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Role = Literal["owner", "admin", "member"]


class Member(BaseModel):
    user_id: UUID
    name: str
    email: str
    role: Role
    joined_at: datetime
    # The person asking.
    you: bool
    # Their profile photo's path in the avatars bucket (B6.7), if they have one.
    avatar_url: str | None = None


class Invite(BaseModel):
    id: UUID
    email: str
    role: Role
    invited_by: str | None
    created_at: datetime
    expires_at: datetime
    expired: bool
    # The invite's token (made from its id with the worker's secret; never stored). The website
    # turns it into the link.
    token: str


class MembersState(BaseModel):
    """Settings → Members: everyone in the workspace; open invites for owners and admins."""

    your_role: Role
    members: list[Member]
    # Empty for members (only owners and admins see and manage invites).
    invites: list[Invite]


class InviteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: Role = "member"


class RoleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Role


class AcceptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=10, max_length=100)


class InviteInfo(BaseModel):
    """The invite page (no sign-in needed): who invites whom, to what."""

    status: Literal["open", "expired", "revoked", "accepted"]
    invite_id: UUID
    workspace: str
    email: str
    role: Role
    invited_by: str | None


class Accepted(BaseModel):
    org_id: UUID
    workspace: str
    # Already in the workspace before this (the invite still counts as used).
    already_member: bool
