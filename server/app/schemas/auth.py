from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.db.models import AccountType, ClientUserStatus, MembershipSource, MembershipStatus, OrgMemberRole


class RegisterOwnerRequest(BaseModel):
    """Create the buyer account + their society (organization)."""

    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    organization_name: str = Field(min_length=1, max_length=200)
    organization_slug: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class MembershipOut(BaseModel):
    id: UUID
    organization_id: UUID
    organization_name: str
    organization_slug: str
    role: OrgMemberRole
    status: MembershipStatus
    source: MembershipSource
    title: str
    department: str

    model_config = {"from_attributes": True}


class ClientLinkOut(BaseModel):
    id: UUID
    client_id: UUID
    client_name: str
    client_company: str
    organization_id: UUID
    status: ClientUserStatus

    model_config = {"from_attributes": True}


class MeResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    account_type: AccountType
    is_active: bool
    created_at: datetime
    memberships: list[MembershipOut]
    client_links: list[ClientLinkOut]
    # Primary persona for the UI: platform_admin | owner | admin | member | client
    primary_role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # Included on login/register so the client skips a second /me round-trip.
    me: MeResponse | None = None


class AcceptInviteRequest(BaseModel):
    """New users: full_name + password. Existing users: current password (not reset)."""

    token: str
    full_name: str = Field(default="", max_length=200)
    password: str = Field(default="", max_length=128)


class JoinInviteRequest(BaseModel):
    """Authenticated existing user joins without changing password."""

    token: str
