from __future__ import annotations

import re
import secrets
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    AccountType,
    ClientUser,
    MembershipStatus,
    Organization,
    OrganizationMember,
    OrgMemberRole,
    User,
)
from app.schemas.auth import ClientLinkOut, MeResponse, MembershipOut


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:110] or "org"


def unique_slug(db: Session, base: str) -> str:
    candidate = slugify(base)
    existing = {row[0] for row in db.query(Organization.slug).all()}
    if candidate not in existing:
        return candidate
    for _ in range(20):
        trial = f"{candidate}-{secrets.token_hex(2)}"
        if trial not in existing:
            return trial
    return f"{candidate}-{secrets.token_hex(4)}"


def invite_token() -> str:
    return secrets.token_urlsafe(24)


def primary_role_for(user: User, memberships: list[OrganizationMember], client_links: list[ClientUser]) -> str:
    if user.account_type == AccountType.platform_admin:
        return "platform_admin"
    active = [m for m in memberships if m.status == MembershipStatus.active]
    if any(m.role == OrgMemberRole.owner for m in active):
        return "owner"
    if any(m.role == OrgMemberRole.admin for m in active):
        return "admin"
    if any(m.role == OrgMemberRole.manager for m in active):
        return "manager"
    if any(m.role == OrgMemberRole.member for m in active):
        return "member"
    if client_links:
        return "client"
    return "user"


def build_me(db: Session, user: User) -> MeResponse:
    memberships = (
        db.query(OrganizationMember)
        .options(joinedload(OrganizationMember.organization))
        .filter(OrganizationMember.user_id == user.id)
        .all()
    )
    client_links = (
        db.query(ClientUser)
        .options(joinedload(ClientUser.client))
        .filter(ClientUser.user_id == user.id)
        .all()
    )

    membership_out = [
        MembershipOut(
            id=m.id,
            organization_id=m.organization_id,
            organization_name=m.organization.name,
            organization_slug=m.organization.slug,
            role=m.role,
            status=m.status,
            source=m.source,
            title=m.title,
            department=m.department,
        )
        for m in memberships
    ]
    client_out = [
        ClientLinkOut(
            id=link.id,
            client_id=link.client_id,
            client_name=link.client.name,
            client_company=link.client.company,
            organization_id=link.client.organization_id,
            status=link.status,
        )
        for link in client_links
    ]

    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        account_type=user.account_type,
        is_active=user.is_active,
        created_at=user.created_at,
        memberships=membership_out,
        client_links=client_out,
        primary_role=primary_role_for(user, memberships, client_links),
    )


def user_can_manage_org(db: Session, user: User, org_id: UUID) -> bool:
    if user.account_type == AccountType.platform_admin:
        return True
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.status == MembershipStatus.active,
            OrganizationMember.role.in_([OrgMemberRole.owner, OrgMemberRole.admin]),
        )
        .first()
    )
    return membership is not None
