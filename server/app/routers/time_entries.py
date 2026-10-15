from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user
from app.db.models import (
    AccountType,
    MembershipStatus,
    OrganizationMember,
    TimeEntry,
    User,
    WorkProject,
    WorkProjectMember,
)
from app.db.session import get_db
from app.schemas.org import (
    TimeEntryCreate,
    TimeEntryOut,
    TimeEntryUpdate,
    TimesheetOut,
    TimesheetSubmit,
)

router = APIRouter(prefix="/time-entries", tags=["time"])


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


def _entry_out(row: TimeEntry) -> TimeEntryOut:
    project = row.project
    return TimeEntryOut(
        id=row.id,
        organization_id=row.organization_id,
        user_id=row.user_id,
        project_id=row.project_id,
        project_name=project.name if project else "",
        project_key=project.key if project else "",
        week_start=row.week_start,
        hours=float(row.hours or 0),
        billable=bool(row.billable),
        note=row.note or "",
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _user_project_ids(db: Session, user: User, org_id: UUID) -> list[UUID]:
    if user.account_type == AccountType.platform_admin:
        return [
            row[0]
            for row in db.query(WorkProject.id)
            .filter(WorkProject.organization_id == org_id)
            .all()
        ]
    email = user.email.lower()
    rows = (
        db.query(WorkProject.id)
        .join(WorkProjectMember, WorkProjectMember.project_id == WorkProject.id)
        .filter(
            WorkProject.organization_id == org_id,
            WorkProjectMember.email == email,
        )
        .all()
    )
    return [row[0] for row in rows]


def _load_entries(db: Session, org_id: UUID, user_id: UUID, week_start: str) -> list[TimeEntry]:
    return (
        db.query(TimeEntry)
        .options(joinedload(TimeEntry.project))
        .filter(
            TimeEntry.organization_id == org_id,
            TimeEntry.user_id == user_id,
            TimeEntry.week_start == week_start,
        )
        .order_by(TimeEntry.created_at.asc())
        .all()
    )


def _ensure_week_rows(db: Session, user: User, org_id: UUID, week_start: str) -> list[TimeEntry]:
    rows = _load_entries(db, org_id, user.id, week_start)
    if rows:
        return rows
    project_ids = _user_project_ids(db, user, org_id)
    if not project_ids:
        return []
    for project_id in project_ids:
        db.add(
            TimeEntry(
                organization_id=org_id,
                user_id=user.id,
                project_id=project_id,
                week_start=week_start,
                hours=0,
                billable=True,
                note="",
                status="draft",
            )
        )
    db.commit()
    return _load_entries(db, org_id, user.id, week_start)


def _week_status(entries: list[TimeEntry]) -> str:
    if not entries:
        return "draft"
    if all(entry.status == "submitted" for entry in entries):
        return "submitted"
    return "draft"


@router.get("", response_model=TimesheetOut)
def get_timesheet(
    organization_id: UUID = Query(...),
    week_start: str = Query(..., min_length=10, max_length=10),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimesheetOut:
    _ensure_org_member(db, user, organization_id)
    rows = _ensure_week_rows(db, user, organization_id, week_start)
    return TimesheetOut(
        week_start=week_start,
        status=_week_status(rows),
        entries=[_entry_out(row) for row in rows],
    )


@router.post("", response_model=TimeEntryOut, status_code=201)
def create_time_entry(
    payload: TimeEntryCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimeEntryOut:
    _ensure_org_member(db, user, organization_id)
    project = db.get(WorkProject, payload.project_id)
    if not project or project.organization_id != organization_id:
        raise HTTPException(status_code=400, detail="Project not found in this organization")
    allowed = set(_user_project_ids(db, user, organization_id))
    if payload.project_id not in allowed and user.account_type != AccountType.platform_admin:
        raise HTTPException(status_code=403, detail="Not a member of this project")

    existing = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.user_id == user.id,
            TimeEntry.project_id == payload.project_id,
            TimeEntry.week_start == payload.week_start,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Entry already exists for this project and week")

    row = TimeEntry(
        organization_id=organization_id,
        user_id=user.id,
        project_id=payload.project_id,
        week_start=payload.week_start,
        hours=max(0.0, float(payload.hours or 0)),
        billable=bool(payload.billable),
        note=payload.note.strip(),
        status="draft",
    )
    db.add(row)
    db.commit()
    row = (
        db.query(TimeEntry)
        .options(joinedload(TimeEntry.project))
        .filter(TimeEntry.id == row.id)
        .first()
    )
    assert row is not None
    return _entry_out(row)


@router.patch("/{entry_id}", response_model=TimeEntryOut)
def update_time_entry(
    entry_id: UUID,
    payload: TimeEntryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimeEntryOut:
    row = (
        db.query(TimeEntry)
        .options(joinedload(TimeEntry.project))
        .filter(TimeEntry.id == entry_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Time entry not found")
    if row.user_id != user.id and user.account_type != AccountType.platform_admin:
        raise HTTPException(status_code=403, detail="Not your time entry")
    if row.status == "submitted":
        raise HTTPException(status_code=400, detail="Submitted timesheet cannot be edited")

    data = payload.model_dump(exclude_unset=True)
    if "hours" in data and data["hours"] is not None:
        data["hours"] = max(0.0, float(data["hours"]))
    if "note" in data and data["note"] is not None:
        data["note"] = data["note"].strip()
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    row = (
        db.query(TimeEntry)
        .options(joinedload(TimeEntry.project))
        .filter(TimeEntry.id == entry_id)
        .first()
    )
    assert row is not None
    return _entry_out(row)


@router.post("/submit", response_model=TimesheetOut)
def submit_timesheet(
    payload: TimesheetSubmit,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimesheetOut:
    _ensure_org_member(db, user, organization_id)
    rows = _ensure_week_rows(db, user, organization_id, payload.week_start)
    if not rows:
        raise HTTPException(status_code=400, detail="No time entries to submit for this week")
    for row in rows:
        row.status = "submitted"
    db.commit()
    rows = _load_entries(db, organization_id, user.id, payload.week_start)
    return TimesheetOut(
        week_start=payload.week_start,
        status="submitted",
        entries=[_entry_out(row) for row in rows],
    )
