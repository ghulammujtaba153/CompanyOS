from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user
from app.auth.security import hash_password
from app.db.models import (
    AccountType,
    Department,
    Invite,
    MembershipSource,
    MembershipStatus,
    Organization,
    OrganizationMember,
    OrgMemberRole,
    User,
)
from app.db.session import get_db
from app.schemas.org import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    InviteCreate,
    InviteOut,
    LogoUploadOut,
    MemberCreate,
    MemberOut,
    MemberUpdate,
    OrganizationOut,
    OrganizationUpdate,
    RolePermissionRow,
)
from app.services import cloudinary_assets
from app.services.identity import invite_token, user_can_manage_org

MAX_LOGO_BYTES = int(1.5 * 1024 * 1024)
ALLOWED_LOGO_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/svg+xml",
}

# Default sidebar access when creating a department without a copy source.
BASELINE_ACCESS = [
    "/dashboard/work-management",
    "/dashboard/work-management/projects",
    "/dashboard/work-management/tasks",
    "/dashboard/communications",
    "/dashboard/documents",
    "/dashboard/analytics",
    "/dashboard/subscription",
]

router = APIRouter(prefix="/organizations", tags=["organizations"])

DEFAULT_ROLE_PERMISSIONS: list[dict[str, object]] = [
    {"area": "Workspace", "capability": "Billing, security & SSO", "roles": ["Owner"]},
    {"area": "Workspace", "capability": "Transfer ownership", "roles": ["Owner"]},
    {"area": "People", "capability": "Invite & remove people", "roles": ["Owner", "Admin"]},
    {"area": "People", "capability": "Change access roles", "roles": ["Owner", "Admin"]},
    {"area": "People", "capability": "Manage departments", "roles": ["Owner", "Admin"]},
    {
        "area": "People",
        "capability": "View directory",
        "roles": ["Owner", "Admin", "Manager", "Member"],
    },
    {"area": "Clients", "capability": "Manage clients & engagements", "roles": ["Owner", "Admin"]},
    {
        "area": "Clients",
        "capability": "Promote engagements to Work Management",
        "roles": ["Owner", "Admin"],
    },
    {"area": "Work", "capability": "Create projects", "roles": ["Owner", "Admin", "Manager"]},
    {
        "area": "Work",
        "capability": "Work on assigned projects",
        "roles": ["Owner", "Admin", "Manager", "Member"],
    },
    {"area": "Governance", "capability": "Approve requests", "roles": ["Owner", "Admin", "Manager"]},
    {"area": "Governance", "capability": "Configure agents & autonomy", "roles": ["Owner", "Admin"]},
]

ALLOWED_ROLES = {"Owner", "Admin", "Manager", "Member"}


def _parse_role_permissions(raw: str | None) -> list[RolePermissionRow]:
    if not (raw or "").strip():
        return [RolePermissionRow.model_validate(row) for row in DEFAULT_ROLE_PERMISSIONS]
    try:
        data = json.loads(raw)
    except Exception:
        return [RolePermissionRow.model_validate(row) for row in DEFAULT_ROLE_PERMISSIONS]
    if not isinstance(data, list) or not data:
        return [RolePermissionRow.model_validate(row) for row in DEFAULT_ROLE_PERMISSIONS]
    rows: list[RolePermissionRow] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        roles = [str(role) for role in (item.get("roles") or []) if str(role) in ALLOWED_ROLES]
        rows.append(
            RolePermissionRow(
                area=str(item.get("area") or "").strip() or "General",
                capability=str(item.get("capability") or "").strip(),
                roles=roles,
            )
        )
    return rows or [RolePermissionRow.model_validate(row) for row in DEFAULT_ROLE_PERMISSIONS]


def _org_out(org: Organization) -> OrganizationOut:
    return OrganizationOut(
        id=org.id,
        name=org.name,
        slug=org.slug,
        legal_name=org.legal_name,
        tagline=org.tagline,
        website=org.website,
        industry=org.industry,
        company_size=org.company_size,
        headquarters=org.headquarters,
        about=org.about,
        contact_email=org.contact_email,
        contact_phone=org.contact_phone,
        workspace_label=org.workspace_label,
        logo_url=org.logo_url or "",
        logo_public_id=org.logo_public_id or "",
        role_permissions=_parse_role_permissions(getattr(org, "role_permissions", "") or ""),
        stripe_customer_id=getattr(org, "stripe_customer_id", "") or "",
        stripe_subscription_id=getattr(org, "stripe_subscription_id", "") or "",
        plan_id=getattr(org, "plan_id", "") or "",
        subscription_status=getattr(org, "subscription_status", "") or "",
        renews_on=getattr(org, "renews_on", "") or "",
        payment_brand=getattr(org, "payment_brand", "") or "",
        payment_last4=getattr(org, "payment_last4", "") or "",
        purchaser_user_id=org.purchaser_user_id,
        created_at=org.created_at,
    )


