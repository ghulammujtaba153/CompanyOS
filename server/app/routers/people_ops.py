from __future__ import annotations

import re
import secrets
from datetime import date, timedelta
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import (
    AccountType,
    HiringCandidate,
    HiringJob,
    JobOfferRow,
    LeaveRequestRow,
    MembershipStatus,
    OffboardingPlanRow,
    OnboardingPlanRow,
    OrgMemberRole,
    Organization,
    OrganizationMember,
    PerformanceCycleRow,
    User,
)
from app.db.session import get_db

router = APIRouter(prefix="/people-ops", tags=["people-ops"])

JOB_STATUSES = {"Open", "On hold", "Closed"}
LEAVE_STATUSES = {"Pending", "Approved", "Declined", "Cancelled"}
OFFER_STATUSES = {"Draft", "Sent", "Viewed", "Signed", "Declined", "Expired"}
OFFBOARDING_REASONS = {"Resignation", "End of contract", "Restructuring", "Other"}
OFFBOARDING_STATUSES = {"In progress", "Completed"}
PERFORMANCE_STATUSES = {"Active", "Completed"}
GOAL_STATUSES = {"On track", "At risk", "Done", "Not started"}


def _ensure_org_member(db: Session, user: User, org_id: UUID) -> OrganizationMember | None:
    if user.account_type == AccountType.platform_admin:
        return None
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
    return membership


def _is_leave_admin(membership: OrganizationMember | None) -> bool:
    """Owners, admins, and platform admins can see/manage all leave."""
    if membership is None:
        return True
    return membership.role in (OrgMemberRole.owner, OrgMemberRole.admin)


def _today() -> str:
    return date.today().isoformat()


def _slugify(title: str) -> str:
    safe = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    return (safe[:40] or f"job-{uuid4().hex[:8]}")


def _default_hiring(title: str, slug: str | None = None) -> dict[str, Any]:
    return {
        "applyForm": {
            "slug": slug or _slugify(title),
            "expiresAt": (date.today() + timedelta(days=14)).isoformat(),
            "welcomeMessage": (
                f"Apply for {title}. Share your background and we will review "
                "applications after the form closes."
            ),
            "published": True,
        },
        "captureDelaySeconds": 5,
        "interviewLinkHours": 48,
        "questions": [],
        "passScore": 70,
    }


def _normalize_hiring(title: str, hiring: dict[str, Any] | None) -> dict[str, Any]:
    defaults = _default_hiring(title)
    raw = hiring if isinstance(hiring, dict) else {}
    apply = raw.get("applyForm") if isinstance(raw.get("applyForm"), dict) else {}
    questions = raw.get("questions")
    return {
        "applyForm": {
            "slug": str(apply.get("slug") or "").strip() or defaults["applyForm"]["slug"],
            "expiresAt": str(apply.get("expiresAt") or defaults["applyForm"]["expiresAt"]),
            "welcomeMessage": str(
                apply.get("welcomeMessage") or defaults["applyForm"]["welcomeMessage"]
            ),
            "published": (
                bool(apply["published"])
                if isinstance(apply.get("published"), bool)
                else defaults["applyForm"]["published"]
            ),
        },
        "captureDelaySeconds": (
            int(raw["captureDelaySeconds"])
            if isinstance(raw.get("captureDelaySeconds"), (int, float))
            else defaults["captureDelaySeconds"]
        ),
        "interviewLinkHours": (
            int(raw["interviewLinkHours"])
            if isinstance(raw.get("interviewLinkHours"), (int, float))
            else defaults["interviewLinkHours"]
        ),
        "questions": questions if isinstance(questions, list) else defaults["questions"],
        "passScore": (
            int(raw["passScore"])
            if isinstance(raw.get("passScore"), (int, float))
            else defaults["passScore"]
        ),
    }


def _ensure_job_hiring(row: HiringJob, db: Session | None = None) -> dict[str, Any]:
    """Return a complete hiring config; persist applyForm when missing."""
    current = row.hiring_dict()
    normalized = _normalize_hiring(row.title, current)
    apply = current.get("applyForm") if isinstance(current.get("applyForm"), dict) else {}
    if db is not None and not str(apply.get("slug") or "").strip():
        row.set_hiring_dict(normalized)
        db.add(row)
        db.commit()
        db.refresh(row)
    return normalized


def _find_job_by_apply_slug(db: Session, slug: str) -> HiringJob | None:
    needle = slug.strip().lower()
    if not needle:
        return None
    # Prefer rows that already embed the slug in hiring_json.
    rows = (
        db.query(HiringJob)
        .filter(HiringJob.hiring_json.ilike(f'%"{needle}"%'))
        .order_by(HiringJob.created_at.desc())
        .all()
    )
    scanned = rows or db.query(HiringJob).order_by(HiringJob.created_at.desc()).limit(200).all()
    for row in scanned:
        hiring = _normalize_hiring(row.title, row.hiring_dict())
        if str(hiring.get("applyForm", {}).get("slug") or "").lower() != needle:
            continue
        # Persist applyForm when the match came from title-derived defaults.
        current = row.hiring_dict()
        apply = current.get("applyForm") if isinstance(current.get("applyForm"), dict) else {}
        if not str(apply.get("slug") or "").strip():
            row.set_hiring_dict(hiring)
            db.add(row)
            db.commit()
            db.refresh(row)
        return row
    return None


# --- Schemas (local to keep org.py smaller) -----------------------------------


class HiringJobOut(BaseModel):
    id: str
    organization_id: str
    title: str
    departmentId: str
    hiringManagerId: str
    openings: int
    status: str
    createdAt: str
    description: str = ""
    location: str = ""
    employmentType: str = "Full-time"
    hiring: dict[str, Any] = Field(default_factory=dict)


class HiringJobUpsert(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=255)
    departmentId: str = ""
    hiringManagerId: str = ""
    openings: int = 1
    status: str = "Open"
    description: str = ""
    location: str = ""
    employmentType: str = "Full-time"
    hiring: dict[str, Any] = Field(default_factory=dict)


