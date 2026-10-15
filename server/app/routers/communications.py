from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user
from app.auth.security import decode_access_token
from app.db.models import (
    AccountType,
    CommChannel,
    CommChannelMember,
    CommMessage,
    CommReaction,
    MembershipStatus,
    OrganizationMember,
    OrgMemberRole,
    User,
)
from app.db.session import get_db, get_session_factory
from app.schemas.org import (
    CommChannelCreate,
    CommChannelOut,
    CommChannelUpdate,
    CommDmCreate,
    CommMembersAdd,
    CommMessageCreate,
    CommMessageOut,
    CommMessageUpdate,
    CommReactionBody,
)
from app.services.comms_hub import comms_hub

router = APIRouter(tags=["communications"])

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,30}$")
VISIBILITIES = {"Public", "Private"}


def _ensure_org_member(db: Session, user: User, org_id: UUID) -> OrganizationMember | None:
    if user.account_type == AccountType.platform_admin:
        return (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.status == MembershipStatus.active,
            )
            .first()
        )
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


def _membership_for_user(db: Session, user: User, org_id: UUID) -> OrganizationMember | None:
    return (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.status == MembershipStatus.active,
        )
        .first()
    )


def _load_channel(db: Session, channel_id: UUID) -> CommChannel | None:
    return (
        db.query(CommChannel)
        .options(joinedload(CommChannel.members))
        .filter(CommChannel.id == channel_id)
        .first()
    )


def _is_member(channel: CommChannel, member_id: UUID | None) -> bool:
    if member_id is None:
        return False
    return any(m.member_id == member_id for m in channel.members)


def _can_moderate(db: Session, channel: CommChannel, membership: OrganizationMember | None) -> bool:
    if not membership:
        return False
    if channel.created_by_member_id == membership.id:
        return True
    return membership.role in {OrgMemberRole.owner, OrgMemberRole.admin}


def _channel_out(channel: CommChannel, viewer_member_id: UUID | None = None) -> CommChannelOut:
    last_read = None
    if viewer_member_id:
        for member in channel.members:
            if member.member_id == viewer_member_id:
                last_read = member.last_read_at
                break
    return CommChannelOut(
        id=channel.id,
        organization_id=channel.organization_id,
        kind=channel.kind,
        name=channel.name or "",
        description=channel.description or "",
        visibility=channel.visibility,
        member_ids=[m.member_id for m in channel.members],
        created_by=channel.created_by_member_id,
        created_at=channel.created_at,
        last_read_at=last_read,
    )


def _message_out(row: CommMessage) -> CommMessageOut:
    reactions: dict[str, list[str]] = {}
    for reaction in row.reactions:
        reactions.setdefault(reaction.emoji, []).append(str(reaction.member_id))
    author_id = (
        f"agent:{row.author_agent_key}"
        if row.author_agent_key
        else (str(row.author_member_id) if row.author_member_id else "")
    )
    return CommMessageOut(
        id=row.id,
        channel_id=row.channel_id,
        author_id=author_id,
        body=row.body,
        created_at=row.created_at,
        edited_at=row.edited_at,
        reactions=reactions,
    )


def _load_message(db: Session, message_id: UUID) -> CommMessage | None:
    return (
        db.query(CommMessage)
        .options(joinedload(CommMessage.reactions), joinedload(CommMessage.channel).joinedload(CommChannel.members))
        .filter(CommMessage.id == message_id)
        .first()
    )


async def _broadcast(org_id: UUID, event_type: str, payload: dict) -> None:
    await comms_hub.broadcast(org_id, {"type": event_type, "payload": payload})


def _ensure_general(db: Session, org_id: UUID, creator: OrganizationMember | None) -> None:
    existing = (
        db.query(CommChannel)
        .filter(
            CommChannel.organization_id == org_id,
            CommChannel.kind == "channel",
            CommChannel.name == "general",
        )
        .first()
    )
    if existing:
        return
    channel = CommChannel(
        organization_id=org_id,
        kind="channel",
        name="general",
        description="Company-wide updates and announcements",
        visibility="Public",
        created_by_member_id=creator.id if creator else None,
    )
    db.add(channel)
    db.flush()
    members = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.status == MembershipStatus.active,
        )
        .all()
    )
    for member in members:
        db.add(CommChannelMember(channel_id=channel.id, member_id=member.id))
    db.commit()


