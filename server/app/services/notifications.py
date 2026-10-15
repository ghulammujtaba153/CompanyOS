"""Create and fan-out role-aware internal notifications."""

from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone
from typing import Any, Iterable
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.db.models import MembershipStatus, NotificationRow, OrgMemberRole, OrganizationMember, User
from app.services.comms_hub import comms_hub

logger = logging.getLogger(__name__)

# Who receives each notification kind by default (org roles).
KIND_ROLES: dict[str, tuple[OrgMemberRole, ...]] = {
    "approval": (OrgMemberRole.owner, OrgMemberRole.admin, OrgMemberRole.manager),
    "leave": (OrgMemberRole.owner, OrgMemberRole.admin, OrgMemberRole.manager),
    "hiring": (OrgMemberRole.owner, OrgMemberRole.admin, OrgMemberRole.manager),
    "offer": (OrgMemberRole.owner, OrgMemberRole.admin, OrgMemberRole.manager),
    "finance": (OrgMemberRole.owner, OrgMemberRole.admin),
    "governance": (OrgMemberRole.owner, OrgMemberRole.admin, OrgMemberRole.manager),
    "work": (OrgMemberRole.owner, OrgMemberRole.admin, OrgMemberRole.manager, OrgMemberRole.member),
    "document": (OrgMemberRole.owner, OrgMemberRole.admin, OrgMemberRole.manager),
    "system": (OrgMemberRole.owner, OrgMemberRole.admin),
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _schedule_broadcast(org_id: UUID, event: dict[str, Any]) -> None:
    async def _send() -> None:
        try:
            await comms_hub.broadcast(org_id, event)
        except Exception:
            logger.exception("notification broadcast failed")

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_send())
    except RuntimeError:
        def _run() -> None:
            asyncio.run(_send())

        threading.Thread(target=_run, daemon=True).start()


def _active_members(db: Session, organization_id: UUID) -> list[OrganizationMember]:
    return (
        db.query(OrganizationMember)
        .options(joinedload(OrganizationMember.user))
        .filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.status == MembershipStatus.active,
        )
        .all()
    )


def _serialize(row: NotificationRow, *, actor_name: str = "") -> dict[str, Any]:
    return {
        "id": str(row.id),
        "organizationId": str(row.organization_id),
        "recipientUserId": str(row.recipient_user_id),
        "actorUserId": str(row.actor_user_id) if row.actor_user_id else "",
        "actorName": actor_name,
        "kind": row.kind,
        "title": row.title,
        "body": row.body,
        "href": row.href,
        "entityType": row.entity_type,
        "entityId": row.entity_id,
        "roleScope": row.role_scope,
        "readAt": row.read_at.isoformat() if row.read_at else None,
        "createdAt": row.created_at.isoformat() if row.created_at else _utcnow().isoformat(),
        "unread": row.read_at is None,
    }


def notify_users(
    db: Session,
    *,
    organization_id: UUID,
    recipient_user_ids: Iterable[UUID],
    kind: str,
    title: str,
    body: str = "",
    href: str = "",
    actor_user_id: UUID | None = None,
    entity_type: str = "",
    entity_id: str = "",
    role_scope: str = "",
    exclude_user_id: UUID | None = None,
) -> list[NotificationRow]:
    """Persist notifications for specific users and broadcast over the org hub."""
    recipients = {uid for uid in recipient_user_ids if uid}
    if exclude_user_id:
        recipients.discard(exclude_user_id)
    if not recipients:
        return []

    actor_name = ""
    if actor_user_id:
        actor = db.get(User, actor_user_id)
        if actor:
            actor_name = actor.full_name or actor.email

    rows: list[NotificationRow] = []
    for user_id in recipients:
        row = NotificationRow(
            organization_id=organization_id,
            recipient_user_id=user_id,
            actor_user_id=actor_user_id,
            kind=(kind or "system")[:40],
            title=(title or "Notification")[:255],
            body=(body or "")[:4000],
            href=(href or "")[:500],
            entity_type=(entity_type or "")[:40],
            entity_id=(entity_id or "")[:80],
            role_scope=(role_scope or "")[:120],
        )
        db.add(row)
        rows.append(row)

    db.commit()
    for row in rows:
        db.refresh(row)
        payload = _serialize(row, actor_name=actor_name)
        _schedule_broadcast(
            organization_id,
            {"type": "notification.created", "payload": payload},
        )
    return rows


def notify_roles(
    db: Session,
    *,
    organization_id: UUID,
    roles: Iterable[OrgMemberRole | str],
    kind: str,
    title: str,
    body: str = "",
    href: str = "",
    actor_user_id: UUID | None = None,
    entity_type: str = "",
    entity_id: str = "",
    exclude_user_id: UUID | None = None,
) -> list[NotificationRow]:
    role_set: set[OrgMemberRole] = set()
    for role in roles:
        if isinstance(role, OrgMemberRole):
            role_set.add(role)
        else:
            try:
                role_set.add(OrgMemberRole(str(role)))
            except Exception:
                continue
    if not role_set:
        role_set = set(KIND_ROLES.get(kind, (OrgMemberRole.owner, OrgMemberRole.admin)))

    members = _active_members(db, organization_id)
    recipients = [m.user_id for m in members if m.role in role_set]
    scope = ",".join(sorted(r.value for r in role_set))
    return notify_users(
        db,
        organization_id=organization_id,
        recipient_user_ids=recipients,
        kind=kind,
        title=title,
        body=body,
        href=href,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        role_scope=scope,
        exclude_user_id=exclude_user_id,
    )


def notify_kind_roles(
    db: Session,
    *,
    organization_id: UUID,
    kind: str,
    title: str,
    body: str = "",
    href: str = "",
    actor_user_id: UUID | None = None,
    entity_type: str = "",
    entity_id: str = "",
    exclude_user_id: UUID | None = None,
) -> list[NotificationRow]:
    return notify_roles(
        db,
        organization_id=organization_id,
        roles=KIND_ROLES.get(kind, (OrgMemberRole.owner, OrgMemberRole.admin)),
        kind=kind,
        title=title,
        body=body,
        href=href,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        exclude_user_id=exclude_user_id,
    )


def notify_member_ids(
    db: Session,
    *,
    organization_id: UUID,
    member_ids: Iterable[UUID | str],
    kind: str,
    title: str,
    body: str = "",
    href: str = "",
    actor_user_id: UUID | None = None,
    entity_type: str = "",
    entity_id: str = "",
    exclude_user_id: UUID | None = None,
) -> list[NotificationRow]:
    ids: list[UUID] = []
    for raw in member_ids:
        try:
            ids.append(UUID(str(raw)))
        except Exception:
            continue
    if not ids:
        return []
    members = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.id.in_(ids),
            OrganizationMember.status == MembershipStatus.active,
        )
        .all()
    )
    return notify_users(
        db,
        organization_id=organization_id,
        recipient_user_ids=[m.user_id for m in members],
        kind=kind,
        title=title,
        body=body,
        href=href,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        role_scope="member",
        exclude_user_id=exclude_user_id,
    )


def find_users_by_name_or_email(
    db: Session, organization_id: UUID, label: str
) -> list[UUID]:
    """Match an assignee label to org member user ids."""
    needle = (label or "").strip().lower()
    if not needle or needle == "unassigned":
        return []
    out: list[UUID] = []
    for member in _active_members(db, organization_id):
        user = member.user
        if not user:
            continue
        names = {(user.full_name or "").strip().lower(), (user.email or "").strip().lower()}
        names.discard("")
        if needle in names or any(needle in n for n in names):
            out.append(user.id)
    return out