class HiringCandidateOut(BaseModel):
    id: str
    organization_id: str
    jobId: str
    name: str
    email: str
    source: str
    stage: str
    rating: int = 0
    notes: str = ""
    appliedAt: str = ""
    employeeId: str = ""
    phone: str = ""
    resumeNote: str = ""
    resumeFile: dict[str, Any] | None = None
    applicationAnswers: list[dict[str, Any]] = Field(default_factory=list)
    aiScreen: dict[str, Any] | None = None
    interviewToken: str = ""
    interviewExpiresAt: str = ""
    interviewInviteSentAt: str = ""
    aiInterview: dict[str, Any] | None = None
    technicalInvite: dict[str, Any] | None = None


class HiringCandidateUpsert(BaseModel):
    id: str | None = None
    jobId: str
    name: str = Field(min_length=1, max_length=200)
    email: str = ""
    source: str = "Apply form"
    stage: str = "Applied"
    rating: int = 0
    notes: str = ""
    appliedAt: str = ""
    employeeId: str = ""
    phone: str = ""
    resumeNote: str = ""
    resumeFile: dict[str, Any] | None = None
    applicationAnswers: list[dict[str, Any]] = Field(default_factory=list)
    aiScreen: dict[str, Any] | None = None
    interviewToken: str = ""
    interviewExpiresAt: str = ""
    interviewInviteSentAt: str = ""
    aiInterview: dict[str, Any] | None = None
    technicalInvite: dict[str, Any] | None = None


class LeaveOut(BaseModel):
    id: str
    organization_id: str
    employeeId: str
    type: str
    start: str
    end: str
    reason: str
    status: str
    approverId: str
    decisionNote: str = ""
    createdAt: str


class LeaveCreate(BaseModel):
    employeeId: str
    type: str
    start: str
    end: str
    reason: str = ""
    approverId: str = ""


class LeaveDecide(BaseModel):
    status: str
    decisionNote: str = ""


class OnboardingOut(BaseModel):
    id: str
    organization_id: str
    employeeId: str
    startDate: str
    buddyId: str
    tasks: list[dict[str, Any]] = Field(default_factory=list)


class OnboardingCreate(BaseModel):
    employeeId: str
    startDate: str
    buddyId: str = ""
    tasks: list[dict[str, Any]] = Field(default_factory=list)


class OnboardingUpdate(BaseModel):
    startDate: str | None = None
    buddyId: str | None = None
    tasks: list[dict[str, Any]] | None = None


class OffboardingOut(BaseModel):
    id: str
    organization_id: str
    employeeId: str
    employeeName: str
    title: str
    department: str
    lastDay: str
    reason: str
    status: str
    tasks: list[dict[str, Any]] = Field(default_factory=list)


class OffboardingCreate(BaseModel):
    employeeId: str
    employeeName: str
    title: str = ""
    department: str = ""
    lastDay: str
    reason: str = "Resignation"
    tasks: list[dict[str, Any]] = Field(default_factory=list)


class OffboardingUpdate(BaseModel):
    lastDay: str | None = None
    reason: str | None = None
    status: str | None = None
    tasks: list[dict[str, Any]] | None = None


class PerformanceOut(BaseModel):
    id: str
    organization_id: str
    employeeId: str
    employeeName: str
    title: str
    managerName: str
    period: str
    status: str
    goals: list[dict[str, Any]] = Field(default_factory=list)
    oneOnOnes: list[dict[str, Any]] = Field(default_factory=list)


class PerformanceCreate(BaseModel):
    employeeId: str
    employeeName: str
    title: str = ""
    managerName: str = ""
    period: str
    goals: list[dict[str, Any]] = Field(default_factory=list)
    oneOnOnes: list[dict[str, Any]] = Field(default_factory=list)


class PerformanceUpdate(BaseModel):
    title: str | None = None
    managerName: str | None = None
    period: str | None = None
    status: str | None = None
    goals: list[dict[str, Any]] | None = None
    oneOnOnes: list[dict[str, Any]] | None = None


class OfferOut(BaseModel):
    id: str
    organization_id: str
    candidateId: str
    candidateName: str
    candidateEmail: str
    jobId: str
    jobTitle: str
    salary: float
    currency: str
    equityNote: str
    startDate: str
    expiresOn: str
    status: str
    signToken: str
    signedAt: str = ""
    signedName: str = ""
    createdAt: str


class OfferCreate(BaseModel):
    candidateId: str = ""
    candidateName: str
    candidateEmail: str = ""
    jobId: str = ""
    jobTitle: str
    salary: float = 0
    currency: str = "USD"
    equityNote: str = ""
    startDate: str = ""
    expiresOn: str = ""
    status: str = "Draft"


class OfferUpdate(BaseModel):
    salary: float | None = None
    currency: str | None = None
    equityNote: str | None = None
    startDate: str | None = None
    expiresOn: str | None = None
    status: str | None = None
    signedAt: str | None = None
    signedName: str | None = None


def _job_out(row: HiringJob, hiring: dict[str, Any] | None = None) -> HiringJobOut:
    created = row.created_at.date().isoformat() if row.created_at else _today()
    return HiringJobOut(
        id=str(row.id),
        organization_id=str(row.organization_id),
        title=row.title,
        departmentId=row.department_id or "",
        hiringManagerId=row.hiring_manager_id or "",
        openings=int(row.openings or 1),
        status=row.status,
        createdAt=created,
        description=row.description or "",
        location=row.location or "",
        employmentType=row.employment_type or "Full-time",
        hiring=hiring if hiring is not None else _normalize_hiring(row.title, row.hiring_dict()),
    )


def _candidate_out(row: HiringCandidate) -> HiringCandidateOut:
    payload = row.payload_dict()
    return HiringCandidateOut(
        id=str(row.id),
        organization_id=str(row.organization_id),
        jobId=str(row.job_id),
        name=row.name,
        email=row.email or "",
        source=row.source or "Apply form",
        stage=row.stage or "Applied",
        rating=int(row.rating or 0),
        notes=row.notes or "",
        appliedAt=row.applied_at or "",
        employeeId=row.employee_id or "",
        phone=row.phone or "",
        resumeNote=row.resume_note or "",
        resumeFile=payload.get("resumeFile"),
        applicationAnswers=list(payload.get("applicationAnswers") or []),
        aiScreen=payload.get("aiScreen"),
        interviewToken=row.interview_token or payload.get("interviewToken") or "",
        interviewExpiresAt=str(payload.get("interviewExpiresAt") or ""),
        interviewInviteSentAt=str(payload.get("interviewInviteSentAt") or ""),
        aiInterview=payload.get("aiInterview"),
        technicalInvite=payload.get("technicalInvite"),
    )