def _member_out(m: OrganizationMember) -> MemberOut:
    dept_name = m.department
    if m.department_ref is not None:
        dept_name = m.department_ref.name
    return MemberOut(
        id=m.id,
        user_id=m.user_id,
        email=m.user.email,
        full_name=m.user.full_name,
        role=m.role,
        status=m.status,
        source=m.source,
        title=m.title,
        department=dept_name,
        department_id=m.department_id,
        manager_id=m.manager_id,
        joined_at=m.joined_at,
    )


def _department_out(d: Department) -> DepartmentOut:
    return DepartmentOut(
        id=d.id,
        organization_id=d.organization_id,
        name=d.name,
        description=d.description,
        head_member_id=d.head_member_id,
        access_hrefs=d.access_list(),
        created_at=d.created_at,
    )


def _invite_out(
    invite: Invite,
    member_id: UUID | None = None,
    *,
    email_sent: bool = False,
    email_detail: str = "",
    user_exists: bool = False,
) -> InviteOut:
    return InviteOut(
        id=invite.id,
        organization_id=invite.organization_id,
        email=invite.email,
        full_name=invite.full_name,
        role=invite.role,
        title=invite.title,
        department=invite.department,
        department_id=invite.department_id,
        manager_id=invite.manager_id,
        token=invite.token,
        accepted_at=invite.accepted_at,
        created_at=invite.created_at,
        invite_url_path=f"/invite/{invite.token}",
        member_id=member_id,
        email_sent=email_sent,
        email_detail=email_detail,
        user_exists=user_exists,
    )


def _require_org_member(db: Session, user: User, org_id: UUID) -> Organization:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if user.account_type == AccountType.platform_admin:
        return org
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
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    return org


def _resolve_department(
    db: Session,
    org_id: UUID,
    department_id: UUID | None,
    department_name: str,
) -> tuple[UUID | None, str]:
    if department_id:
        dep = (
            db.query(Department)
            .filter(Department.id == department_id, Department.organization_id == org_id)
            .first()
        )
        if not dep:
            raise HTTPException(status_code=400, detail="Department not found")
        return dep.id, dep.name
    name = (department_name or "").strip()
    if not name:
        return None, ""
    dep = (
        db.query(Department)
        .filter(Department.organization_id == org_id, Department.name.ilike(name))
        .first()
    )
    if dep:
        return dep.id, dep.name
    return None, name


def _validate_manager(db: Session, org_id: UUID, manager_id: UUID | None, member_id: UUID | None) -> None:
    if not manager_id:
        return
    manager = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.id == manager_id, OrganizationMember.organization_id == org_id)
        .first()
    )
    if not manager:
        raise HTTPException(status_code=400, detail="Manager not found in this organization")
    if member_id and manager_id == member_id:
        raise HTTPException(status_code=400, detail="A person can't report to themselves")
    # Detect cycles: walk up from proposed manager.
    if member_id:
        cursor = manager
        seen = {member_id}
        while cursor and cursor.manager_id:
            if cursor.manager_id in seen:
                raise HTTPException(status_code=400, detail="That manager reports to this person")
            seen.add(cursor.id)
            cursor = db.get(OrganizationMember, cursor.manager_id)


@router.get("", response_model=list[OrganizationOut])
def list_organizations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OrganizationOut]:
    if user.account_type == AccountType.platform_admin:
        rows = db.query(Organization).order_by(Organization.created_at.desc()).all()
    else:
        org_ids = [
            row[0]
            for row in db.query(OrganizationMember.organization_id)
            .filter(
                OrganizationMember.user_id == user.id,
                OrganizationMember.status == MembershipStatus.active,
            )
            .all()
        ]
        if not org_ids:
            return []
        rows = (
            db.query(Organization)
            .filter(Organization.id.in_(org_ids))
            .order_by(Organization.created_at.desc())
            .all()
        )
    return [_org_out(org) for org in rows]


