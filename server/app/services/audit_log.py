"""Write org audit events to Neon and optionally index them in Pinecone."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import AuditEventRow, User
from app.services import pinecone_store


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def record(
    db: Session,
    *,
    organization_id: UUID,
    actor: str,
    action: str,
    target: str = "",
    area: str = "Organization",
    index_vectors: bool = True,
) -> AuditEventRow:
    row = AuditEventRow(
        organization_id=organization_id,
        at=_now(),
        actor=(actor or "System").strip()[:200],
        action=(action or "").strip()[:255],
        target=(target or "").strip()[:255],
        area=(area or "Organization").strip()[:40],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    if index_vectors:
        pinecone_store.upsert_audit_event(
            organization_id=organization_id,
            event_id=row.id,
            at=row.at,
            actor=row.actor,
            action=row.action,
            target=row.target,
            area=row.area,
        )
    return row


def record_user_action(
    db: Session,
    *,
    organization_id: UUID,
    user: User,
    action: str,
    target: str = "",
    area: str = "Organization",
) -> AuditEventRow:
    actor = (user.full_name or user.email or "User").strip()
    return record(
        db,
        organization_id=organization_id,
        actor=actor,
        action=action,
        target=target,
        area=area,
    )


def reindex_org(db: Session, organization_id: UUID) -> dict[str, Any]:
    rows = (
        db.query(AuditEventRow)
        .filter(AuditEventRow.organization_id == organization_id)
        .order_by(AuditEventRow.at.desc())
        .limit(500)
        .all()
    )
    indexed = 0
    errors: list[str] = []
    for row in rows:
        result = pinecone_store.upsert_audit_event(
            organization_id=organization_id,
            event_id=row.id,
            at=row.at,
            actor=row.actor,
            action=row.action,
            target=row.target,
            area=row.area,
        )
        if result.get("ok"):
            indexed += 1
        elif result.get("error"):
            errors.append(str(result["error"]))
    return {"ok": True, "total": len(rows), "indexed": indexed, "errors": errors[:10]}
