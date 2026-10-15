from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import (
    AccountType,
    ClientInvoiceRow,
    MembershipStatus,
    OrganizationMember,
    User,
)
from app.db.session import get_db

router = APIRouter(prefix="/finance", tags=["finance"])

INVOICE_STATUSES = {"Draft", "Sent", "Paid", "Overdue", "Void"}


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


class ClientInvoiceOut(BaseModel):
    id: str
    organization_id: str
    number: str
    clientId: str
    clientName: str
    engagementId: str
    engagementTitle: str
    issueDate: str
    dueDate: str
    amount: float
    currency: str
    status: str
    lineItems: list[dict[str, Any]] = Field(default_factory=list)


class ClientInvoiceCreate(BaseModel):
    number: str = ""
    clientId: str
    clientName: str = ""
    engagementId: str = ""
    engagementTitle: str = ""
    issueDate: str = ""
    dueDate: str = ""
    amount: float = 0
    currency: str = "USD"
    status: str = "Draft"
    lineItems: list[dict[str, Any]] = Field(default_factory=list)


class ClientInvoiceUpdate(BaseModel):
    number: str | None = None
    clientName: str | None = None
    engagementTitle: str | None = None
    issueDate: str | None = None
    dueDate: str | None = None
    amount: float | None = None
    currency: str | None = None
    status: str | None = None
    lineItems: list[dict[str, Any]] | None = None


def _out(row: ClientInvoiceRow) -> ClientInvoiceOut:
    return ClientInvoiceOut(
        id=str(row.id),
        organization_id=str(row.organization_id),
        number=row.number,
        clientId=row.client_id,
        clientName=row.client_name,
        engagementId=row.engagement_id,
        engagementTitle=row.engagement_title,
        issueDate=row.issue_date,
        dueDate=row.due_date,
        amount=float(row.amount or 0),
        currency=row.currency or "USD",
        status=row.status,
        lineItems=row.line_items_list(),
    )


def _next_number(db: Session, org_id: UUID) -> str:
    count = db.query(ClientInvoiceRow).filter(ClientInvoiceRow.organization_id == org_id).count()
    return f"INV-{2200 + count + 1}"


@router.get("/invoices", response_model=list[ClientInvoiceOut])
def list_invoices(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClientInvoiceOut]:
    _ensure_org_member(db, user, organization_id)
    rows = (
        db.query(ClientInvoiceRow)
        .filter(ClientInvoiceRow.organization_id == organization_id)
        .order_by(ClientInvoiceRow.issue_date.desc(), ClientInvoiceRow.created_at.desc())
        .all()
    )
    return [_out(row) for row in rows]


@router.get("/invoices/{invoice_id}", response_model=ClientInvoiceOut)
def get_invoice(
    invoice_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClientInvoiceOut:
    row = db.get(ClientInvoiceRow, invoice_id)
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _ensure_org_member(db, user, row.organization_id)
    return _out(row)


@router.post("/invoices", response_model=ClientInvoiceOut, status_code=201)
def create_invoice(
    payload: ClientInvoiceCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClientInvoiceOut:
    _ensure_org_member(db, user, organization_id)
    if payload.status not in INVOICE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid invoice status")
    items = payload.lineItems or []
    amount = payload.amount
    if items and not amount:
        amount = sum(float(item.get("amount") or 0) for item in items)
    row = ClientInvoiceRow(
        organization_id=organization_id,
        number=(payload.number or _next_number(db, organization_id)).strip(),
        client_id=payload.clientId,
        client_name=payload.clientName.strip(),
        engagement_id=payload.engagementId,
        engagement_title=payload.engagementTitle.strip(),
        issue_date=payload.issueDate or date.today().isoformat(),
        due_date=payload.dueDate or "",
        amount=amount,
        currency=payload.currency or "USD",
        status=payload.status,
    )
    row.set_line_items_list(items)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.patch("/invoices/{invoice_id}", response_model=ClientInvoiceOut)
def update_invoice(
    invoice_id: UUID,
    payload: ClientInvoiceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClientInvoiceOut:
    row = db.get(ClientInvoiceRow, invoice_id)
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _ensure_org_member(db, user, row.organization_id)
    if payload.number is not None:
        row.number = payload.number.strip()
    if payload.clientName is not None:
        row.client_name = payload.clientName.strip()
    if payload.engagementTitle is not None:
        row.engagement_title = payload.engagementTitle.strip()
    if payload.issueDate is not None:
        row.issue_date = payload.issueDate
    if payload.dueDate is not None:
        row.due_date = payload.dueDate
    if payload.amount is not None:
        row.amount = float(payload.amount)
    if payload.currency is not None:
        row.currency = payload.currency
    if payload.status is not None:
        if payload.status not in INVOICE_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid invoice status")
        row.status = payload.status
    if payload.lineItems is not None:
        row.set_line_items_list(payload.lineItems)
        if payload.amount is None:
            row.amount = sum(float(item.get("amount") or 0) for item in payload.lineItems)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/invoices/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(ClientInvoiceRow, invoice_id)
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _ensure_org_member(db, user, row.organization_id)
    db.delete(row)
    db.commit()
