"""Platform-admin console APIs (all societies overview + support tickets)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import require_platform_admin
from app.db.models import (
    AccountType,
    MembershipStatus,
    Organization,
    OrganizationMember,
    SupportTicket,
    SupportTicketPriority,
    SupportTicketStatus,
    User,
)
from app.db.session import get_db
from app.services.support_tickets import load_ticket, ticket_to_dict

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminOverview(BaseModel):
    organizations: int
    members: int
    active_members: int
    users: int
    platform_admins: int
    open_tickets: int = 0


class AdminOrgRow(BaseModel):
    id: UUID
    name: str
    slug: str
    plan_id: str = ""
    member_count: int
    created_at: datetime | None = None


class AdminUserRow(BaseModel):
    id: UUID
    email: str
    full_name: str
    account_type: str
    is_active: bool
    organizations: list[dict[str, Any]]
    created_at: datetime | None = None


@router.get("/overview", response_model=AdminOverview)
def overview(
    _admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> AdminOverview:
    org_count = db.query(func.count(Organization.id)).scalar() or 0
    member_count = db.query(func.count(OrganizationMember.id)).scalar() or 0
    active_members = (
        db.query(func.count(OrganizationMember.id))
        .filter(OrganizationMember.status == MembershipStatus.active)
        .scalar()
        or 0
    )
    user_count = db.query(func.count(User.id)).scalar() or 0
    admin_count = (
        db.query(func.count(User.id))
        .filter(User.account_type == AccountType.platform_admin)
        .scalar()
        or 0
    )
    open_tickets = (
        db.query(func.count(SupportTicket.id))
        .filter(SupportTicket.status.in_([SupportTicketStatus.open, SupportTicketStatus.in_progress]))
        .scalar()
        or 0
    )
    return AdminOverview(
        organizations=int(org_count),
        members=int(member_count),
        active_members=int(active_members),
        users=int(user_count),
        platform_admins=int(admin_count),
        open_tickets=int(open_tickets),
    )


@router.get("/organizations", response_model=list[AdminOrgRow])
def list_organizations(
    _admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> list[AdminOrgRow]:
    rows = db.query(Organization).order_by(Organization.created_at.desc()).all()
    out: list[AdminOrgRow] = []
    for org in rows:
        count = (
            db.query(func.count(OrganizationMember.id))
            .filter(OrganizationMember.organization_id == org.id)
            .scalar()
            or 0
        )
        out.append(
            AdminOrgRow(
                id=org.id,
                name=org.name,
                slug=org.slug,
                plan_id=getattr(org, "plan_id", "") or "",
                member_count=int(count),
                created_at=getattr(org, "created_at", None),
            )
        )
    return out


@router.get("/users", response_model=list[AdminUserRow])
def list_users(
    _admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> list[AdminUserRow]:
    users = (
        db.query(User)
        .options(joinedload(User.memberships).joinedload(OrganizationMember.organization))
        .order_by(User.created_at.desc())
        .all()
    )
    out: list[AdminUserRow] = []
    for user in users:
        orgs: list[dict[str, Any]] = []
        for membership in user.memberships or []:
            org = membership.organization
            if not org:
                continue
            orgs.append(
                {
                    "organization_id": str(org.id),
                    "organization_name": org.name,
                    "role": membership.role.value if hasattr(membership.role, "value") else str(membership.role),
                    "status": membership.status.value
                    if hasattr(membership.status, "value")
                    else str(membership.status),
                }
            )
        out.append(
            AdminUserRow(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                account_type=user.account_type.value
                if hasattr(user.account_type, "value")
                else str(user.account_type),
                is_active=bool(user.is_active),
                organizations=orgs,
                created_at=getattr(user, "created_at", None),
            )
        )
    return out


class TicketUpdate(BaseModel):
    status: Literal["open", "in_progress", "resolved", "closed"] | None = None
    priority: Literal["low", "medium", "high", "critical"] | None = None
    assigned_to_user_id: UUID | None = Field(
        default=None,
        description="Set to a user id to assign; omit to leave unchanged. Send null via clear_assignee.",
    )
    clear_assignee: bool = False


class AssigneeOption(BaseModel):
    id: UUID
    email: str
    full_name: str
    account_type: str


@router.get("/tickets")
def list_tickets(
    status: str | None = Query(default=None),
    _admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    query = (
        db.query(SupportTicket)
        .options(
            joinedload(SupportTicket.assigned_to),
            joinedload(SupportTicket.created_by),
        )
        .order_by(SupportTicket.created_at.desc())
    )
    if status and status != "all":
        try:
            query = query.filter(SupportTicket.status == SupportTicketStatus(status))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid status filter.") from exc
    return [ticket_to_dict(row) for row in query.all()]


@router.get("/tickets/assignees", response_model=list[AssigneeOption])
def list_assignees(
    _admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> list[AssigneeOption]:
    users = (
        db.query(User)
        .filter(User.is_active.is_(True))
        .order_by(User.full_name.asc(), User.email.asc())
        .all()
    )
    return [
        AssigneeOption(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            account_type=user.account_type.value
            if hasattr(user.account_type, "value")
            else str(user.account_type),
        )
        for user in users
    ]


@router.get("/tickets/{ticket_id}")
def get_ticket(
    ticket_id: UUID,
    _admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ticket = load_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    return ticket_to_dict(ticket)


@router.patch("/tickets/{ticket_id}")
def update_ticket(
    ticket_id: UUID,
    body: TicketUpdate,
    _admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ticket = load_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")

    if body.status is not None:
        ticket.status = SupportTicketStatus(body.status)
    if body.priority is not None:
        ticket.priority = SupportTicketPriority(body.priority)
    previous_assignee = ticket.assigned_to_user_id
    assignee: User | None = None
    if body.clear_assignee:
        ticket.assigned_to_user_id = None
    elif body.assigned_to_user_id is not None:
        assignee = db.get(User, body.assigned_to_user_id)
        if not assignee or not assignee.is_active:
            raise HTTPException(status_code=400, detail="Assignee not found or inactive.")
        ticket.assigned_to_user_id = assignee.id

    db.commit()
    refreshed = load_ticket(db, ticket_id)

    if (
        assignee
        and assignee.email
        and ticket.assigned_to_user_id != previous_assignee
    ):
        try:
            from app.services.mailer import send_ticket_email

            send_ticket_email(
                to=assignee.email,
                ticket_key=ticket.ticket_key,
                title=ticket.title,
                event="Ticket assigned to you",
                summary=ticket.ai_summary or "",
                priority=ticket.priority.value if hasattr(ticket.priority, "value") else str(ticket.priority),
            )
        except Exception:  # noqa: BLE001
            pass

    return ticket_to_dict(refreshed or ticket)