@router.get("/{org_id}", response_model=OrganizationOut)
def get_organization(
    org_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationOut:
    return _org_out(_require_org_member(db, user, org_id))


@router.patch("/{org_id}", response_model=OrganizationOut)
def update_organization(
    org_id: UUID,
    payload: OrganizationUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationOut:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    data = payload.model_dump(exclude_unset=True)
    if "logo_url" in data and not (data.get("logo_url") or "").strip():
        data["logo_url"] = ""
        data["logo_public_id"] = ""
        if org.logo_public_id:
            try:
                cloudinary_assets.delete_logo(org.logo_public_id)
            except Exception:
                pass
    if "role_permissions" in data:
        rows = data.pop("role_permissions") or []
        cleaned: list[dict[str, object]] = []
        for item in rows:
            roles = [role for role in (item.get("roles") or []) if role in ALLOWED_ROLES]
            capability = str(item.get("capability") or "").strip()
            if not capability:
                continue
            # Owner always keeps billing / transfer ownership.
            if capability in {"Billing, security & SSO", "Transfer ownership"} and "Owner" not in roles:
                roles = ["Owner", *roles]
            cleaned.append(
                {
                    "area": str(item.get("area") or "General").strip() or "General",
                    "capability": capability,
                    "roles": roles,
                }
            )
        data["role_permissions"] = json.dumps(cleaned or DEFAULT_ROLE_PERMISSIONS)
    for key, value in data.items():
        setattr(org, key, value)
    db.commit()
    db.refresh(org)
    return _org_out(org)


@router.post("/{org_id}/logo", response_model=LogoUploadOut)
async def upload_organization_logo(
    org_id: UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LogoUploadOut:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Upload PNG, JPG, WebP, or SVG")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo must be 1.5 MB or smaller")

    from io import BytesIO

    try:
        uploaded = cloudinary_assets.upload_logo(
            file=BytesIO(raw),
            organization_id=str(org_id),
            filename=file.filename,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        message = str(exc)
        if "missing permissions" in message.lower() or "forbidden" in message.lower():
            raise HTTPException(
                status_code=403,
                detail=(
                    "Cloudinary blocked upload (missing create permission). "
                    "In Console → Settings → API Keys, grant Upload/create access "
                    "or set CLOUDINARY_UPLOAD_PRESET to an unsigned preset."
                ),
            ) from exc
        raise HTTPException(status_code=502, detail=f"Cloudinary upload failed: {exc}") from exc

    org.logo_url = uploaded["logo_url"]
    org.logo_public_id = uploaded["logo_public_id"]
    db.commit()
    db.refresh(org)
    return LogoUploadOut(
        logo_url=org.logo_url,
        logo_public_id=org.logo_public_id,
        organization=_org_out(org),
    )


@router.delete("/{org_id}/logo", response_model=OrganizationOut)
def delete_organization_logo(
    org_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationOut:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if org.logo_public_id:
        try:
            cloudinary_assets.delete_logo(org.logo_public_id)
        except Exception:
            pass
    org.logo_url = ""
    org.logo_public_id = ""
    db.commit()
    db.refresh(org)
    return _org_out(org)


@router.get("/{org_id}/members", response_model=list[MemberOut])
def list_members(
    org_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MemberOut]:
    _require_org_member(db, user, org_id)
    members = (
        db.query(OrganizationMember)
        .options(
            joinedload(OrganizationMember.user),
            joinedload(OrganizationMember.department_ref),
        )
        .filter(OrganizationMember.organization_id == org_id)
        .order_by(OrganizationMember.joined_at.asc())
        .all()
    )
    return [_member_out(m) for m in members]


@router.patch("/{org_id}/members/{member_id}", response_model=MemberOut)
def update_member(
    org_id: UUID,
    member_id: UUID,
    payload: MemberUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemberOut:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")

    member = (
        db.query(OrganizationMember)
        .options(
            joinedload(OrganizationMember.user),
            joinedload(OrganizationMember.department_ref),
        )
        .filter(OrganizationMember.id == member_id, OrganizationMember.organization_id == org_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    data = payload.model_dump(exclude_unset=True)
    full_name = data.pop("full_name", None)

    if "role" in data and member.role == OrgMemberRole.owner and data["role"] != OrgMemberRole.owner:
        owners = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.role == OrgMemberRole.owner,
                OrganizationMember.status == MembershipStatus.active,
            )
            .count()
        )
        if owners <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last owner")

    if "manager_id" in data:
        _validate_manager(db, org_id, data["manager_id"], member.id)

    if "department_id" in data or "department" in data:
        dep_id, dep_name = _resolve_department(
            db,
            org_id,
            data.get("department_id", member.department_id),
            data.get("department", member.department),
        )
        data["department_id"] = dep_id
        data["department"] = dep_name

    if full_name is not None:
        member.user.full_name = full_name.strip() or member.user.full_name

    for key, value in data.items():
        setattr(member, key, value)
    db.commit()
    db.refresh(member)
    return _member_out(member)


@router.delete("/{org_id}/members/{member_id}", status_code=204)
def delete_member(
    org_id: UUID,
    member_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")

    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.id == member_id, OrganizationMember.organization_id == org_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.user_id == user.id:
        raise HTTPException(status_code=400, detail="You can't remove yourself")
    if member.role == OrgMemberRole.owner:
        owners = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.role == OrgMemberRole.owner,
                OrganizationMember.status == MembershipStatus.active,
            )
            .count()
        )
        if owners <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner")

    # Clear references from peers / departments.
    db.query(OrganizationMember).filter(OrganizationMember.manager_id == member_id).update(
        {"manager_id": None}, synchronize_session=False
    )
    db.query(Department).filter(Department.head_member_id == member_id).update(
        {"head_member_id": None}, synchronize_session=False
    )
    db.delete(member)
    db.commit()


@router.post("/{org_id}/members", response_model=MemberOut, status_code=201)
def add_member(
    org_id: UUID,
    payload: MemberCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemberOut:
    """Add an active user to the workspace with a login password (no email invite)."""
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    if payload.role == OrgMemberRole.owner:
        raise HTTPException(
            status_code=400,
            detail="Add as admin, manager, or member; ownership is purchased/transferred",
        )

    email = payload.email.lower().strip()
    full_name = payload.full_name.strip()
    dep_id, dep_name = _resolve_department(db, org_id, payload.department_id, payload.department)
    _validate_manager(db, org_id, payload.manager_id, None)

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        already = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.user_id == existing_user.id,
            )
            .first()
        )
        if already and already.status == MembershipStatus.active:
            raise HTTPException(status_code=400, detail="User is already a member")
        existing_user.full_name = full_name
        existing_user.password_hash = hash_password(payload.password)
        existing_user.is_active = True
        target = existing_user
    else:
        target = User(
            email=email,
            full_name=full_name,
            password_hash=hash_password(payload.password),
            account_type=AccountType.user,
            is_active=True,
        )
        db.add(target)
        db.flush()

    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == target.id,
        )
        .first()
    )
    if membership:
        membership.role = payload.role
        membership.status = MembershipStatus.active
        membership.source = MembershipSource.invite
        membership.title = payload.title.strip()
        membership.department = dep_name
        membership.department_id = dep_id
        membership.manager_id = payload.manager_id
        membership.invited_by_user_id = user.id
    else:
        membership = OrganizationMember(
            organization_id=org_id,
            user_id=target.id,
            role=payload.role,
            status=MembershipStatus.active,
            source=MembershipSource.invite,
            title=payload.title.strip(),
            department=dep_name,
            department_id=dep_id,
            manager_id=payload.manager_id,
            invited_by_user_id=user.id,
        )
        db.add(membership)

    db.commit()
    membership = (
        db.query(OrganizationMember)
        .options(
            joinedload(OrganizationMember.user),
            joinedload(OrganizationMember.department_ref),
        )
        .filter(OrganizationMember.id == membership.id)
        .one()
    )
    return _member_out(membership)


@router.post("/{org_id}/invites", response_model=InviteOut, status_code=201)
def create_invite(
    org_id: UUID,
    payload: InviteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InviteOut:
    """Create a pending invite and email the recipient a join link."""
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    if payload.role == OrgMemberRole.owner:
        raise HTTPException(
            status_code=400,
            detail="Invite as admin, manager, or member; ownership is purchased/transferred",
        )

    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    email = str(payload.email).lower().strip()
    full_name = (payload.full_name or "").strip() or email.split("@")[0]
    dep_id, dep_name = _resolve_department(db, org_id, payload.department_id, payload.department)
    _validate_manager(db, org_id, payload.manager_id, None)

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        already = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.user_id == existing_user.id,
            )
            .first()
        )
        if already and already.status == MembershipStatus.active:
            raise HTTPException(status_code=400, detail="User is already a member")

    # Supersede older pending invites for the same email.
    pending = (
        db.query(Invite)
        .filter(
            Invite.organization_id == org_id,
            Invite.email == email,
            Invite.accepted_at.is_(None),
        )
        .all()
    )
    now = datetime.now(timezone.utc)
    for old in pending:
        old.accepted_at = now  # mark spent so peek rejects them

    token = invite_token()
    invite = Invite(
        organization_id=org_id,
        email=email,
        full_name=full_name,
        role=payload.role,
        title=(payload.title or "").strip(),
        department=dep_name,
        department_id=dep_id,
        manager_id=payload.manager_id,
        token=token,
        invited_by_user_id=user.id,
        expires_at=now + timedelta(days=14),
    )
    db.add(invite)

    member_id: UUID | None = None
    if existing_user:
        membership = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.user_id == existing_user.id,
            )
            .first()
        )
        if membership:
            membership.role = payload.role
            membership.status = MembershipStatus.invited
            membership.source = MembershipSource.invite
            membership.title = invite.title
            membership.department = dep_name
            membership.department_id = dep_id
            membership.manager_id = payload.manager_id
            membership.invited_by_user_id = user.id
        else:
            membership = OrganizationMember(
                organization_id=org_id,
                user_id=existing_user.id,
                role=payload.role,
                status=MembershipStatus.invited,
                source=MembershipSource.invite,
                title=invite.title,
                department=dep_name,
                department_id=dep_id,
                manager_id=payload.manager_id,
                invited_by_user_id=user.id,
            )
            db.add(membership)
        db.flush()
        member_id = membership.id

    db.commit()
    db.refresh(invite)

    from app.services.mailer import send_invite_email

    mail = send_invite_email(
        to=email,
        organization_name=org.name,
        role=payload.role.value if hasattr(payload.role, "value") else str(payload.role),
        invite_path=f"/invite/{invite.token}",
        inviter_name=user.full_name or user.email,
        user_exists=bool(existing_user),
    )
    detail = ""
    if mail.get("sent"):
        detail = f"Invite emailed to {email}"
    elif mail.get("skipped"):
        detail = f"Invite created but email skipped ({mail.get('reason')}). Link: /invite/{invite.token}"
    else:
        detail = f"Invite created but email failed: {mail.get('detail') or mail.get('reason')}"

    return _invite_out(
        invite,
        member_id=member_id,
        email_sent=bool(mail.get("sent")),
        email_detail=detail,
        user_exists=bool(existing_user),
    )


