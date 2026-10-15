"""Execute people-ops / CRM MCP tools against Neon."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models import (
    Client,
    Engagement,
    HiringCandidate,
    JobOfferRow,
    OnboardingPlanRow,
    User,
)
from app.services import audit_log

CANDIDATE_STAGES = {
    "Applied",
    "Screening",
    "Shortlisted",
    "AI Interview",
    "Technical Interview",
    "Offer",
    "Hired",
    "Rejected",
}


def _today() -> str:
    return date.today().isoformat()


def _uuid(value: str) -> UUID:
    try:
        return UUID(str(value).strip())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid id: {value}") from exc


def execute(
    tool_name: str,
    db: Session,
    organization_id: UUID,
    user: User,
    args: dict[str, Any],
) -> dict[str, Any]:
    handlers = {
        "list_candidates": _list_candidates,
        "move_candidate_stage": _move_candidate_stage,
        "draft_offer": _draft_offer,
        "start_onboarding_checklist": _start_onboarding,
        "create_client_note": _create_client_note,
        "summarize_engagement": _summarize_engagement,
    }
    handler = handlers.get(tool_name)
    if not handler:
        raise HTTPException(status_code=400, detail=f"Unsupported people/CRM tool: {tool_name}")
    return handler(db, organization_id, user, args or {})


def _list_candidates(
    db: Session, organization_id: UUID, user: User, args: dict[str, Any]
) -> dict[str, Any]:
    job_id = str(args.get("jobId") or args.get("job_id") or "").strip()
    stage = str(args.get("stage") or "").strip()
    q = db.query(HiringCandidate).filter(HiringCandidate.organization_id == organization_id)
    if job_id:
        q = q.filter(HiringCandidate.job_id == _uuid(job_id))
    if stage:
        q = q.filter(HiringCandidate.stage == stage)
    rows = q.order_by(HiringCandidate.updated_at.desc()).limit(50).all()
    data = [
        {
            "id": str(row.id),
            "jobId": str(row.job_id),
            "name": row.name,
            "email": row.email,
            "stage": row.stage,
            "rating": row.rating,
        }
        for row in rows
    ]
    return {"message": f"Found {len(data)} candidate(s).", "data": data}


def _move_candidate_stage(
    db: Session, organization_id: UUID, user: User, args: dict[str, Any]
) -> dict[str, Any]:
    candidate_id = str(args.get("candidateId") or args.get("candidate_id") or "").strip()
    stage = str(args.get("stage") or "").strip()
    if not candidate_id or not stage:
        raise HTTPException(status_code=400, detail="candidateId and stage are required")
    if stage not in CANDIDATE_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Use one of: {sorted(CANDIDATE_STAGES)}")
    row = db.get(HiringCandidate, _uuid(candidate_id))
    if not row or row.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    prev = row.stage
    row.stage = stage
    db.commit()
    db.refresh(row)
    audit_log.record_user_action(
        db,
        organization_id=organization_id,
        user=user,
        action=f"Moved candidate {prev} → {stage}",
        target=row.name,
        area="Hiring",
    )
    return {
        "message": f"Moved {row.name} to {stage}.",
        "data": {"id": str(row.id), "name": row.name, "stage": row.stage},
    }


def _draft_offer(
    db: Session, organization_id: UUID, user: User, args: dict[str, Any]
) -> dict[str, Any]:
    candidate_id = str(args.get("candidateId") or args.get("candidate_id") or "").strip()
    salary = args.get("salary")
    start_date = str(args.get("startDate") or args.get("start_date") or _today()).strip()
    if not candidate_id:
        raise HTTPException(status_code=400, detail="candidateId is required")
    try:
        salary_num = float(salary)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="salary must be a number") from exc
    cand = db.get(HiringCandidate, _uuid(candidate_id))
    if not cand or cand.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    token = uuid4().hex[:24]
    offer = JobOfferRow(
        organization_id=organization_id,
        candidate_id=str(cand.id),
        candidate_name=cand.name,
        candidate_email=cand.email or "",
        job_id=str(cand.job_id),
        job_title="Offer",
        salary=salary_num,
        currency="USD",
        start_date=start_date,
        status="Draft",
        sign_token=token,
        created_at=_today(),
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    audit_log.record_user_action(
        db,
        organization_id=organization_id,
        user=user,
        action="Drafted offer",
        target=cand.name,
        area="Hiring",
    )
    return {
        "message": f"Draft offer created for {cand.name}.",
        "data": {"offerId": str(offer.id), "candidateId": str(cand.id), "salary": salary_num, "status": "Draft"},
    }


def _start_onboarding(
    db: Session, organization_id: UUID, user: User, args: dict[str, Any]
) -> dict[str, Any]:
    name = str(args.get("employeeName") or args.get("employee_name") or "").strip()
    role = str(args.get("role") or "").strip() or "New hire"
    start_date = str(args.get("startDate") or args.get("start_date") or _today()).strip()
    if not name:
        raise HTTPException(status_code=400, detail="employeeName is required")
    tasks = [
        {"id": "t1", "title": "Complete paperwork", "done": False},
        {"id": "t2", "title": f"Set up tools for {role}", "done": False},
        {"id": "t3", "title": "Meet buddy / manager", "done": False},
        {"id": "t4", "title": "Review handbook in Document vault", "done": False},
    ]
    plan = OnboardingPlanRow(
        organization_id=organization_id,
        employee_id=f"pending:{name.lower().replace(' ', '-')}",
        start_date=start_date,
        buddy_id="",
    )
    plan.set_tasks_list(tasks)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    audit_log.record_user_action(
        db,
        organization_id=organization_id,
        user=user,
        action="Started onboarding checklist",
        target=name,
        area="Hiring",
    )
    return {
        "message": f"Onboarding checklist created for {name}.",
        "data": {"planId": str(plan.id), "employeeName": name, "role": role, "tasks": tasks},
    }


def _create_client_note(
    db: Session, organization_id: UUID, user: User, args: dict[str, Any]
) -> dict[str, Any]:
    client_id = str(args.get("clientId") or args.get("client_id") or "").strip()
    note = str(args.get("note") or "").strip()
    if not client_id or not note:
        raise HTTPException(status_code=400, detail="clientId and note are required")
    client = db.get(Client, _uuid(client_id))
    if not client or client.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Client not found")
    stamp = _today()
    actor = (user.full_name or user.email or "User").strip()
    addition = f"\n[{stamp} · {actor}] {note}".strip()
    client.notes = ((client.notes or "").rstrip() + "\n" + addition).strip()
    db.commit()
    db.refresh(client)
    audit_log.record_user_action(
        db,
        organization_id=organization_id,
        user=user,
        action="Added client note",
        target=client.name,
        area="Clients",
    )
    return {
        "message": f"Note added to {client.name}.",
        "data": {"clientId": str(client.id), "name": client.name, "notes": client.notes[-500:]},
    }


def _summarize_engagement(
    db: Session, organization_id: UUID, user: User, args: dict[str, Any]
) -> dict[str, Any]:
    engagement_id = str(args.get("engagementId") or args.get("engagement_id") or "").strip()
    if not engagement_id:
        raise HTTPException(status_code=400, detail="engagementId is required")
    row = db.get(Engagement, _uuid(engagement_id))
    if not row or row.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Engagement not found")
    client = db.get(Client, row.client_id)
    phases = row.phases_list()
    summary = {
        "id": str(row.id),
        "title": row.title,
        "status": row.status,
        "client": client.name if client else "",
        "price": row.price,
        "currency": row.currency,
        "description": (row.description or "")[:800],
        "phases": phases[:12],
        "workProjectId": row.work_project_id or "",
        "dueDate": row.due_date or "",
    }
    return {
        "message": f"Engagement summary for {summary['title']}.",
        "data": summary,
    }
