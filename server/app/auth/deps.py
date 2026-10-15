from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.db.models import (
    AccountType,
    ClientUser,
    MembershipStatus,
    OrganizationMember,
    OrgMemberRole,
    User,
)
from app.db.session import get_db

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_access_token(creds.credentials)
        user_id = UUID(payload["sub"])
    except (PyJWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from None

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or missing")
    return user


def require_platform_admin(user: User = Depends(get_current_user)) -> User:
    if user.account_type != AccountType.platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin required")
    return user


def get_active_membership(
    org_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationMember:
    if user.account_type == AccountType.platform_admin:
        # Synthetic-style access: platform admin can act without membership.
        membership = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.status == MembershipStatus.active,
            )
            .first()
        )
        if membership:
            return membership
        raise HTTPException(status_code=404, detail="Organization not found")

    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.status == MembershipStatus.active,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this organization")
    return membership


def require_org_admin(membership: OrganizationMember = Depends(get_active_membership)) -> OrganizationMember:
    if membership.role not in {OrgMemberRole.owner, OrgMemberRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner or admin required")
    return membership


def get_client_access(
    client_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClientUser:
    link = (
        db.query(ClientUser)
        .filter(ClientUser.client_id == client_id, ClientUser.user_id == user.id)
        .first()
    )
    if not link:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a client user for this account")
    return link
