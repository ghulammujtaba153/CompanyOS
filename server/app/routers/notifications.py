"""Internal notifications API + realtime WebSocket."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.security import decode_access_token
from app.db.models import (
    AccountType,
    MembershipStatus,
    NotificationRow,
    OrganizationMember,
    User,
)
from app.db.session import get_db, get_session_factory
from app.services.comms_hub import comms_hub
from app.services import notifications as notif_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


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


class MarkReadIn(BaseModel):
    ids: list[str] = Field(default_factory=list)


@router.get("")
def list_notifications(
    organization_id: UUID = Query(...),
    unread_only: bool = Query(False),
    limit: int = Query(40, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_org_member(db, user, organization_id)
    q = db.query(NotificationRow).filter(
        NotificationRow.organization_id == organization_id,
        NotificationRow.recipient_user_id == user.id,
    )
    if unread_only:
        q = q.filter(NotificationRow.read_at.is_(None))
    rows = q.order_by(NotificationRow.created_at.desc()).limit(limit).all()

    actor_ids = {r.actor_user_id for r in rows if r.actor_user_id}
    actors: dict[UUID, User] = {}
    if actor_ids:
        for u in db.query(User).filter(User.id.in_(actor_ids)).all():
            actors[u.id] = u

    items = []
    for row in rows:
        actor_name = ""
        if row.actor_user_id and row.actor_user_id in actors:
            a = actors[row.actor_user_id]
            actor_name = a.full_name or a.email
        items.append(notif_service._serialize(row, actor_name=actor_name))

    unread = (
        db.query(NotificationRow)
        .filter(
            NotificationRow.organization_id == organization_id,
            NotificationRow.recipient_user_id == user.id,
            NotificationRow.read_at.is_(None),
        )
        .count()
    )
    return {"items": items, "unreadCount": unread}


@router.get("/unread-count")
def unread_count(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    _ensure_org_member(db, user, organization_id)
    count = (
        db.query(NotificationRow)
        .filter(
            NotificationRow.organization_id == organization_id,
            NotificationRow.recipient_user_id == user.id,
            NotificationRow.read_at.is_(None),
        )
        .count()
    )
    return {"unreadCount": count}


@router.post("/read")
def mark_read(
    payload: MarkReadIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_org_member(db, user, organization_id)
    ids: list[UUID] = []
    for raw in payload.ids:
        try:
            ids.append(UUID(str(raw)))
        except Exception:
            continue
    if not ids:
        return {"ok": True, "updated": 0}
    now = datetime.now(timezone.utc)
    rows = (
        db.query(NotificationRow)
        .filter(
            NotificationRow.organization_id == organization_id,
            NotificationRow.recipient_user_id == user.id,
            NotificationRow.id.in_(ids),
            NotificationRow.read_at.is_(None),
        )
        .all()
    )
    for row in rows:
        row.read_at = now
    db.commit()
    return {"ok": True, "updated": len(rows)}


@router.post("/read-all")
def mark_all_read(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_org_member(db, user, organization_id)
    now = datetime.now(timezone.utc)
    rows = (
        db.query(NotificationRow)
        .filter(
            NotificationRow.organization_id == organization_id,
            NotificationRow.recipient_user_id == user.id,
            NotificationRow.read_at.is_(None),
        )
        .all()
    )
    for row in rows:
        row.read_at = now
    db.commit()
    return {"ok": True, "updated": len(rows)}


@router.websocket("/ws")
async def notifications_ws(
    websocket: WebSocket,
    organization_id: UUID = Query(...),
    token: str = Query(...),
) -> None:
    """Same org hub as communications — client filters by recipientUserId."""
    try:
        payload = decode_access_token(token)
        user_id = UUID(payload["sub"])
    except Exception:
        await websocket.close(code=4401)
        return

    db = get_session_factory()()
    try:
        user = db.get(User, user_id)
        if not user or not user.is_active:
            await websocket.close(code=4401)
            return
        try:
            _ensure_org_member(db, user, organization_id)
        except HTTPException:
            await websocket.close(code=4403)
            return
    finally:
        db.close()

    await comms_hub.connect(organization_id, websocket)
    try:
        await websocket.send_json(
            {
                "type": "connected",
                "payload": {
                    "organization_id": str(organization_id),
                    "user_id": str(user_id),
                    "channel": "notifications",
                },
            }
        )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await comms_hub.disconnect(organization_id, websocket)