def _leave_out(row: LeaveRequestRow) -> LeaveOut:
    return LeaveOut(
        id=str(row.id),
        organization_id=str(row.organization_id),
        employeeId=row.employee_id,
        type=row.type,
        start=row.start,
        end=row.end,
        reason=row.reason or "",
        status=row.status,
        approverId=row.approver_id or "",
        decisionNote=row.decision_note or "",
        createdAt=row.created_at or _today(),
    )


def _onboarding_out(row: OnboardingPlanRow) -> OnboardingOut:
    return OnboardingOut(
        id=str(row.id),
        organization_id=str(row.organization_id),
        employeeId=row.employee_id,
        startDate=row.start_date,
        buddyId=row.buddy_id or "",
        tasks=row.tasks_list(),
    )


def _offboarding_out(row: OffboardingPlanRow) -> OffboardingOut:
    return OffboardingOut(
        id=str(row.id),
        organization_id=str(row.organization_id),
        employeeId=row.employee_id,
        employeeName=row.employee_name,
        title=row.title or "",
        department=row.department or "",
        lastDay=row.last_day,
        reason=row.reason,
        status=row.status,
        tasks=row.tasks_list(),
    )


def _default_offboarding_tasks(last_day: str) -> list[dict[str, Any]]:
    base = str(uuid4())[:8]

    def shift(days: int) -> str:
        from datetime import datetime, timedelta

        try:
            d = datetime.strptime(last_day, "%Y-%m-%d").date()
        except ValueError:
            d = date.today()
        return (d + timedelta(days=days)).isoformat()

    return [
        {"id": f"{base}-1", "title": "Collect laptop and access badge", "owner": "IT", "dueDate": shift(-1), "done": False},
        {"id": f"{base}-2", "title": "Revoke SSO and SaaS access", "owner": "IT", "dueDate": last_day, "done": False},
        {"id": f"{base}-3", "title": "Exit interview", "owner": "People Ops", "dueDate": shift(-3), "done": False},
        {"id": f"{base}-4", "title": "Knowledge transfer doc", "owner": "Manager", "dueDate": shift(-6), "done": False},
        {"id": f"{base}-5", "title": "Final payroll & expenses", "owner": "Finance", "dueDate": shift(5), "done": False},
        {"id": f"{base}-6", "title": "Return signed equipment checklist", "owner": "Employee", "dueDate": last_day, "done": False},
    ]


def _performance_out(row: PerformanceCycleRow) -> PerformanceOut:
    return PerformanceOut(
        id=str(row.id),
        organization_id=str(row.organization_id),
        employeeId=row.employee_id,
        employeeName=row.employee_name,
        title=row.title or "",
        managerName=row.manager_name or "",
        period=row.period or "",
        status=row.status,
        goals=row.goals_list(),
        oneOnOnes=row.one_on_ones_list(),
    )


def _default_performance_goals() -> list[dict[str, Any]]:
    base = str(uuid4())[:8]
    return [
        {"id": f"{base}-g1", "title": "Deliver primary team OKR", "progress": 0, "status": "Not started"},
        {"id": f"{base}-g2", "title": "Grow capability / mentorship", "progress": 0, "status": "Not started"},
        {"id": f"{base}-g3", "title": "Improve reliability or quality metric", "progress": 0, "status": "Not started"},
    ]


def _offer_out(row: JobOfferRow) -> OfferOut:
    return OfferOut(
        id=str(row.id),
        organization_id=str(row.organization_id),
        candidateId=row.candidate_id or "",
        candidateName=row.candidate_name,
        candidateEmail=row.candidate_email or "",
        jobId=row.job_id or "",
        jobTitle=row.job_title,
        salary=float(row.salary or 0),
        currency=row.currency or "USD",
        equityNote=row.equity_note or "",
        startDate=row.start_date or "",
        expiresOn=row.expires_on or "",
        status=row.status,
        signToken=row.sign_token,
        signedAt=row.signed_at or "",
        signedName=row.signed_name or "",
        createdAt=row.created_at or _today(),
    )


# --- Hiring jobs --------------------------------------------------------------


