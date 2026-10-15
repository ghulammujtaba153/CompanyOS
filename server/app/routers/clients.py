from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.security import hash_password
from app.db.models import (
    AccountType,
    Client,
    ClientUser,
    ClientUserStatus,
    Engagement,
    MembershipStatus,
    OrganizationMember,
    User,
)
from app.db.session import get_db
from app.schemas.org import (
    ClientCreate,
    ClientOut,
    ClientPortalInvite,
    ClientUpdate,
    EngagementCreate,
    EngagementOut,
    EngagementUpdate,
)
from app.services.identity import user_can_manage_org

router = APIRouter(prefix="/clients", tags=["clients"])

ENGAGEMENT_STATUSES = {
    "Draft",
    "Discovery",
    "In progress",
    "Ready to promote",
    "Promoted",
    "On hold",
    "Completed",
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


def _default_phases() -> list[dict]:
    return [
        {
            "id": f"phase-{uuid4().hex[:10]}",
            "name": "Discovery & requirements",
            "status": "In progress",
            "dueDate": "",
            "notes": "Collect goals, constraints, and success criteria from the client.",
        },
        {
            "id": f"phase-{uuid4().hex[:10]}",
            "name": "Scope & proposal",
            "status": "Not started",
            "dueDate": "",
            "notes": "Lock price, deliverables, and timeline before internal delivery.",
        },
        {
            "id": f"phase-{uuid4().hex[:10]}",
            "name": "Ready for delivery handoff",
            "status": "Not started",
            "dueDate": "",
            "notes": "Promote into Work Management once scope is approved.",
        },
    ]


def _engagement_out(row: Engagement) -> EngagementOut:
    try:
        price = float(row.price or 0)
    except ValueError:
        price = 0.0
    return EngagementOut(
        id=row.id,
        organization_id=row.organization_id,
        client_id=row.client_id,
        title=row.title,
        description=row.description,
        price=price,
        currency=row.currency or "USD",
        status=row.status,
        start_date=row.start_date or "",
        due_date=row.due_date or "",
        owner_member_id=row.owner_member_id,
        files=row.files_list(),
        phases=row.phases_list(),
        work_project_id=row.work_project_id or "",
        work_project_key=row.work_project_key or "",
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[ClientOut])
def list_clients(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Client]:
    _ensure_org_member(db, user, organization_id)
    return (
        db.query(Client)
        .filter(Client.organization_id == organization_id)
        .order_by(Client.created_at.desc())
        .all()
    )


@router.get("/{client_id}", response_model=ClientOut)
def get_client(
    client_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Client:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    _ensure_org_member(db, user, client.organization_id)
    return client


@router.post("", response_model=ClientOut, status_code=201)
def create_client(
    payload: ClientCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Client:
    if not user_can_manage_org(db, user, organization_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")

    client = Client(
        organization_id=organization_id,
        name=payload.name.strip(),
        company=payload.company.strip(),
        email=payload.email.strip().lower(),
        phone=payload.phone,
        website=payload.website,
        industry=payload.industry,
        status=payload.status,
        notes=payload.notes,
        internal_owner_member_id=payload.internal_owner_member_id,
    )
    db.add(client)
    db.flush()

    if payload.create_portal_user:
        if not payload.email or not payload.portal_password:
            raise HTTPException(status_code=400, detail="Portal user needs email and password")
        email = payload.email.strip().lower()
        portal_user = db.query(User).filter(User.email == email).first()
        if portal_user is None:
            portal_user = User(
                email=email,
                full_name=payload.name.strip(),
                password_hash=hash_password(payload.portal_password),
                account_type=AccountType.user,
            )
            db.add(portal_user)
            db.flush()
        db.add(
            ClientUser(
                client_id=client.id,
                user_id=portal_user.id,
                status=ClientUserStatus.active,
            )
        )

    db.commit()
    db.refresh(client)
    return client


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: UUID,
    payload: ClientUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Client:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if not user_can_manage_org(db, user, client.organization_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")

    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"] is not None:
        data["email"] = data["email"].strip().lower()
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "company" in data and data["company"] is not None:
        data["company"] = data["company"].strip()
    for key, value in data.items():
        setattr(client, key, value)
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(
    client_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if not user_can_manage_org(db, user, client.organization_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")

    open_count = (
        db.query(Engagement)
        .filter(
            Engagement.client_id == client_id,
            Engagement.status.notin_(["Promoted", "Completed"]),
        )
        .count()
    )
    if open_count:
        raise HTTPException(
            status_code=400,
            detail="Close or promote open engagements before removing this client.",
        )

    db.delete(client)
    db.commit()


@router.post("/{client_id}/portal-users", status_code=201)
def add_portal_user(
    client_id: UUID,
    payload: ClientPortalInvite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if not user_can_manage_org(db, user, client.organization_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")

    email = payload.email.lower().strip()
    portal_user = db.query(User).filter(User.email == email).first()
    if portal_user is None:
        portal_user = User(
            email=email,
            full_name=payload.full_name.strip(),
            password_hash=hash_password(payload.password),
            account_type=AccountType.user,
        )
        db.add(portal_user)
        db.flush()
    else:
        portal_user.full_name = payload.full_name.strip() or portal_user.full_name
        portal_user.password_hash = hash_password(payload.password)

    existing = (
        db.query(ClientUser)
        .filter(ClientUser.client_id == client_id, ClientUser.user_id == portal_user.id)
        .first()
    )
    if existing:
        existing.status = ClientUserStatus.active
    else:
        db.add(ClientUser(client_id=client_id, user_id=portal_user.id, status=ClientUserStatus.active))
    db.commit()
    return {"ok": True, "client_id": str(client_id), "email": email}


@router.get("/{client_id}/engagements", response_model=list[EngagementOut])
def list_client_engagements(
    client_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EngagementOut]:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    _ensure_org_member(db, user, client.organization_id)
    rows = (
        db.query(Engagement)
        .filter(Engagement.client_id == client_id)
        .order_by(Engagement.updated_at.desc())
        .all()
    )
    return [_engagement_out(row) for row in rows]


@router.post("/{client_id}/engagements", response_model=EngagementOut, status_code=201)
def create_engagement(
    client_id: UUID,
    payload: EngagementCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EngagementOut:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if not user_can_manage_org(db, user, client.organization_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    if payload.status not in ENGAGEMENT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid engagement status")

    row = Engagement(
        organization_id=client.organization_id,
        client_id=client.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        price=str(payload.price),
        currency=payload.currency or "USD",
        status=payload.status,
        start_date=payload.start_date or "",
        due_date=payload.due_date or "",
        owner_member_id=payload.owner_member_id,
    )
    row.set_files_list(payload.files or [])
    row.set_phases_list(payload.phases if payload.phases is not None else _default_phases())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _engagement_out(row)


engagements_router = APIRouter(prefix="/engagements", tags=["engagements"])


@engagements_router.get("", response_model=list[EngagementOut])
def list_org_engagements(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EngagementOut]:
    _ensure_org_member(db, user, organization_id)
    rows = (
        db.query(Engagement)
        .filter(Engagement.organization_id == organization_id)
        .order_by(Engagement.updated_at.desc())
        .all()
    )
    return [_engagement_out(row) for row in rows]


@engagements_router.get("/{engagement_id}", response_model=EngagementOut)
def get_engagement(
    engagement_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EngagementOut:
    row = db.get(Engagement, engagement_id)
    if not row:
        raise HTTPException(status_code=404, detail="Engagement not found")
    _ensure_org_member(db, user, row.organization_id)
    return _engagement_out(row)


@engagements_router.patch("/{engagement_id}", response_model=EngagementOut)
def update_engagement(
    engagement_id: UUID,
    payload: EngagementUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EngagementOut:
    row = db.get(Engagement, engagement_id)
    if not row:
        raise HTTPException(status_code=404, detail="Engagement not found")
    if not user_can_manage_org(db, user, row.organization_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")

    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in ENGAGEMENT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid engagement status")
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    if "description" in data and data["description"] is not None:
        data["description"] = data["description"].strip()
    if "price" in data and data["price"] is not None:
        data["price"] = str(data["price"])
    files = data.pop("files", None)
    phases = data.pop("phases", None)
    for key, value in data.items():
        setattr(row, key, value)
    if files is not None:
        row.set_files_list(files)
    if phases is not None:
        row.set_phases_list(phases)
    db.commit()
    db.refresh(row)
    return _engagement_out(row)


@engagements_router.delete("/{engagement_id}", status_code=204)
def delete_engagement(
    engagement_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(Engagement, engagement_id)
    if not row:
        raise HTTPException(status_code=404, detail="Engagement not found")
    if not user_can_manage_org(db, user, row.organization_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    db.delete(row)
    db.commit()
