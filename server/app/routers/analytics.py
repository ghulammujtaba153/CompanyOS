from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user
from app.db.models import (
    AccountType,
    MembershipStatus,
    OrganizationMember,
    TimeEntry,
    User,
)
from app.db.session import get_db

router = APIRouter(prefix="/analytics", tags=["analytics"])

DEFAULT_CAPACITY = 40.0


def _ensure_org_member(db: Session, user: User, org_id: UUID) -> None:
    if user.account_type == AccountType.platform_admin:
        return
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


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


class UtilizationOut(BaseModel):
    employeeId: str
    name: str
    department: str
    billablePct: int
    capacityHours: float
    loggedHours: float


@router.get("/utilization", response_model=list[UtilizationOut])
def utilization(
    organization_id: UUID = Query(...),
    week_start: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UtilizationOut]:
    _ensure_org_member(db, user, organization_id)
    week = week_start or _monday(date.today()).isoformat()
    members = (
        db.query(OrganizationMember)
        .options(joinedload(OrganizationMember.user), joinedload(OrganizationMember.department_ref))
        .filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.status == MembershipStatus.active,
        )
        .all()
    )
    entries = (
        db.query(TimeEntry)
        .filter(TimeEntry.organization_id == organization_id, TimeEntry.week_start == week)
        .all()
    )
    by_user: dict[UUID, list[TimeEntry]] = defaultdict(list)
    for entry in entries:
        by_user[entry.user_id].append(entry)

    rows: list[UtilizationOut] = []
    for member in members:
        person_entries = by_user.get(member.user_id, [])
        logged = sum(float(e.hours or 0) for e in person_entries)
        billable = sum(float(e.hours or 0) for e in person_entries if e.billable)
        capacity = DEFAULT_CAPACITY
        pct = int(round((billable / capacity) * 100)) if capacity else 0
        name = member.user.full_name if member.user else member.title or "Member"
        dept = member.department_ref.name if member.department_ref else (member.department or "")
        rows.append(
            UtilizationOut(
                employeeId=str(member.id),
                name=name,
                department=dept,
                billablePct=min(100, max(0, pct)),
                capacityHours=capacity,
                loggedHours=round(logged, 1),
            )
        )
    rows.sort(key=lambda row: (-row.billablePct, row.name))
    return rows
