from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.security import create_access_token, hash_password, verify_password
from app.db.models import (
    AccountType,
    Invite,
    MembershipSource,
    MembershipStatus,
    Organization,
    OrganizationMember,
    OrgMemberRole,
    User,
)
from app.db.session import get_db
from app.schemas.auth import (
    AcceptInviteRequest,
    JoinInviteRequest,
    LoginRequest,
    MeResponse,
    RegisterOwnerRequest,
    TokenResponse,
)
from app.services.identity import build_me, unique_slug

router = APIRouter(prefix="/auth", tags=["auth"])


def _invite_expired(invite: Invite) -> bool:
    if invite.expires_at is None:
        return False
    expires = invite.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires < datetime.now(timezone.utc)


def _activate_invite_membership(db: Session, invite: Invite, user: User) -> None:
    existing = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == invite.organization_id,
            OrganizationMember.user_id == user.id,
        )
        .first()
    )
    user.is_active = True
    if existing:
        existing.role = invite.role
        existing.status = MembershipStatus.active
        existing.source = MembershipSource.invite
        existing.title = invite.title or existing.title
        existing.department = invite.department or existing.department
        existing.department_id = invite.department_id or existing.department_id
        existing.manager_id = invite.manager_id or existing.manager_id
        existing.invited_by_user_id = invite.invited_by_user_id
    else:
        db.add(
            OrganizationMember(
                organization_id=invite.organization_id,
                user_id=user.id,
                role=invite.role,
                status=MembershipStatus.active,
                source=MembershipSource.invite,
                title=invite.title,
                department=invite.department,
                department_id=invite.department_id,
                manager_id=invite.manager_id,
                invited_by_user_id=invite.invited_by_user_id,
            )
        )
    invite.accepted_at = datetime.now(timezone.utc)


@router.post("/register-owner", response_model=TokenResponse, status_code=201)
def register_owner(payload: RegisterOwnerRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        account_type=AccountType.user,
    )
    db.add(user)
    db.flush()

    slug = unique_slug(db, payload.organization_slug or payload.organization_name)
    org = Organization(
        name=payload.organization_name.strip(),
        slug=slug,
        contact_email=email,
        purchaser_user_id=user.id,
    )
    db.add(org)
    db.flush()

    db.add(
        OrganizationMember(
            organization_id=org.id,
            user_id=user.id,
            role=OrgMemberRole.owner,
            status=MembershipStatus.active,
            source=MembershipSource.purchase,
            title="Owner",
        )
    )
    db.commit()
    db.refresh(user)

    token = create_access_token(
        user_id=user.id,
        email=user.email,
        account_type=user.account_type.value,
    )
    return TokenResponse(access_token=token, me=build_me(db, user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    token = create_access_token(
        user_id=user.id,
        email=user.email,
        account_type=user.account_type.value,
    )
    return TokenResponse(access_token=token, me=build_me(db, user))


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    return build_me(db, user)


@router.get("/invites/{token}")
def peek_invite(token: str, db: Session = Depends(get_db)) -> dict:
    invite = db.query(Invite).filter(Invite.token == token).first()
    if not invite or invite.accepted_at is not None:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if _invite_expired(invite):
        raise HTTPException(status_code=410, detail="Invite has expired")
    org = db.get(Organization, invite.organization_id)
    existing = db.query(User).filter(User.email == invite.email.lower()).first()
    return {
        "email": invite.email,
        "full_name": invite.full_name or (existing.full_name if existing else ""),
        "role": invite.role.value if hasattr(invite.role, "value") else str(invite.role),
        "organization_name": org.name if org else "",
        "organization_slug": org.slug if org else "",
        "user_exists": bool(existing),
        "expires_at": invite.expires_at.isoformat() if invite.expires_at else None,
    }


@router.post("/accept-invite", response_model=TokenResponse)
def accept_invite(payload: AcceptInviteRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """New users register with password; existing users confirm with their current password."""
    invite = db.query(Invite).filter(Invite.token == payload.token).first()
    if not invite or invite.accepted_at is not None:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if _invite_expired(invite):
        raise HTTPException(status_code=410, detail="Invite has expired")
    if invite.role == OrgMemberRole.owner:
        raise HTTPException(status_code=400, detail="Owner role cannot be invited")

    email = invite.email.lower()
    password = (payload.password or "").strip()
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user = db.query(User).filter(User.email == email).first()
    org = db.get(Organization, invite.organization_id)
    is_new = user is None

    if is_new:
        name = (payload.full_name or invite.full_name or email.split("@")[0]).strip()
        if not name:
            raise HTTPException(status_code=400, detail="Full name is required")
        user = User(
            email=email,
            full_name=name,
            password_hash=hash_password(password),
            account_type=AccountType.user,
        )
        db.add(user)
        db.flush()
    else:
        if not verify_password(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password for this account")
        if payload.full_name.strip():
            user.full_name = payload.full_name.strip()

    _activate_invite_membership(db, invite, user)
    db.commit()
    db.refresh(user)

    try:
        from app.services.mailer import send_welcome_email

        if org:
            send_welcome_email(
                to=user.email,
                full_name=user.full_name,
                organization_name=org.name,
            )
    except Exception:  # noqa: BLE001
        pass

    token = create_access_token(
        user_id=user.id,
        email=user.email,
        account_type=user.account_type.value,
    )
    return TokenResponse(access_token=token, me=build_me(db, user))


@router.post("/accept-invite/join", response_model=TokenResponse)
def join_invite_authenticated(
    payload: JoinInviteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Logged-in user whose email matches the invite joins without password re-entry."""
    invite = db.query(Invite).filter(Invite.token == payload.token).first()
    if not invite or invite.accepted_at is not None:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if _invite_expired(invite):
        raise HTTPException(status_code=410, detail="Invite has expired")
    if invite.email.lower() != user.email.lower():
        raise HTTPException(
            status_code=403,
            detail=f"Sign in as {invite.email} to accept this invite",
        )
    if invite.role == OrgMemberRole.owner:
        raise HTTPException(status_code=400, detail="Owner role cannot be invited")

    org = db.get(Organization, invite.organization_id)
    _activate_invite_membership(db, invite, user)
    db.commit()
    db.refresh(user)

    try:
        from app.services.mailer import send_welcome_email

        if org:
            send_welcome_email(
                to=user.email,
                full_name=user.full_name,
                organization_name=org.name,
            )
    except Exception:  # noqa: BLE001
        pass

    token = create_access_token(
        user_id=user.id,
        email=user.email,
        account_type=user.account_type.value,
    )
    return TokenResponse(access_token=token, me=build_me(db, user))