# --- Channels -----------------------------------------------------------------


@router.get("/channels", response_model=list[CommChannelOut])
async def list_channels(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CommChannelOut]:
    membership = _ensure_org_member(db, user, organization_id)
    _ensure_general(db, organization_id, membership)
    rows = (
        db.query(CommChannel)
        .options(joinedload(CommChannel.members))
        .filter(CommChannel.organization_id == organization_id)
        .order_by(CommChannel.created_at.asc())
        .all()
    )
    viewer_id = membership.id if membership else None
    return [_channel_out(row, viewer_id) for row in rows]


@router.post("/channels", response_model=CommChannelOut, status_code=201)
async def create_channel(
    payload: CommChannelCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommChannelOut:
    membership = _ensure_org_member(db, user, organization_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Organization membership required")
    name = payload.name.strip().lower().replace(" ", "-")
    if not SLUG_RE.match(name):
        raise HTTPException(status_code=400, detail="Use 2–31 lowercase letters, numbers, or dashes.")
    if payload.visibility not in VISIBILITIES:
        raise HTTPException(status_code=400, detail="Invalid visibility")
    exists = (
        db.query(CommChannel)
        .filter(
            CommChannel.organization_id == organization_id,
            CommChannel.kind == "channel",
            CommChannel.name == name,
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail=f"#{name} already exists.")

    member_ids = {membership.id, *payload.member_ids}
    valid = {
        row.id
        for row in db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.id.in_(member_ids),
            OrganizationMember.status == MembershipStatus.active,
        )
        .all()
    }
    channel = CommChannel(
        organization_id=organization_id,
        kind="channel",
        name=name,
        description=payload.description.strip(),
        visibility=payload.visibility,
        created_by_member_id=membership.id,
    )
    db.add(channel)
    db.flush()
    for mid in valid:
        db.add(CommChannelMember(channel_id=channel.id, member_id=mid))
    db.commit()
    channel = _load_channel(db, channel.id)
    assert channel is not None
    out = _channel_out(channel, membership.id)
    await _broadcast(organization_id, "channel.upserted", out.model_dump(mode="json"))
    return out


@router.patch("/channels/{channel_id}", response_model=CommChannelOut)
async def update_channel(
    channel_id: UUID,
    payload: CommChannelUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommChannelOut:
    channel = _load_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    membership = _ensure_org_member(db, user, channel.organization_id)
    if not _can_moderate(db, channel, membership):
        raise HTTPException(status_code=403, detail="Only channel moderators can edit")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip().lower().replace(" ", "-")
        if not SLUG_RE.match(name):
            raise HTTPException(status_code=400, detail="Use 2–31 lowercase letters, numbers, or dashes.")
        if channel.name == "general" and name != "general":
            raise HTTPException(status_code=400, detail="#general can't be renamed.")
        clash = (
            db.query(CommChannel)
            .filter(
                CommChannel.organization_id == channel.organization_id,
                CommChannel.kind == "channel",
                CommChannel.name == name,
                CommChannel.id != channel.id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail=f"#{name} already exists.")
        channel.name = name
    if "description" in data and data["description"] is not None:
        channel.description = data["description"].strip()
    db.commit()
    channel = _load_channel(db, channel_id)
    assert channel is not None
    out = _channel_out(channel, membership.id if membership else None)
    await _broadcast(channel.organization_id, "channel.upserted", out.model_dump(mode="json"))
    return out


@router.delete("/channels/{channel_id}", status_code=204)
async def delete_channel(
    channel_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    channel = _load_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    membership = _ensure_org_member(db, user, channel.organization_id)
    if channel.kind != "channel":
        raise HTTPException(status_code=400, detail="Use leave for direct messages")
    if channel.name == "general":
        raise HTTPException(status_code=400, detail="#general can't be deleted.")
    if not _can_moderate(db, channel, membership):
        raise HTTPException(status_code=403, detail="Only channel moderators can delete")
    org_id = channel.organization_id
    db.delete(channel)
    db.commit()
    await _broadcast(org_id, "channel.deleted", {"id": str(channel_id)})


@router.post("/channels/{channel_id}/join", response_model=CommChannelOut)
async def join_channel(
    channel_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommChannelOut:
    channel = _load_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    membership = _ensure_org_member(db, user, channel.organization_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Organization membership required")
    if channel.kind != "channel" or channel.visibility != "Public":
        raise HTTPException(status_code=400, detail="Only public channels can be joined")
    if not _is_member(channel, membership.id):
        db.add(
            CommChannelMember(
                channel_id=channel.id,
                member_id=membership.id,
                last_read_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        channel = _load_channel(db, channel_id)
        assert channel is not None
    out = _channel_out(channel, membership.id)
    await _broadcast(channel.organization_id, "channel.upserted", out.model_dump(mode="json"))
    return out


@router.post("/channels/{channel_id}/leave", response_model=CommChannelOut)
async def leave_channel(
    channel_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommChannelOut:
    channel = _load_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    membership = _ensure_org_member(db, user, channel.organization_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Organization membership required")
    if channel.kind == "channel" and channel.name == "general":
        raise HTTPException(status_code=400, detail="Can't leave #general")
    for member in list(channel.members):
        if member.member_id == membership.id:
            db.delete(member)
    db.commit()
    channel = _load_channel(db, channel_id)
    assert channel is not None
    out = _channel_out(channel, membership.id)
    await _broadcast(channel.organization_id, "channel.upserted", out.model_dump(mode="json"))
    return out


@router.post("/channels/{channel_id}/members", response_model=CommChannelOut)
async def add_members(
    channel_id: UUID,
    payload: CommMembersAdd,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommChannelOut:
    channel = _load_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    membership = _ensure_org_member(db, user, channel.organization_id)
    if not _can_moderate(db, channel, membership):
        raise HTTPException(status_code=403, detail="Only channel moderators can add members")
    existing = {m.member_id for m in channel.members}
    valid = {
        row.id
        for row in db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == channel.organization_id,
            OrganizationMember.id.in_(payload.member_ids),
            OrganizationMember.status == MembershipStatus.active,
        )
        .all()
    }
    for mid in valid - existing:
        db.add(CommChannelMember(channel_id=channel.id, member_id=mid))
    db.commit()
    channel = _load_channel(db, channel_id)
    assert channel is not None
    out = _channel_out(channel, membership.id if membership else None)
    await _broadcast(channel.organization_id, "channel.upserted", out.model_dump(mode="json"))
    return out


@router.post("/dms", response_model=CommChannelOut, status_code=201)
async def open_dm(
    payload: CommDmCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommChannelOut:
    membership = _ensure_org_member(db, user, organization_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Organization membership required")
    other = db.get(OrganizationMember, payload.member_id)
    if not other or other.organization_id != organization_id or other.status != MembershipStatus.active:
        raise HTTPException(status_code=400, detail="Person not found in this organization")

    pair = {membership.id, other.id}
    candidates = (
        db.query(CommChannel)
        .options(joinedload(CommChannel.members))
        .filter(CommChannel.organization_id == organization_id, CommChannel.kind == "dm")
        .all()
    )
    for channel in candidates:
        member_ids = {m.member_id for m in channel.members}
        if member_ids == pair:
            return _channel_out(channel, membership.id)

    channel = CommChannel(
        organization_id=organization_id,
        kind="dm",
        name="",
        description="",
        visibility="Private",
        created_by_member_id=membership.id,
    )
    db.add(channel)
    db.flush()
    for mid in pair:
        db.add(CommChannelMember(channel_id=channel.id, member_id=mid))
    db.commit()
    channel = _load_channel(db, channel.id)
    assert channel is not None
    out = _channel_out(channel, membership.id)
    await _broadcast(organization_id, "channel.upserted", out.model_dump(mode="json"))
    return out


@router.post("/channels/{channel_id}/read", response_model=CommChannelOut)
async def mark_read(
    channel_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommChannelOut:
    channel = _load_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    membership = _ensure_org_member(db, user, channel.organization_id)
    if not membership or not _is_member(channel, membership.id):
        raise HTTPException(status_code=403, detail="Not a channel member")
    now = datetime.now(timezone.utc)
    for member in channel.members:
        if member.member_id == membership.id:
            member.last_read_at = now
            break
    db.commit()
    channel = _load_channel(db, channel_id)
    assert channel is not None
    return _channel_out(channel, membership.id)


# --- Messages -----------------------------------------------------------------


@router.get("/channels/{channel_id}/messages", response_model=list[CommMessageOut])
async def list_messages(
    channel_id: UUID,
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CommMessageOut]:
    channel = _load_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    membership = _ensure_org_member(db, user, channel.organization_id)
    if membership and not _is_member(channel, membership.id) and channel.visibility != "Public":
        raise HTTPException(status_code=403, detail="Not a channel member")
    if membership and not _is_member(channel, membership.id) and channel.kind == "dm":
        raise HTTPException(status_code=403, detail="Not a channel member")
    rows = (
        db.query(CommMessage)
        .options(joinedload(CommMessage.reactions))
        .filter(CommMessage.channel_id == channel_id)
        .order_by(CommMessage.created_at.asc())
        .limit(limit)
        .all()
    )
    return [_message_out(row) for row in rows]


@router.post("/channels/{channel_id}/messages", response_model=CommMessageOut, status_code=201)
async def send_message(
    channel_id: UUID,
    payload: CommMessageCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommMessageOut:
    channel = _load_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    membership = _ensure_org_member(db, user, channel.organization_id)
    if not membership or not _is_member(channel, membership.id):
        raise HTTPException(status_code=403, detail="Not a channel member")
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body is required")
    row = CommMessage(channel_id=channel.id, author_member_id=membership.id, body=body)
    db.add(row)
    for member in channel.members:
        if member.member_id == membership.id:
            member.last_read_at = datetime.now(timezone.utc)
            break
    db.commit()
    row = _load_message(db, row.id)
    assert row is not None
    out = _message_out(row)
    await _broadcast(channel.organization_id, "message.created", out.model_dump(mode="json"))
    return out


@router.patch("/messages/{message_id}", response_model=CommMessageOut)
async def edit_message(
    message_id: UUID,
    payload: CommMessageUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommMessageOut:
    row = _load_message(db, message_id)
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    membership = _membership_for_user(db, user, row.channel.organization_id)
    if not membership or row.author_member_id != membership.id:
        raise HTTPException(status_code=403, detail="Can only edit your own messages")
    row.body = payload.body.strip()
    row.edited_at = datetime.now(timezone.utc)
    db.commit()
    row = _load_message(db, message_id)
    assert row is not None
    out = _message_out(row)
    await _broadcast(row.channel.organization_id, "message.updated", out.model_dump(mode="json"))
    return out


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(
    message_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = _load_message(db, message_id)
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    membership = _membership_for_user(db, user, row.channel.organization_id)
    is_admin = bool(membership and membership.role in {OrgMemberRole.owner, OrgMemberRole.admin})
    if not membership or (row.author_member_id != membership.id and not is_admin):
        raise HTTPException(status_code=403, detail="Not allowed to delete this message")
    org_id = row.channel.organization_id
    channel_id = row.channel_id
    db.delete(row)
    db.commit()
    await _broadcast(
        org_id,
        "message.deleted",
        {"id": str(message_id), "channel_id": str(channel_id)},
    )


@router.post("/messages/{message_id}/reactions", response_model=CommMessageOut)
async def toggle_reaction(
    message_id: UUID,
    payload: CommReactionBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommMessageOut:
    row = _load_message(db, message_id)
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    membership = _membership_for_user(db, user, row.channel.organization_id)
    if not membership or not _is_member(row.channel, membership.id):
        raise HTTPException(status_code=403, detail="Not a channel member")
    emoji = payload.emoji.strip()
    if not emoji:
        raise HTTPException(status_code=400, detail="Emoji required")
    existing = (
        db.query(CommReaction)
        .filter(
            CommReaction.message_id == row.id,
            CommReaction.member_id == membership.id,
            CommReaction.emoji == emoji,
        )
        .first()
    )
    if existing:
        db.delete(existing)
    else:
        db.add(CommReaction(message_id=row.id, member_id=membership.id, emoji=emoji))
    db.commit()
    row = _load_message(db, message_id)
    assert row is not None
    out = _message_out(row)
    await _broadcast(row.channel.organization_id, "message.updated", out.model_dump(mode="json"))
    return out


# --- WebSocket ----------------------------------------------------------------


@router.websocket("/ws/communications")
async def communications_ws(
    websocket: WebSocket,
    organization_id: UUID = Query(...),
    token: str = Query(...),
) -> None:
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
        await websocket.send_json({"type": "connected", "payload": {"organization_id": str(organization_id)}})
        while True:
            # Keep-alive / ignore client pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await comms_hub.disconnect(organization_id, websocket)
