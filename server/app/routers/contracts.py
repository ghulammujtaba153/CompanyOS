from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user
from app.db.models import (
    AccountType,
    Client,
    Contract,
    Engagement,
    MembershipStatus,
    OrganizationMember,
    User,
)
from app.db.session import get_db
from app.schemas.org import ContractCreate, ContractOut, ContractUpdate
from app.services.identity import user_can_manage_org

router = APIRouter(prefix="/contracts", tags=["contracts"])

CONTRACT_STATUSES = {"Draft", "Active", "Renewal due", "Expired", "Terminated"}
CONTRACT_MODELS = {"Retainer", "Fixed fee", "Time & materials"}


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


def _contract_out(row: Contract) -> ContractOut:
    try:
        value = float(row.value or 0)
    except ValueError:
        value = 0.0
    client_name = row.client.company if row.client else ""
    return ContractOut(
        id=row.id,
        organization_id=row.organization_id,
        client_id=row.client_id,
        client_name=client_name,
        engagement_id=row.engagement_id,
        title=row.title,
        model=row.model,
        value=value,
        currency=row.currency or "USD",
        start_date=row.start_date or "",
        renewal_date=row.renewal_date or "",
        status=row.status,
        notes=row.notes or "",
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _load_contract(db: Session, contract_id: UUID) -> Contract | None:
    return (
        db.query(Contract)
        .options(joinedload(Contract.client))
        .filter(Contract.id == contract_id)
        .first()
    )


@router.get("", response_model=list[ContractOut])
def list_contracts(
    organization_id: UUID = Query(...),
    client_id: UUID | None = Query(default=None),
    engagement_id: UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ContractOut]:
    _ensure_org_member(db, user, organization_id)
    query = (
        db.query(Contract)
        .options(joinedload(Contract.client))
        .filter(Contract.organization_id == organization_id)
    )
    if client_id:
        query = query.filter(Contract.client_id == client_id)
    if engagement_id:
        query = query.filter(Contract.engagement_id == engagement_id)
    rows = query.order_by(Contract.updated_at.desc()).all()
    return [_contract_out(row) for row in rows]


@router.get("/{contract_id}", response_model=ContractOut)
def get_contract(
    contract_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContractOut:
    row = _load_contract(db, contract_id)
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    _ensure_org_member(db, user, row.organization_id)
    return _contract_out(row)


@router.post("", response_model=ContractOut, status_code=201)
def create_contract(
    payload: ContractCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContractOut:
    if not user_can_manage_org(db, user, organization_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    if payload.status not in CONTRACT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid contract status")
    if payload.model not in CONTRACT_MODELS:
        raise HTTPException(status_code=400, detail="Invalid contract model")

    client = db.get(Client, payload.client_id)
    if not client or client.organization_id != organization_id:
        raise HTTPException(status_code=400, detail="Client not found in this organization")
    engagement = db.get(Engagement, payload.engagement_id)
    if not engagement or engagement.organization_id != organization_id:
        raise HTTPException(status_code=400, detail="Engagement not found in this organization")
    if engagement.client_id != payload.client_id:
        raise HTTPException(status_code=400, detail="Engagement does not belong to this client")

    row = Contract(
        organization_id=organization_id,
        client_id=payload.client_id,
        engagement_id=payload.engagement_id,
        title=payload.title.strip(),
        model=payload.model,
        value=str(payload.value),
        currency=payload.currency or "USD",
        start_date=payload.start_date or "",
        renewal_date=payload.renewal_date or "",
        status=payload.status,
        notes=payload.notes.strip(),
    )
    db.add(row)
    db.commit()
    row = _load_contract(db, row.id)
    assert row is not None
    return _contract_out(row)


@router.patch("/{contract_id}", response_model=ContractOut)
def update_contract(
    contract_id: UUID,
    payload: ContractUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContractOut:
    row = _load_contract(db, contract_id)
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    if not user_can_manage_org(db, user, row.organization_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")

    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in CONTRACT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid contract status")
    if "model" in data and data["model"] not in CONTRACT_MODELS:
        raise HTTPException(status_code=400, detail="Invalid contract model")
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    if "notes" in data and data["notes"] is not None:
        data["notes"] = data["notes"].strip()
    if "value" in data and data["value"] is not None:
        data["value"] = str(data["value"])

    next_client_id = data.get("client_id", row.client_id)
    next_engagement_id = data.get("engagement_id", row.engagement_id)
    if "client_id" in data or "engagement_id" in data:
        client = db.get(Client, next_client_id)
        if not client or client.organization_id != row.organization_id:
            raise HTTPException(status_code=400, detail="Client not found in this organization")
        engagement = db.get(Engagement, next_engagement_id)
        if not engagement or engagement.organization_id != row.organization_id:
            raise HTTPException(status_code=400, detail="Engagement not found in this organization")
        if engagement.client_id != next_client_id:
            raise HTTPException(status_code=400, detail="Engagement does not belong to this client")

    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    row = _load_contract(db, contract_id)
    assert row is not None
    return _contract_out(row)


@router.delete("/{contract_id}", status_code=204)
def delete_contract(
    contract_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(Contract, contract_id)
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    if not user_can_manage_org(db, user, row.organization_id):
        raise HTTPException(status_code=403, detail="Owner or admin required")
    db.delete(row)
    db.commit()
