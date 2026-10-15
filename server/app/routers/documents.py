from __future__ import annotations

from datetime import date
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import (
    AccountType,
    MembershipStatus,
    OrganizationMember,
    User,
    VaultDocumentRow,
    WorkProject,
)
from app.db.session import get_db
from app.services import audit_log, cloudinary_assets, document_extract, pinecone_store

router = APIRouter(prefix="/documents", tags=["documents"])


def _index_doc(row: VaultDocumentRow) -> None:
    pinecone_store.upsert_document(
        organization_id=row.organization_id,
        document_id=row.id,
        name=row.name,
        category=row.category,
        body=row.body or "",
        status=row.status,
        project_id=row.project_id,
    )

DOCUMENT_CATEGORIES = {"HR", "Contract", "Policy", "Personal", "Offer", "Project"}
DOCUMENT_STATUSES = {"Active", "Archived", "Pending review"}
MAX_DOC_BYTES = 12 * 1024 * 1024


def _resolve_project(db: Session, organization_id: UUID, project_id: UUID | None) -> UUID | None:
    if project_id is None:
        return None
    project = db.get(WorkProject, project_id)
    if not project or project.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project.id


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


def _today() -> str:
    return date.today().isoformat()


def _size_label(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{max(1, round(num_bytes / 1024))} KB"
    return f"{round(num_bytes / (1024 * 1024), 1)} MB"


class DocumentOut(BaseModel):
    id: str
    organization_id: str
    projectId: str | None = None
    name: str
    category: str
    ownerName: str
    sizeLabel: str
    uploadedAt: str
    sharedWith: str
    status: str
    body: str
    fileUrl: str = ""


class DocumentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: str = "HR"
    ownerName: str = ""
    sizeLabel: str = ""
    sharedWith: str = ""
    status: str = "Pending review"
    body: str = ""
    fileUrl: str = ""
    projectId: UUID | None = None


class DocumentUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    ownerName: str | None = None
    sizeLabel: str | None = None
    sharedWith: str | None = None
    status: str | None = None
    body: str | None = None
    projectId: UUID | None = None


def _doc_out(row: VaultDocumentRow) -> DocumentOut:
    return DocumentOut(
        id=str(row.id),
        organization_id=str(row.organization_id),
        projectId=str(row.project_id) if row.project_id else None,
        name=row.name,
        category=row.category,
        ownerName=row.owner_name,
        sizeLabel=row.size_label,
        uploadedAt=row.uploaded_at,
        sharedWith=row.shared_with,
        status=row.status,
        body=row.body or "",
        fileUrl=row.file_url or "",
    )


def _owner_display(user: User, membership: OrganizationMember | None) -> str:
    if user.full_name and user.full_name.strip():
        return user.full_name.strip()
    if membership and membership.title:
        return membership.title
    return user.email


@router.get("", response_model=list[DocumentOut])
def list_documents(
    organization_id: UUID = Query(...),
    category: str | None = Query(default=None),
    project_id: UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DocumentOut]:
    _ensure_org_member(db, user, organization_id)
    query = db.query(VaultDocumentRow).filter(VaultDocumentRow.organization_id == organization_id)
    if project_id is not None:
        _resolve_project(db, organization_id, project_id)
        query = query.filter(VaultDocumentRow.project_id == project_id)
    if category and category != "All":
        if category not in DOCUMENT_CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        query = query.filter(VaultDocumentRow.category == category)
    rows = query.order_by(VaultDocumentRow.uploaded_at.desc(), VaultDocumentRow.created_at.desc()).all()
    needle = (q or "").strip().lower()
    if needle:
        rows = [
            row
            for row in rows
            if needle in row.name.lower()
            or needle in (row.owner_name or "").lower()
            or needle in (row.shared_with or "").lower()
            or needle in (row.body or "").lower()
        ]
    return [_doc_out(row) for row in rows]


@router.post("", response_model=DocumentOut, status_code=201)
def create_document(
    payload: DocumentCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentOut:
    membership = _ensure_org_member(db, user, organization_id)
    if payload.category not in DOCUMENT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    if payload.status not in DOCUMENT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    linked_project = _resolve_project(db, organization_id, payload.projectId)
    row = VaultDocumentRow(
        organization_id=organization_id,
        project_id=linked_project,
        name=payload.name.strip(),
        category=payload.category,
        owner_name=(payload.ownerName or _owner_display(user, membership)).strip(),
        size_label=payload.sizeLabel.strip() or "—",
        uploaded_at=_today(),
        shared_with=payload.sharedWith.strip() or ("Project team" if linked_project else "People Ops"),
        status=payload.status,
        body=payload.body.strip(),
        file_url=payload.fileUrl.strip(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _index_doc(row)
    audit_log.record_user_action(
        db,
        organization_id=organization_id,
        user=user,
        action="Created document",
        target=row.name,
        area="Documents",
    )
    return _doc_out(row)


@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(
    organization_id: UUID = Query(...),
    file: UploadFile = File(...),
    name: str = Form(""),
    category: str = Form("HR"),
    sharedWith: str = Form("People Ops"),
    body: str = Form(""),
    status: str = Form("Pending review"),
    projectId: str = Form(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentOut:
    membership = _ensure_org_member(db, user, organization_id)
    if category not in DOCUMENT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    if status not in DOCUMENT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    linked_project: UUID | None = None
    if projectId.strip():
        try:
            linked_project = _resolve_project(db, organization_id, UUID(projectId.strip()))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid projectId") from exc

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > MAX_DOC_BYTES:
        raise HTTPException(status_code=400, detail="File must be 12 MB or smaller")

    display_name = (name or file.filename or "Uploaded document").strip()
    extracted = document_extract.extract_bytes(
        raw,
        filename=file.filename or display_name,
        content_type=file.content_type,
    )
    searchable_body = extracted.combined_body(user_notes=body or "", filename=display_name)

    file_url = ""
    file_public_id = ""
    try:
        uploaded = cloudinary_assets.upload_document(
            file=BytesIO(raw),
            organization_id=str(organization_id),
            filename=file.filename,
        )
        file_url = uploaded.get("file_url") or ""
        file_public_id = uploaded.get("file_public_id") or ""
    except RuntimeError as exc:
        # Still store metadata if Cloudinary is not configured — vault remains usable.
        if "CLOUDINARY" not in str(exc).upper() and "cloudinary" not in str(exc).lower():
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}") from exc

    row = VaultDocumentRow(
        organization_id=organization_id,
        project_id=linked_project,
        name=display_name,
        category=category,
        owner_name=_owner_display(user, membership),
        size_label=_size_label(len(raw)),
        uploaded_at=_today(),
        shared_with=(sharedWith or ("Project team" if linked_project else "People Ops")).strip(),
        status=status,
        body=searchable_body,
        file_url=file_url,
        file_public_id=file_public_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _index_doc(row)
    audit_log.record_user_action(
        db,
        organization_id=organization_id,
        user=user,
        action="Uploaded document",
        target=row.name,
        area="Documents",
    )
    return _doc_out(row)


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(
    document_id: UUID,
    payload: DocumentUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentOut:
    row = db.get(VaultDocumentRow, document_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    _ensure_org_member(db, user, row.organization_id)
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.category is not None:
        if payload.category not in DOCUMENT_CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        row.category = payload.category
    if payload.ownerName is not None:
        row.owner_name = payload.ownerName.strip()
    if payload.sizeLabel is not None:
        row.size_label = payload.sizeLabel.strip()
    if payload.sharedWith is not None:
        row.shared_with = payload.sharedWith.strip()
    if payload.status is not None:
        if payload.status not in DOCUMENT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        row.status = payload.status
    if payload.body is not None:
        row.body = payload.body.strip()
    if payload.projectId is not None:
        row.project_id = _resolve_project(db, row.organization_id, payload.projectId)
    db.commit()
    db.refresh(row)
    _index_doc(row)
    action = "Archived document" if row.status == "Archived" else "Updated document"
    audit_log.record_user_action(
        db,
        organization_id=row.organization_id,
        user=user,
        action=action,
        target=row.name,
        area="Documents",
    )
    return _doc_out(row)


@router.delete("/{document_id}", status_code=204)
def delete_document(
    document_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(VaultDocumentRow, document_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    _ensure_org_member(db, user, row.organization_id)
    if row.file_public_id:
        cloudinary_assets.delete_document(row.file_public_id)
    org_id = row.organization_id
    name = row.name
    db.delete(row)
    db.commit()
    pinecone_store.delete_document(organization_id=org_id, document_id=document_id)
    audit_log.record_user_action(
        db,
        organization_id=org_id,
        user=user,
        action="Deleted document",
        target=name,
        area="Documents",
    )