@router.get("/jobs", response_model=list[HiringJobOut])
def list_jobs(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[HiringJobOut]:
    _ensure_org_member(db, user, organization_id)
    rows = (
        db.query(HiringJob)
        .filter(HiringJob.organization_id == organization_id)
        .order_by(HiringJob.created_at.desc())
        .all()
    )
    return [_job_out(row, _ensure_job_hiring(row, db)) for row in rows]


@router.post("/jobs", response_model=HiringJobOut, status_code=201)
def upsert_job(
    payload: HiringJobUpsert,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HiringJobOut:
    _ensure_org_member(db, user, organization_id)
    if payload.status not in JOB_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid job status")
    row: HiringJob | None = None
    if payload.id:
        try:
            row = db.get(HiringJob, UUID(payload.id))
        except ValueError:
            row = None
        if row and row.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Job not found")
    if not row:
        row = HiringJob(organization_id=organization_id)
        db.add(row)
    row.title = payload.title.strip()
    row.department_id = payload.departmentId
    row.hiring_manager_id = payload.hiringManagerId
    row.openings = max(1, int(payload.openings or 1))
    row.status = payload.status
    row.description = payload.description
    row.location = payload.location
    row.employment_type = payload.employmentType
    hiring = _normalize_hiring(row.title, payload.hiring or {})
    # Keep a stable slug when editing an existing job without changing it.
    apply_in = (payload.hiring or {}).get("applyForm")
    incoming_slug = (
        str(apply_in.get("slug") or "").strip() if isinstance(apply_in, dict) else ""
    )
    if payload.id and not incoming_slug:
        existing = _normalize_hiring(row.title, row.hiring_dict())
        hiring["applyForm"]["slug"] = existing["applyForm"]["slug"]
    row.set_hiring_dict(hiring)
    db.commit()
    db.refresh(row)
    return _job_out(row, hiring)


@router.delete("/jobs/{job_id}", status_code=204)
def delete_job(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(HiringJob, job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    _ensure_org_member(db, user, row.organization_id)
    db.delete(row)
    db.commit()


# --- Candidates ---------------------------------------------------------------


@router.get("/candidates", response_model=list[HiringCandidateOut])
def list_candidates(
    organization_id: UUID = Query(...),
    job_id: UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[HiringCandidateOut]:
    _ensure_org_member(db, user, organization_id)
    query = db.query(HiringCandidate).filter(HiringCandidate.organization_id == organization_id)
    if job_id:
        query = query.filter(HiringCandidate.job_id == job_id)
    rows = query.order_by(HiringCandidate.created_at.desc()).all()
    return [_candidate_out(row) for row in rows]


@router.post("/candidates", response_model=HiringCandidateOut, status_code=201)
def upsert_candidate(
    payload: HiringCandidateUpsert,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HiringCandidateOut:
    _ensure_org_member(db, user, organization_id)
    try:
        job_uuid = UUID(payload.jobId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid job id") from exc
    job = db.get(HiringJob, job_uuid)
    if not job or job.organization_id != organization_id:
        raise HTTPException(status_code=400, detail="Job not found in this organization")

    row: HiringCandidate | None = None
    if payload.id:
        try:
            row = db.get(HiringCandidate, UUID(payload.id))
        except ValueError:
            row = None
        if row and row.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Candidate not found")
    if not row:
        row = HiringCandidate(organization_id=organization_id, job_id=job_uuid)
        db.add(row)

    row.job_id = job_uuid
    row.name = payload.name.strip()
    row.email = payload.email.strip().lower()
    row.source = payload.source
    row.stage = payload.stage
    row.rating = max(0, min(5, int(payload.rating or 0)))
    row.notes = payload.notes
    row.applied_at = payload.appliedAt or _today()
    row.employee_id = payload.employeeId or ""
    row.phone = payload.phone or ""
    row.resume_note = payload.resumeNote or ""
    row.interview_token = payload.interviewToken or row.interview_token or ""
    row.set_payload_dict(
        {
            "resumeFile": payload.resumeFile,
            "applicationAnswers": payload.applicationAnswers or [],
            "aiScreen": payload.aiScreen,
            "interviewToken": row.interview_token,
            "interviewExpiresAt": payload.interviewExpiresAt or "",
            "interviewInviteSentAt": payload.interviewInviteSentAt or "",
            "aiInterview": payload.aiInterview,
            "technicalInvite": payload.technicalInvite,
        }
    )
    db.commit()
    db.refresh(row)
    return _candidate_out(row)


@router.delete("/candidates/{candidate_id}", status_code=204)
def delete_candidate(
    candidate_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(HiringCandidate, candidate_id)
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _ensure_org_member(db, user, row.organization_id)
    db.delete(row)
    db.commit()


# --- Leave --------------------------------------------------------------------


@router.get("/leave", response_model=list[LeaveOut])
def list_leave(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LeaveOut]:
    membership = _ensure_org_member(db, user, organization_id)
    query = db.query(LeaveRequestRow).filter(LeaveRequestRow.organization_id == organization_id)
    # Employees only see their own requests plus items waiting on them.
    if not _is_leave_admin(membership) and membership is not None:
        member_id = str(membership.id)
        query = query.filter(
            (LeaveRequestRow.employee_id == member_id) | (LeaveRequestRow.approver_id == member_id)
        )
    rows = query.order_by(LeaveRequestRow.created_at.desc()).all()
    return [_leave_out(row) for row in rows]


@router.post("/leave", response_model=LeaveOut, status_code=201)
def create_leave(
    payload: LeaveCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeaveOut:
    membership = _ensure_org_member(db, user, organization_id)
    if payload.end < payload.start:
        raise HTTPException(status_code=400, detail="End date is before the start date")
    # Members always request for themselves; owners/admins may submit on behalf of others.
    employee_id = payload.employeeId
    if membership is not None and not _is_leave_admin(membership):
        employee_id = str(membership.id)
    elif membership is not None and not employee_id:
        employee_id = str(membership.id)
    row = LeaveRequestRow(
        organization_id=organization_id,
        employee_id=employee_id,
        type=payload.type,
        start=payload.start,
        end=payload.end,
        reason=payload.reason.strip(),
        status="Pending",
        approver_id=payload.approverId,
        created_at=_today(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    try:
        from app.services import notifications as notif

        if payload.approverId:
            notif.notify_member_ids(
                db,
                organization_id=organization_id,
                member_ids=[payload.approverId],
                kind="leave",
                title="Leave request needs your approval",
                body=f"{payload.type} leave · {payload.start} → {payload.end}",
                href="/dashboard/people-operations/leave",
                actor_user_id=user.id,
                entity_type="leave",
                entity_id=str(row.id),
                exclude_user_id=user.id,
            )
        else:
            notif.notify_kind_roles(
                db,
                organization_id=organization_id,
                kind="leave",
                title="New leave request",
                body=f"{payload.type} leave · {payload.start} → {payload.end}",
                href="/dashboard/people-operations/leave",
                actor_user_id=user.id,
                entity_type="leave",
                entity_id=str(row.id),
                exclude_user_id=user.id,
            )
    except Exception:
        pass
    return _leave_out(row)


@router.patch("/leave/{leave_id}", response_model=LeaveOut)
def update_leave(
    leave_id: UUID,
    payload: LeaveDecide,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeaveOut:
    row = db.get(LeaveRequestRow, leave_id)
    if not row:
        raise HTTPException(status_code=404, detail="Leave request not found")
    membership = _ensure_org_member(db, user, row.organization_id)
    if payload.status not in LEAVE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid leave status")
    is_admin = _is_leave_admin(membership)
    member_id = str(membership.id) if membership is not None else ""
    is_owner_of_request = bool(member_id) and row.employee_id == member_id
    is_approver = bool(member_id) and row.approver_id == member_id

    if payload.status == "Cancelled":
        if not is_admin and not is_owner_of_request:
            raise HTTPException(status_code=403, detail="Only the requester can cancel this leave")
        if row.status not in ("Pending", "Approved"):
            raise HTTPException(status_code=400, detail="Only pending or approved leave can be cancelled")
        if row.status == "Approved" and row.start <= _today() and not is_admin:
            raise HTTPException(status_code=400, detail="Leave that has started can't be cancelled")
    elif payload.status in ("Approved", "Declined"):
        if is_owner_of_request:
            raise HTTPException(status_code=400, detail="You can't decide your own request")
        if not is_admin and not is_approver:
            raise HTTPException(status_code=403, detail="You're not the approver for this request")
        if row.status != "Pending":
            raise HTTPException(status_code=400, detail="This request was already decided")
        if payload.status == "Declined" and not payload.decisionNote.strip():
            raise HTTPException(status_code=400, detail="Add a reason when declining")
    elif not is_admin:
        raise HTTPException(status_code=403, detail="Not allowed to update this leave request")

    row.status = payload.status
    row.decision_note = payload.decisionNote.strip()
    db.commit()
    db.refresh(row)
    if payload.status in ("Approved", "Declined", "Cancelled"):
        try:
            from app.services import notifications as notif

            notif.notify_member_ids(
                db,
                organization_id=row.organization_id,
                member_ids=[row.employee_id],
                kind="leave",
                title=f"Leave {payload.status.lower()}",
                body=payload.decisionNote.strip()
                or f"Your {row.type} leave ({row.start} → {row.end}) was {payload.status.lower()}.",
                href="/dashboard/people-operations/leave",
                actor_user_id=user.id,
                entity_type="leave",
                entity_id=str(row.id),
                exclude_user_id=user.id,
            )
        except Exception:
            pass
    return _leave_out(row)


# --- Onboarding ---------------------------------------------------------------


@router.get("/onboarding", response_model=list[OnboardingOut])
def list_onboarding(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OnboardingOut]:
    _ensure_org_member(db, user, organization_id)
    rows = (
        db.query(OnboardingPlanRow)
        .filter(OnboardingPlanRow.organization_id == organization_id)
        .order_by(OnboardingPlanRow.created_at.desc())
        .all()
    )
    return [_onboarding_out(row) for row in rows]


@router.post("/onboarding", response_model=OnboardingOut, status_code=201)
def create_onboarding(
    payload: OnboardingCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OnboardingOut:
    _ensure_org_member(db, user, organization_id)
    exists = (
        db.query(OnboardingPlanRow)
        .filter(
            OnboardingPlanRow.organization_id == organization_id,
            OnboardingPlanRow.employee_id == payload.employeeId,
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="This person already has an onboarding plan")
    row = OnboardingPlanRow(
        organization_id=organization_id,
        employee_id=payload.employeeId,
        start_date=payload.startDate,
        buddy_id=payload.buddyId,
    )
    tasks = payload.tasks
    if not tasks:
        base = str(uuid4())[:8]
        tasks = [
            {"id": f"{base}-{i}", "title": t, "owner": o, "dueOffset": d, "done": False}
            for i, (t, o, d) in enumerate(
                [
                    ("Send offer letter & contract for signature", "People Ops", -10),
                    ("Collect tax and bank details", "People Ops", -5),
                    ("Order laptop and accessories", "IT", -7),
                    ("Create accounts (email, SSO, CompanyOS)", "IT", -2),
                    ("Prepare 30/60/90-day plan", "Manager", -1),
                    ("Day-one welcome and team intro", "Manager", 0),
                    ("Complete security & policy training", "New hire", 3),
                    ("First 1:1 with manager", "Manager", 5),
                    ("30-day check-in", "People Ops", 30),
                ]
            )
        ]
    row.set_tasks_list(tasks)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _onboarding_out(row)


@router.patch("/onboarding/{plan_id}", response_model=OnboardingOut)
def update_onboarding(
    plan_id: UUID,
    payload: OnboardingUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OnboardingOut:
    row = db.get(OnboardingPlanRow, plan_id)
    if not row:
        raise HTTPException(status_code=404, detail="Onboarding plan not found")
    _ensure_org_member(db, user, row.organization_id)
    if payload.startDate is not None:
        row.start_date = payload.startDate
    if payload.buddyId is not None:
        row.buddy_id = payload.buddyId
    if payload.tasks is not None:
        row.set_tasks_list(payload.tasks)
    db.commit()
    db.refresh(row)
    return _onboarding_out(row)


# --- Offboarding --------------------------------------------------------------


@router.get("/offboarding", response_model=list[OffboardingOut])
def list_offboarding(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OffboardingOut]:
    _ensure_org_member(db, user, organization_id)
    rows = (
        db.query(OffboardingPlanRow)
        .filter(OffboardingPlanRow.organization_id == organization_id)
        .order_by(OffboardingPlanRow.created_at.desc())
        .all()
    )
    return [_offboarding_out(row) for row in rows]


@router.post("/offboarding", response_model=OffboardingOut, status_code=201)
def create_offboarding(
    payload: OffboardingCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OffboardingOut:
    _ensure_org_member(db, user, organization_id)
    if payload.reason not in OFFBOARDING_REASONS:
        raise HTTPException(status_code=400, detail="Invalid offboarding reason")
    exists = (
        db.query(OffboardingPlanRow)
        .filter(
            OffboardingPlanRow.organization_id == organization_id,
            OffboardingPlanRow.employee_id == payload.employeeId,
            OffboardingPlanRow.status == "In progress",
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="An active offboarding plan already exists for this person")
    row = OffboardingPlanRow(
        organization_id=organization_id,
        employee_id=payload.employeeId,
        employee_name=payload.employeeName.strip(),
        title=payload.title.strip(),
        department=payload.department.strip(),
        last_day=payload.lastDay,
        reason=payload.reason,
        status="In progress",
    )
    tasks = payload.tasks or _default_offboarding_tasks(payload.lastDay)
    row.set_tasks_list(tasks)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _offboarding_out(row)


@router.patch("/offboarding/{plan_id}", response_model=OffboardingOut)
def update_offboarding(
    plan_id: UUID,
    payload: OffboardingUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OffboardingOut:
    row = db.get(OffboardingPlanRow, plan_id)
    if not row:
        raise HTTPException(status_code=404, detail="Offboarding plan not found")
    _ensure_org_member(db, user, row.organization_id)
    if payload.lastDay is not None:
        row.last_day = payload.lastDay
    if payload.reason is not None:
        if payload.reason not in OFFBOARDING_REASONS:
            raise HTTPException(status_code=400, detail="Invalid offboarding reason")
        row.reason = payload.reason
    if payload.status is not None:
        if payload.status not in OFFBOARDING_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid offboarding status")
        row.status = payload.status
    if payload.tasks is not None:
        row.set_tasks_list(payload.tasks)
        done = all(bool(t.get("done")) for t in payload.tasks) if payload.tasks else False
        row.status = "Completed" if done else "In progress"
    db.commit()
    db.refresh(row)
    return _offboarding_out(row)


# --- Performance --------------------------------------------------------------


@router.get("/performance", response_model=list[PerformanceOut])
def list_performance(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PerformanceOut]:
    _ensure_org_member(db, user, organization_id)
    rows = (
        db.query(PerformanceCycleRow)
        .filter(PerformanceCycleRow.organization_id == organization_id)
        .order_by(PerformanceCycleRow.created_at.desc())
        .all()
    )
    return [_performance_out(row) for row in rows]


@router.post("/performance", response_model=PerformanceOut, status_code=201)
def create_performance(
    payload: PerformanceCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PerformanceOut:
    _ensure_org_member(db, user, organization_id)
    period = payload.period.strip()
    if not period:
        raise HTTPException(status_code=400, detail="Period is required")
    exists = (
        db.query(PerformanceCycleRow)
        .filter(
            PerformanceCycleRow.organization_id == organization_id,
            PerformanceCycleRow.employee_id == payload.employeeId,
            PerformanceCycleRow.period == period,
            PerformanceCycleRow.status == "Active",
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="An active cycle already exists for this person and period")
    row = PerformanceCycleRow(
        organization_id=organization_id,
        employee_id=payload.employeeId,
        employee_name=payload.employeeName.strip(),
        title=payload.title.strip(),
        manager_name=payload.managerName.strip(),
        period=period,
        status="Active",
    )
    row.set_goals_list(payload.goals or _default_performance_goals())
    row.set_one_on_ones_list(payload.oneOnOnes or [])
    db.add(row)
    db.commit()
    db.refresh(row)
    return _performance_out(row)


@router.patch("/performance/{cycle_id}", response_model=PerformanceOut)
def update_performance(
    cycle_id: UUID,
    payload: PerformanceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PerformanceOut:
    row = db.get(PerformanceCycleRow, cycle_id)
    if not row:
        raise HTTPException(status_code=404, detail="Performance cycle not found")
    _ensure_org_member(db, user, row.organization_id)
    if payload.title is not None:
        row.title = payload.title.strip()
    if payload.managerName is not None:
        row.manager_name = payload.managerName.strip()
    if payload.period is not None:
        row.period = payload.period.strip()
    if payload.status is not None:
        if payload.status not in PERFORMANCE_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid performance status")
        row.status = payload.status
    if payload.goals is not None:
        for goal in payload.goals:
            status = goal.get("status")
            if status is not None and status not in GOAL_STATUSES:
                raise HTTPException(status_code=400, detail="Invalid goal status")
            progress = goal.get("progress")
            if progress is not None:
                try:
                    progress_n = int(progress)
                except (TypeError, ValueError) as exc:
                    raise HTTPException(status_code=400, detail="Invalid goal progress") from exc
                if progress_n < 0 or progress_n > 100:
                    raise HTTPException(status_code=400, detail="Goal progress must be 0–100")
                goal["progress"] = progress_n
        row.set_goals_list(payload.goals)
        if payload.goals and all(g.get("status") == "Done" or int(g.get("progress") or 0) >= 100 for g in payload.goals):
            row.status = "Completed"
    if payload.oneOnOnes is not None:
        row.set_one_on_ones_list(payload.oneOnOnes)
    db.commit()
    db.refresh(row)
    return _performance_out(row)


# --- Offers -------------------------------------------------------------------


@router.get("/offers", response_model=list[OfferOut])
def list_offers(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OfferOut]:
    _ensure_org_member(db, user, organization_id)
    rows = (
        db.query(JobOfferRow)
        .filter(JobOfferRow.organization_id == organization_id)
        .order_by(JobOfferRow.created_at.desc())
        .all()
    )
    return [_offer_out(row) for row in rows]


@router.post("/offers", response_model=OfferOut, status_code=201)
def create_offer(
    payload: OfferCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OfferOut:
    _ensure_org_member(db, user, organization_id)
    if payload.status not in OFFER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid offer status")
    row = JobOfferRow(
        organization_id=organization_id,
        candidate_id=payload.candidateId,
        candidate_name=payload.candidateName.strip(),
        candidate_email=payload.candidateEmail.strip().lower(),
        job_id=payload.jobId,
        job_title=payload.jobTitle.strip(),
        salary=float(payload.salary or 0),
        currency=payload.currency or "USD",
        equity_note=payload.equityNote,
        start_date=payload.startDate,
        expires_on=payload.expiresOn,
        status=payload.status,
        sign_token=secrets.token_urlsafe(12),
        created_at=_today(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _offer_out(row)


@router.patch("/offers/{offer_id}", response_model=OfferOut)
def update_offer(
    offer_id: UUID,
    payload: OfferUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OfferOut:
    row = db.get(JobOfferRow, offer_id)
    if not row:
        raise HTTPException(status_code=404, detail="Offer not found")
    _ensure_org_member(db, user, row.organization_id)
    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in OFFER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid offer status")
    mapping = {
        "salary": "salary",
        "currency": "currency",
        "equityNote": "equity_note",
        "startDate": "start_date",
        "expiresOn": "expires_on",
        "status": "status",
        "signedAt": "signed_at",
        "signedName": "signed_name",
    }
    for key, attr in mapping.items():
        if key in data and data[key] is not None:
            setattr(row, attr, data[key])
    db.commit()
    db.refresh(row)
    return _offer_out(row)


# --- Public apply form (slug) -------------------------------------------------


class PublicApplyOrgOut(BaseModel):
    name: str
    tagline: str = ""
    about: str = ""
    logoUrl: str = ""


class PublicApplyFormOut(BaseModel):
    slug: str
    expiresAt: str
    welcomeMessage: str
    published: bool


class PublicApplyJobOut(BaseModel):
    id: str
    title: str
    description: str = ""
    location: str = ""
    employmentType: str = "Full-time"
    status: str
    applyForm: PublicApplyFormOut
    organization: PublicApplyOrgOut


class PublicApplySubmit(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    phone: str = ""
    resumeNote: str = ""
    resumeFile: dict[str, Any] | None = None
    answers: list[dict[str, Any]] = Field(default_factory=list)


class PublicApplyResult(BaseModel):
    ok: bool = True
    id: str
    message: str


def _public_job_out(row: HiringJob, org: Organization, hiring: dict[str, Any]) -> PublicApplyJobOut:
    apply = hiring["applyForm"]
    return PublicApplyJobOut(
        id=str(row.id),
        title=row.title,
        description=row.description or "",
        location=row.location or "",
        employmentType=row.employment_type or "Full-time",
        status=row.status,
        applyForm=PublicApplyFormOut(
            slug=str(apply.get("slug") or ""),
            expiresAt=str(apply.get("expiresAt") or ""),
            welcomeMessage=str(apply.get("welcomeMessage") or ""),
            published=bool(apply.get("published", True)),
        ),
        organization=PublicApplyOrgOut(
            name=org.name,
            tagline=org.tagline or "",
            about=org.about or "",
            logoUrl=org.logo_url or "",
        ),
    )


@router.get("/public/jobs/{slug}", response_model=PublicApplyJobOut)
def public_get_job_by_slug(slug: str, db: Session = Depends(get_db)) -> PublicApplyJobOut:
    row = _find_job_by_apply_slug(db, slug)
    if not row:
        raise HTTPException(status_code=404, detail="Role not found")
    org = db.get(Organization, row.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Role not found")
    hiring = _ensure_job_hiring(row, db)
    return _public_job_out(row, org, hiring)


@router.post("/public/jobs/{slug}/apply", response_model=PublicApplyResult, status_code=201)
def public_apply_to_job(
    slug: str,
    payload: PublicApplySubmit,
    db: Session = Depends(get_db),
) -> PublicApplyResult:
    row = _find_job_by_apply_slug(db, slug)
    if not row:
        raise HTTPException(status_code=404, detail="Role not found")
    hiring = _ensure_job_hiring(row, db)
    apply = hiring["applyForm"]
    if row.status == "Closed":
        raise HTTPException(status_code=400, detail="This role is no longer accepting applications.")
    if not apply.get("published", True):
        raise HTTPException(status_code=400, detail="This apply form is not published yet.")
    expires = str(apply.get("expiresAt") or "")
    if expires and expires < _today():
        raise HTTPException(status_code=400, detail="The application form has expired.")

    name = payload.name.strip()
    email = payload.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email.")
    if not payload.resumeFile or not isinstance(payload.resumeFile, dict):
        raise HTTPException(status_code=400, detail="Attach your CV / resume to continue.")

    existing = (
        db.query(HiringCandidate)
        .filter(
            HiringCandidate.job_id == row.id,
            HiringCandidate.email == email,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already applied to this role with that email.")

    candidate = HiringCandidate(
        organization_id=row.organization_id,
        job_id=row.id,
        name=name,
        email=email,
        source="Apply form",
        stage="Applied",
        rating=0,
        notes="",
        applied_at=_today(),
        phone=(payload.phone or "").strip(),
        resume_note=(payload.resumeNote or "").strip(),
    )
    candidate.set_payload_dict(
        {
            "resumeFile": payload.resumeFile,
            "applicationAnswers": payload.answers or [],
            "aiScreen": None,
            "interviewToken": "",
            "interviewExpiresAt": "",
            "interviewInviteSentAt": "",
            "aiInterview": None,
            "technicalInvite": None,
        }
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return PublicApplyResult(
        id=str(candidate.id),
        message="Application submitted. We will review after the form closes.",
    )


# --- Public AI interview (token) ----------------------------------------------


class PublicInterviewQuestionOut(BaseModel):
    id: str
    prompt: str
    seconds: int


class PublicInterviewSessionOut(BaseModel):
    token: str
    candidateName: str
    jobTitle: str
    expiresAt: str = ""
    captureDelaySeconds: int = 5
    passScore: int = 70
    completed: bool = False
    score: int | None = None
    passed: bool | None = None
    questions: list[PublicInterviewQuestionOut] = Field(default_factory=list)
    organization: PublicApplyOrgOut


class PublicInterviewSubmit(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    jobTitleConfirm: str = Field(min_length=1, max_length=255)
    selfieDataUrl: str = ""
    captures: list[dict[str, Any]] = Field(default_factory=list)
    answers: list[dict[str, Any]] = Field(default_factory=list)


class PublicInterviewResult(BaseModel):
    ok: bool = True
    passed: bool = False
    score: int = 0
    message: str


def _score_ai_interview(
    answers: list[dict[str, Any]], pass_score: int, job_title: str
) -> tuple[int, bool, str]:
    if not answers:
        score = 36
    else:
        lengths = [len(str(item.get("answer") or "").strip()) for item in answers]
        avg_len = sum(lengths) / max(1, len(lengths))
        score = 48 + min(38, round(avg_len / 7))
        joined = " ".join(str(item.get("answer") or "").lower() for item in answers)
        if re.search(r"metric|impact|customer|latency|revenue|retention", joined):
            score += 8
        if re.search(r"\bwe\b|team|collaborat", joined):
            score += 4
        if avg_len < 40:
            score -= 12
        score = max(36, min(98, int(score)))
    passed = score >= pass_score
    summary = (
        f"Timed interview passed for {job_title}: clear structure, ownership, and concrete examples."
        if passed
        else (
            f"Timed interview below pass score ({pass_score}): answers were thin or incomplete. "
            "Prefer not advancing without a human screen."
        )
    )
    return score, passed, summary


def _find_candidate_by_interview_token(db: Session, token: str) -> HiringCandidate | None:
    needle = (token or "").strip()
    if not needle:
        return None
    return (
        db.query(HiringCandidate)
        .filter(HiringCandidate.interview_token == needle)
        .order_by(HiringCandidate.created_at.desc())
        .first()
    )


@router.get("/public/interviews/{token}", response_model=PublicInterviewSessionOut)
def public_get_interview(token: str, db: Session = Depends(get_db)) -> PublicInterviewSessionOut:
    candidate = _find_candidate_by_interview_token(db, token)
    if not candidate:
        raise HTTPException(status_code=404, detail="Interview link is invalid.")
    job = db.get(HiringJob, candidate.job_id)
    org = db.get(Organization, candidate.organization_id)
    if not job or not org:
        raise HTTPException(status_code=404, detail="Interview link is invalid.")
    hiring = _ensure_job_hiring(job, db)
    payload = candidate.payload_dict()
    questions_raw = hiring.get("questions") if isinstance(hiring.get("questions"), list) else []
    approved = [
        item
        for item in questions_raw
        if isinstance(item, dict) and item.get("approved", True)
    ]
    if not approved:
        approved = [item for item in questions_raw if isinstance(item, dict)]
    questions = [
        PublicInterviewQuestionOut(
            id=str(item.get("id") or f"q{index}"),
            prompt=str(item.get("prompt") or ""),
            seconds=int(item.get("seconds") or 90),
        )
        for index, item in enumerate(approved[:5])
    ]
    ai_interview = payload.get("aiInterview") if isinstance(payload.get("aiInterview"), dict) else None
    return PublicInterviewSessionOut(
        token=token,
        candidateName=candidate.name,
        jobTitle=job.title,
        expiresAt=str(payload.get("interviewExpiresAt") or ""),
        captureDelaySeconds=int(hiring.get("captureDelaySeconds") or 5),
        passScore=int(hiring.get("passScore") or 70),
        completed=bool(ai_interview),
        score=int(ai_interview["score"]) if ai_interview and "score" in ai_interview else None,
        passed=bool(ai_interview.get("pass")) if ai_interview else None,
        questions=questions,
        organization=PublicApplyOrgOut(
            name=org.name,
            tagline=org.tagline or "",
            about=org.about or "",
            logoUrl=org.logo_url or "",
        ),
    )


@router.post("/public/interviews/{token}/complete", response_model=PublicInterviewResult)
def public_complete_interview(
    token: str,
    payload: PublicInterviewSubmit,
    db: Session = Depends(get_db),
) -> PublicInterviewResult:
    candidate = _find_candidate_by_interview_token(db, token)
    if not candidate:
        raise HTTPException(status_code=404, detail="Interview link is invalid.")
    job = db.get(HiringJob, candidate.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Role not found.")
    existing = candidate.payload_dict()
    if existing.get("aiInterview"):
        raise HTTPException(status_code=400, detail="This interview was already completed.")
    expires = str(existing.get("interviewExpiresAt") or "")
    if expires:
        try:
            from datetime import datetime, timezone

            if datetime.fromisoformat(expires.replace("Z", "+00:00")) < datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="This interview link has expired.")
        except HTTPException:
            raise
        except Exception:
            pass
    if payload.name.strip().lower() != candidate.name.strip().lower():
        raise HTTPException(
            status_code=400,
            detail="Name does not match the invitation. Use the name from your application.",
        )
    if not payload.jobTitleConfirm.strip():
        raise HTTPException(status_code=400, detail="Confirm the role you applied for.")

    hiring = _ensure_job_hiring(job, db)
    pass_score = int(hiring.get("passScore") or 70)
    stamped = []
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    for item in payload.answers:
        stamped.append(
            {
                "questionId": str(item.get("questionId") or ""),
                "answer": str(item.get("answer") or "").strip(),
                "capturedAt": now,
            }
        )
    score, passed, summary = _score_ai_interview(stamped, pass_score, job.title)
    captures: list[dict[str, Any]] = []
    for item in payload.captures or []:
        if not isinstance(item, dict):
            continue
        data_url = str(item.get("dataUrl") or "")
        if not data_url.startswith("data:image/"):
            continue
        # Cap payload size roughly (base64 stills).
        if len(data_url) > 900_000:
            continue
        captures.append(
            {
                "id": str(item.get("id") or f"cap-{len(captures)+1}"),
                "dataUrl": data_url,
                "capturedAt": str(item.get("capturedAt") or now),
                "kind": "identity" if item.get("kind") == "identity" else "random",
                "questionId": str(item.get("questionId") or "") or None,
            }
        )
        if len(captures) >= 12:
            break
    if payload.selfieDataUrl and not any(c.get("kind") == "identity" for c in captures):
        if str(payload.selfieDataUrl).startswith("data:image/") and len(payload.selfieDataUrl) <= 900_000:
            captures.insert(
                0,
                {
                    "id": f"cap-identity-{uuid4().hex[:8]}",
                    "dataUrl": payload.selfieDataUrl,
                    "capturedAt": now,
                    "kind": "identity",
                    "questionId": None,
                },
            )
    identity = next((c for c in captures if c.get("kind") == "identity"), None)
    ai_interview = {
        "score": score,
        "pass": passed,
        "summary": summary,
        "completedAt": now,
        "selfieDataUrl": payload.selfieDataUrl or (identity or {}).get("dataUrl"),
        "captures": captures,
        "answers": stamped,
    }
    next_payload = {
        **existing,
        "aiInterview": ai_interview,
        "interviewToken": candidate.interview_token,
        "interviewExpiresAt": existing.get("interviewExpiresAt") or "",
        "interviewInviteSentAt": existing.get("interviewInviteSentAt") or "",
    }
    candidate.set_payload_dict(next_payload)
    candidate.stage = "Technical Interview" if passed else "Rejected"
    if not passed:
        note = (
            f"AI interview failed: scored {score}/100 (need ≥{pass_score}). {summary}"
        )
        candidate.notes = f"{(candidate.notes or '').strip()}\n{note}".strip()
    candidate.rating = max(int(candidate.rating or 0), min(5, round(score / 20)))
    db.commit()
    db.refresh(candidate)
    return PublicInterviewResult(
        ok=True,
        passed=passed,
        score=score,
        message=(
            f"Passed AI interview ({score}/100). HR will contact you about the technical interview."
            if passed
            else f"AI interview scored {score}/100 — below the pass bar."
        ),
    )


# --- Public offer sign (token) ------------------------------------------------


@router.get("/public/offers/{token}", response_model=OfferOut)
def public_get_offer(token: str, db: Session = Depends(get_db)) -> OfferOut:
    row = db.query(JobOfferRow).filter(JobOfferRow.sign_token == token).first()
    if not row:
        raise HTTPException(status_code=404, detail="Offer not found")
    if row.status == "Sent":
        row.status = "Viewed"
        db.commit()
        db.refresh(row)
    return _offer_out(row)


@router.post("/public/offers/{token}/sign", response_model=OfferOut)
def public_sign_offer(
    token: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
) -> OfferOut:
    row = db.query(JobOfferRow).filter(JobOfferRow.sign_token == token).first()
    if not row:
        raise HTTPException(status_code=404, detail="Offer not found")
    if row.status in {"Signed", "Declined", "Expired"}:
        raise HTTPException(status_code=400, detail=f"Offer is already {row.status.lower()}")
    name = str(payload.get("signedName") or payload.get("signed_name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Signed name is required")
    from datetime import datetime, timezone

    row.status = "Signed"
    row.signed_name = name
    row.signed_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(row)
    return _offer_out(row)