@router.get("/{org_id}/invites", response_model=list[InviteOut])
def list_invites(
    org_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InviteOut]:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    invites = (
        db.query(Invite)
        .filter(Invite.organization_id == org_id, Invite.accepted_at.is_(None))
        .order_by(Invite.created_at.desc())
        .all()
    )
    out: list[InviteOut] = []
    for invite in invites:
        existing = db.query(User).filter(User.email == invite.email).first()
        out.append(_invite_out(invite, user_exists=bool(existing)))
    return out


@router.post("/{org_id}/invites/{invite_id}/resend", response_model=InviteOut)
def resend_invite(
    org_id: UUID,
    invite_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InviteOut:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    invite = (
        db.query(Invite)
        .filter(Invite.id == invite_id, Invite.organization_id == org_id, Invite.accepted_at.is_(None))
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Pending invite not found")
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    invite.token = invite_token()
    invite.expires_at = datetime.now(timezone.utc) + timedelta(days=14)
    db.commit()
    db.refresh(invite)

    existing = db.query(User).filter(User.email == invite.email).first()
    from app.services.mailer import send_invite_email

    mail = send_invite_email(
        to=invite.email,
        organization_name=org.name,
        role=invite.role.value if hasattr(invite.role, "value") else str(invite.role),
        invite_path=f"/invite/{invite.token}",
        inviter_name=user.full_name or user.email,
        user_exists=bool(existing),
    )
    detail = (
        f"Invite re-sent to {invite.email}"
        if mail.get("sent")
        else f"Resend failed: {mail.get('detail') or mail.get('reason')}"
    )
    return _invite_out(
        invite,
        email_sent=bool(mail.get("sent")),
        email_detail=detail,
        user_exists=bool(existing),
    )


@router.delete("/{org_id}/invites/{invite_id}", status_code=204)
def revoke_invite(
    org_id: UUID,
    invite_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    invite = (
        db.query(Invite)
        .filter(Invite.id == invite_id, Invite.organization_id == org_id, Invite.accepted_at.is_(None))
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Pending invite not found")
    invite.accepted_at = datetime.now(timezone.utc)
    existing = db.query(User).filter(User.email == invite.email).first()
    if existing:
        membership = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.user_id == existing.id,
                OrganizationMember.status == MembershipStatus.invited,
            )
            .first()
        )
        if membership:
            db.delete(membership)
    db.commit()


@router.get("/{org_id}/departments", response_model=list[DepartmentOut])
def list_departments(
    org_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DepartmentOut]:
    _require_org_member(db, user, org_id)
    rows = (
        db.query(Department)
        .filter(Department.organization_id == org_id)
        .order_by(Department.name.asc())
        .all()
    )
    return [_department_out(d) for d in rows]


@router.post("/{org_id}/departments", response_model=DepartmentOut, status_code=201)
def create_department(
    org_id: UUID,
    payload: DepartmentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DepartmentOut:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    _require_org_member(db, user, org_id)

    name = payload.name.strip()
    clash = (
        db.query(Department)
        .filter(Department.organization_id == org_id, Department.name.ilike(name))
        .first()
    )
    if clash:
        raise HTTPException(status_code=400, detail=f"{name} already exists")

    if payload.head_member_id:
        head = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.id == payload.head_member_id,
                OrganizationMember.organization_id == org_id,
            )
            .first()
        )
        if not head:
            raise HTTPException(status_code=400, detail="Head must be a member of this organization")

    hrefs = payload.access_hrefs
    if hrefs is None and payload.copy_access_from:
        source = (
            db.query(Department)
            .filter(
                Department.id == payload.copy_access_from,
                Department.organization_id == org_id,
            )
            .first()
        )
        hrefs = source.access_list() if source else list(BASELINE_ACCESS)
    if hrefs is None:
        hrefs = list(BASELINE_ACCESS)

    dep = Department(
        organization_id=org_id,
        name=name,
        description=payload.description.strip(),
        head_member_id=payload.head_member_id,
    )
    dep.set_access_list(hrefs)
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return _department_out(dep)


@router.patch("/{org_id}/departments/{department_id}", response_model=DepartmentOut)
def update_department(
    org_id: UUID,
    department_id: UUID,
    payload: DepartmentUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DepartmentOut:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")

    dep = (
        db.query(Department)
        .filter(Department.id == department_id, Department.organization_id == org_id)
        .first()
    )
    if not dep:
        raise HTTPException(status_code=404, detail="Department not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        clash = (
            db.query(Department)
            .filter(
                Department.organization_id == org_id,
                Department.name.ilike(name),
                Department.id != department_id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail=f"{name} already exists")
        dep.name = name
        # Keep denormalized member.department in sync.
        db.query(OrganizationMember).filter(OrganizationMember.department_id == department_id).update(
            {"department": name}, synchronize_session=False
        )
        data.pop("name")

    if "head_member_id" in data and data["head_member_id"]:
        head = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.id == data["head_member_id"],
                OrganizationMember.organization_id == org_id,
            )
            .first()
        )
        if not head:
            raise HTTPException(status_code=400, detail="Head must be a member of this organization")

    access = data.pop("access_hrefs", None)
    for key, value in data.items():
        if key == "description" and value is not None:
            setattr(dep, key, value.strip() if isinstance(value, str) else value)
        else:
            setattr(dep, key, value)
    if access is not None:
        dep.set_access_list(access)

    db.commit()
    db.refresh(dep)
    return _department_out(dep)


@router.delete("/{org_id}/departments/{department_id}", status_code=204)
def delete_department(
    org_id: UUID,
    department_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not user_can_manage_org(db, user, org_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")

    dep = (
        db.query(Department)
        .filter(Department.id == department_id, Department.organization_id == org_id)
        .first()
    )
    if not dep:
        raise HTTPException(status_code=404, detail="Department not found")

    countable = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.department_id == department_id)
        .count()
    )
    if countable:
        raise HTTPException(
            status_code=400,
            detail=f"Move its {countable} {'person' if countable == 1 else 'people'} to another department first.",
        )

    db.delete(dep)
    db.commit()
