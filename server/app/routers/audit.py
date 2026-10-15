from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import AccountType, AuditEventRow, MembershipStatus, OrganizationMember, User
from app.db.session import get_db
from app.services import audit_log, pinecone_store

router = APIRouter(prefix="/audit", tags=["audit"])

AUDIT_AREAS = {
    "Hiring",
    "Organization",
    "Clients",
    "Work",
    "Access",
    "Finance",
    "Documents",
    "Billing",
    "AI",
    "Governance",
}


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


class AuditOut(BaseModel):
    id: str
    organization_id: str
    at: str
    actor: str
    action: str
    target: str
    area: str


class AuditCreate(BaseModel):
    actor: str = ""
    action: str = Field(min_length=1)
    target: str = ""
    area: str = "Organization"
    at: str = ""


def _out(row: AuditEventRow) -> AuditOut:
    return AuditOut(
        id=str(row.id),
        organization_id=str(row.organization_id),
        at=row.at,
        actor=row.actor,
        action=row.action,
        target=row.target,
        area=row.area,
    )


@router.get("/events", response_model=list[AuditOut])
def list_events(
    organization_id: UUID = Query(...),
    area: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuditOut]:
    _ensure_org_member(db, user, organization_id)
    query = db.query(AuditEventRow).filter(AuditEventRow.organization_id == organization_id)
    if area and area != "All":
        query = query.filter(AuditEventRow.area == area)
    rows = query.order_by(AuditEventRow.at.desc(), AuditEventRow.created_at.desc()).limit(500).all()
    return [_out(row) for row in rows]


@router.post("/events", response_model=AuditOut, status_code=201)
def create_event(
    payload: AuditCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditOut:
    _ensure_org_member(db, user, organization_id)
    if payload.area not in AUDIT_AREAS:
        raise HTTPException(status_code=400, detail="Invalid audit area")
    actor = payload.actor.strip() or (user.full_name or user.email)
    at = payload.at.strip() or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    row = AuditEventRow(
        organization_id=organization_id,
        at=at,
        actor=actor,
        action=payload.action.strip(),
        target=payload.target.strip(),
        area=payload.area,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    pinecone_store.upsert_audit_event(
        organization_id=organization_id,
        event_id=row.id,
        at=row.at,
        actor=row.actor,
        action=row.action,
        target=row.target,
        area=row.area,
    )
    return _out(row)


@router.post("/reindex")
def reindex_audit(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Push existing Neon audit rows into Pinecone for semantic search."""
    _ensure_org_member(db, user, organization_id)
    if not pinecone_store.ready():
        raise HTTPException(
            status_code=400,
            detail="Pinecone + embedding provider required. Set PINECONE_API_KEY and GEMINI_API_KEY or OPENAI_API_KEY.",
        )
    result = audit_log.reindex_org(db, organization_id)
    result["pinecone"] = pinecone_store.status()
    return result
