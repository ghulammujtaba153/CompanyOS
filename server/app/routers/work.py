from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user
from app.db.models import (
    AccountType,
    MembershipStatus,
    OrganizationMember,
    User,
    WorkIssue,
    WorkProject,
    WorkProjectMember,
)
from app.db.session import get_db
from app.schemas.org import (
    WorkIssueCommentCreate,
    WorkIssueCreate,
    WorkIssueOut,
    WorkIssueUpdate,
    WorkProjectCreate,
    WorkProjectMemberCreate,
    WorkProjectMemberOut,
    WorkProjectMemberUpdate,
    WorkProjectOut,
    WorkProjectUpdate,
)

router = APIRouter(tags=["work"])

PROJECT_STATUSES = {"Active", "On hold", "Completed"}
PROJECT_VISIBILITIES = {"Private", "Company"}
ASSIGNABLE_ROLES = {"Admin", "Member", "Viewer"}
ISSUE_STATUSES = {"Backlog", "To do", "In progress", "In review", "Blocked", "Done"}
ISSUE_PRIORITIES = {"Critical", "High", "Medium", "Low"}
ISSUE_TYPES = {"Epic", "Story", "Bug", "Task", "Ticket"}
KEY_RE = re.compile(r"^[A-Z][A-Z0-9]{1,4}$")


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


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%b %d, %Y · %-I:%M %p").replace(" 0", " ")


def _stamp_win() -> str:
    """Locale-safe stamp without %-I (Windows)."""
    now = datetime.now(timezone.utc)
    return now.strftime("%b %d, %Y · %I:%M %p").lstrip("0").replace(" 0", " ")


def _now_label() -> str:
    try:
        return _stamp()
    except ValueError:
        return _stamp_win()


def _date_label() -> str:
    return datetime.now(timezone.utc).strftime("%b %d, %Y")


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if not parts:
        return "?"
    return "".join(p[0] for p in parts)[:2].upper()


def _name_from_email(email: str) -> str:
    local = email.split("@")[0]
    return " ".join(part.capitalize() for part in re.split(r"[._-]+", local) if part)


def _member_out(row: WorkProjectMember) -> WorkProjectMemberOut:
    return WorkProjectMemberOut(
        email=row.email,
        name=row.name,
        role=row.role,
        status=row.status,
        invited_at=row.invited_at or "",
    )


def _project_out(row: WorkProject) -> WorkProjectOut:
    return WorkProjectOut(
        id=row.id,
        organization_id=row.organization_id,
        key=row.key,
        name=row.name,
        team=row.team or "",
        description=row.description or "",
        due=row.due or "",
        status=row.status,
        visibility=row.visibility,
        client_id=row.client_id or "",
        client_engagement_id=row.client_engagement_id or "",
        members=[_member_out(m) for m in row.members],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _issue_out(row: WorkIssue) -> WorkIssueOut:
    comments_raw = row.comments_list()
    activity_raw = row.activity_list()
    return WorkIssueOut(
        id=row.issue_key,
        uuid=row.id,
        organization_id=row.organization_id,
        project_id=row.project_id,
        title=row.title,
        description=row.description or "",
        priority=row.priority,
        status=row.status,
        type=row.type,
        labels=[str(x) for x in row.labels_list()],
        assignee=row.assignee or "Unassigned",
        reporter=row.reporter or "",
        estimate=row.estimate or "",
        due_date=row.due_date or "",
        comments=[
            {
                "id": str(c.get("id", "")),
                "author": str(c.get("author", "")),
                "initials": str(c.get("initials", "")),
                "body": str(c.get("body", "")),
                "created_at": str(c.get("createdAt") or c.get("created_at") or ""),
            }
            for c in comments_raw
            if isinstance(c, dict)
        ],
        activity=[
            {
                "id": str(a.get("id", "")),
                "actor": str(a.get("actor", "")),
                "action": str(a.get("action", "")),
                "created_at": str(a.get("createdAt") or a.get("created_at") or ""),
            }
            for a in activity_raw
            if isinstance(a, dict)
        ],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _load_project(db: Session, project_id: UUID) -> WorkProject | None:
    return (
        db.query(WorkProject)
        .options(joinedload(WorkProject.members))
        .filter(WorkProject.id == project_id)
        .first()
    )


def _project_membership(project: WorkProject, email: str) -> WorkProjectMember | None:
    normalized = email.strip().lower()
    for member in project.members:
        if member.email.lower() == normalized:
            return member
    return None


def _require_project_access(
    db: Session, user: User, project: WorkProject, *, manage: bool = False
) -> WorkProjectMember | None:
    _ensure_org_member(db, user, project.organization_id)
    if user.account_type == AccountType.platform_admin:
        return None
    member = _project_membership(project, user.email)
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    if manage and member.role not in {"Owner", "Admin"}:
        raise HTTPException(status_code=403, detail="Project admin required")
    return member


def _next_issue_key(db: Session, project: WorkProject) -> str:
    rows = db.query(WorkIssue.issue_key).filter(WorkIssue.project_id == project.id).all()
    highest = 100
    for (key,) in rows:
        prefix, _, num = key.partition("-")
        if prefix == project.key:
            try:
                highest = max(highest, int(num))
            except ValueError:
                pass
    return f"{project.key}-{highest + 1}"


def _find_issue(db: Session, issue_ref: str) -> WorkIssue | None:
    try:
        uid = UUID(issue_ref)
        row = db.query(WorkIssue).filter(WorkIssue.id == uid).first()
        if row:
            return row
    except ValueError:
        pass
    return db.query(WorkIssue).filter(WorkIssue.issue_key == issue_ref).first()


# --- Projects -----------------------------------------------------------------


@router.get("/projects", response_model=list[WorkProjectOut])
def list_projects(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WorkProjectOut]:
    _ensure_org_member(db, user, organization_id)
    rows = (
        db.query(WorkProject)
        .options(joinedload(WorkProject.members))
        .filter(WorkProject.organization_id == organization_id)
        .order_by(WorkProject.updated_at.desc())
        .all()
    )
    if user.account_type == AccountType.platform_admin:
        return [_project_out(row) for row in rows]
    email = user.email.lower()
    return [
        _project_out(row)
        for row in rows
        if any(m.email.lower() == email for m in row.members)
    ]


@router.get("/projects/{project_id}", response_model=WorkProjectOut)
def get_project(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkProjectOut:
    row = _load_project(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    _require_project_access(db, user, row)
    return _project_out(row)


@router.post("/projects", response_model=WorkProjectOut, status_code=201)
def create_project(
    payload: WorkProjectCreate,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkProjectOut:
    _ensure_org_member(db, user, organization_id)
    key = payload.key.strip().upper()
    if not KEY_RE.match(key):
        raise HTTPException(
            status_code=400,
            detail="Key must be 2–5 letters or digits, starting with a letter.",
        )
    if payload.visibility not in PROJECT_VISIBILITIES:
        raise HTTPException(status_code=400, detail="Invalid visibility")
    exists = (
        db.query(WorkProject)
        .filter(WorkProject.organization_id == organization_id, WorkProject.key == key)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail=f"Key {key} is already used by another project.")

    row = WorkProject(
        organization_id=organization_id,
        key=key,
        name=payload.name.strip(),
        team=payload.team.strip(),
        description=payload.description.strip(),
        due=payload.due or "",
        status="Active",
        visibility=payload.visibility,
        client_id=payload.client_id or "",
        client_engagement_id=payload.client_engagement_id or "",
    )
    db.add(row)
    db.flush()
    db.add(
        WorkProjectMember(
            project_id=row.id,
            email=user.email.lower(),
            name=user.full_name or _name_from_email(user.email),
            role="Owner",
            status="Active",
        )
    )
    db.commit()
    row = _load_project(db, row.id)
    assert row is not None
    return _project_out(row)


@router.patch("/projects/{project_id}", response_model=WorkProjectOut)
def update_project(
    project_id: UUID,
    payload: WorkProjectUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkProjectOut:
    row = _load_project(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    _require_project_access(db, user, row, manage=True)
    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in PROJECT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid project status")
    if "visibility" in data and data["visibility"] not in PROJECT_VISIBILITIES:
        raise HTTPException(status_code=400, detail="Invalid visibility")
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "team" in data and data["team"] is not None:
        data["team"] = data["team"].strip()
    if "description" in data and data["description"] is not None:
        data["description"] = data["description"].strip()
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    row = _load_project(db, project_id)
    assert row is not None
    return _project_out(row)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = _load_project(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    _require_project_access(db, user, row, manage=True)
    owner = _project_membership(row, user.email)
    if user.account_type != AccountType.platform_admin and (not owner or owner.role != "Owner"):
        raise HTTPException(status_code=403, detail="Only the project owner can delete it")
    db.delete(row)
    db.commit()


@router.post("/projects/{project_id}/members", response_model=WorkProjectOut)
def invite_member(
    project_id: UUID,
    payload: WorkProjectMemberCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkProjectOut:
    row = _load_project(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    _require_project_access(db, user, row, manage=True)
    role = payload.role if payload.role in ASSIGNABLE_ROLES else "Member"
    email = str(payload.email).strip().lower()
    if _project_membership(row, email):
        raise HTTPException(status_code=400, detail="This person is already on the project.")
    name = payload.name.strip() or _name_from_email(email)
    db.add(
        WorkProjectMember(
            project_id=row.id,
            email=email,
            name=name,
            role=role,
            status="Active",
            invited_at="",
        )
    )
    db.commit()
    row = _load_project(db, project_id)
    assert row is not None
    return _project_out(row)


@router.patch("/projects/{project_id}/members/{email}", response_model=WorkProjectOut)
def update_member_role(
    project_id: UUID,
    email: str,
    payload: WorkProjectMemberUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkProjectOut:
    row = _load_project(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    _require_project_access(db, user, row, manage=True)
    if payload.role not in ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    member = _project_membership(row, email)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role == "Owner":
        raise HTTPException(status_code=400, detail="Cannot change the owner role")
    member.role = payload.role
    db.commit()
    row = _load_project(db, project_id)
    assert row is not None
    return _project_out(row)


@router.delete("/projects/{project_id}/members/{email}", response_model=WorkProjectOut)
def remove_member(
    project_id: UUID,
    email: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkProjectOut:
    row = _load_project(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    _require_project_access(db, user, row, manage=True)
    member = _project_membership(row, email)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role == "Owner":
        raise HTTPException(status_code=400, detail="Cannot remove the project owner")
    db.delete(member)
    db.commit()
    row = _load_project(db, project_id)
    assert row is not None
    return _project_out(row)


# --- Issues -------------------------------------------------------------------


@router.get("/issues", response_model=list[WorkIssueOut])
def list_issues(
    organization_id: UUID = Query(...),
    project_id: UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WorkIssueOut]:
    _ensure_org_member(db, user, organization_id)
    projects = (
        db.query(WorkProject)
        .options(joinedload(WorkProject.members))
        .filter(WorkProject.organization_id == organization_id)
        .all()
    )
    if user.account_type != AccountType.platform_admin:
        email = user.email.lower()
        allowed = {p.id for p in projects if any(m.email.lower() == email for m in p.members)}
    else:
        allowed = {p.id for p in projects}
    if project_id:
        if project_id not in allowed:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        allowed = {project_id}
    if not allowed:
        return []
    rows = (
        db.query(WorkIssue)
        .filter(WorkIssue.organization_id == organization_id, WorkIssue.project_id.in_(allowed))
        .order_by(WorkIssue.updated_at.desc())
        .all()
    )
    return [_issue_out(row) for row in rows]


@router.get("/issues/{issue_ref}", response_model=WorkIssueOut)
def get_issue(
    issue_ref: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkIssueOut:
    row = _find_issue(db, issue_ref)
    if not row:
        raise HTTPException(status_code=404, detail="Issue not found")
    project = _load_project(db, row.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _require_project_access(db, user, project)
    return _issue_out(row)


@router.post("/issues", response_model=WorkIssueOut, status_code=201)
def create_issue(
    payload: WorkIssueCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkIssueOut:
    project = _load_project(db, payload.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    member = _require_project_access(db, user, project)
    if member and member.role == "Viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot create issues")
    if payload.status not in ISSUE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid issue status")
    if payload.priority not in ISSUE_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    if payload.type not in ISSUE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid issue type")

    stamp = _now_label()
    actor = user.full_name or user.email
    issue_key = _next_issue_key(db, project)
    row = WorkIssue(
        organization_id=project.organization_id,
        project_id=project.id,
        issue_key=issue_key,
        title=payload.title.strip(),
        description=payload.description.strip(),
        priority=payload.priority,
        status=payload.status,
        type=payload.type,
        assignee=payload.assignee or "Unassigned",
        reporter=actor,
        estimate=payload.estimate or "",
        due_date=payload.due_date or "",
    )
    row.set_labels_list([str(x).strip().lower() for x in payload.labels if str(x).strip()])
    row.set_comments_list([])
    row.set_activity_list(
        [
            {
                "id": f"act-{uuid4().hex[:10]}",
                "actor": actor,
                "action": "created this issue",
                "createdAt": stamp,
            }
        ]
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    if row.assignee and row.assignee != "Unassigned":
        try:
            from app.services import notifications as notif

            recipients = notif.find_users_by_name_or_email(
                db, project.organization_id, row.assignee
            )
            if recipients:
                notif.notify_users(
                    db,
                    organization_id=project.organization_id,
                    recipient_user_ids=recipients,
                    kind="work",
                    title=f"Assigned: {row.issue_key}",
                    body=row.title,
                    href=f"/dashboard/work-management/projects/{project.id}/issues/{row.id}",
                    actor_user_id=user.id,
                    entity_type="issue",
                    entity_id=str(row.id),
                    exclude_user_id=user.id,
                )
        except Exception:
            pass
    return _issue_out(row)


@router.patch("/issues/{issue_ref}", response_model=WorkIssueOut)
def update_issue(
    issue_ref: str,
    payload: WorkIssueUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkIssueOut:
    row = _find_issue(db, issue_ref)
    if not row:
        raise HTTPException(status_code=404, detail="Issue not found")
    project = _load_project(db, row.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    member = _require_project_access(db, user, project)
    if member and member.role == "Viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot edit issues")

    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in ISSUE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid issue status")
    if "priority" in data and data["priority"] not in ISSUE_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    if "type" in data and data["type"] not in ISSUE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid issue type")

    stamp = _now_label()
    actor = user.full_name or user.email
    activity = row.activity_list()

    if "status" in data and data["status"] != row.status:
        activity.insert(
            0,
            {
                "id": f"act-{uuid4().hex[:10]}-status",
                "actor": actor,
                "action": f"moved status to {data['status']}",
                "createdAt": stamp,
            },
        )
    if "assignee" in data and data["assignee"] != row.assignee:
        activity.insert(
            0,
            {
                "id": f"act-{uuid4().hex[:10]}-assignee",
                "actor": actor,
                "action": f"assigned to {data['assignee']}",
                "createdAt": stamp,
            },
        )
    if "type" in data and data["type"] != row.type:
        activity.insert(
            0,
            {
                "id": f"act-{uuid4().hex[:10]}-type",
                "actor": actor,
                "action": f"changed type to {data['type']}",
                "createdAt": stamp,
            },
        )
    if "priority" in data and data["priority"] != row.priority:
        activity.insert(
            0,
            {
                "id": f"act-{uuid4().hex[:10]}-priority",
                "actor": actor,
                "action": f"changed priority to {data['priority']}",
                "createdAt": stamp,
            },
        )

    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    if "description" in data and data["description"] is not None:
        data["description"] = data["description"].strip()
    if "labels" in data:
        row.set_labels_list([str(x).strip().lower() for x in (data.pop("labels") or []) if str(x).strip()])
    if "due_date" in data:
        data["due_date"] = data["due_date"] or ""

    assignee_changed = "assignee" in data and data["assignee"] != row.assignee
    new_assignee = data.get("assignee") if assignee_changed else None

    for key, value in data.items():
        setattr(row, key, value)
    row.set_activity_list(activity)
    db.commit()
    db.refresh(row)
    if assignee_changed and new_assignee:
        try:
            from app.services import notifications as notif

            recipients = notif.find_users_by_name_or_email(
                db, project.organization_id, str(new_assignee)
            )
            if recipients:
                notif.notify_users(
                    db,
                    organization_id=project.organization_id,
                    recipient_user_ids=recipients,
                    kind="work",
                    title=f"Assigned: {row.issue_key}",
                    body=row.title,
                    href=f"/dashboard/work-management/projects/{project.id}/issues/{row.id}",
                    actor_user_id=user.id,
                    entity_type="issue",
                    entity_id=str(row.id),
                    exclude_user_id=user.id,
                )
        except Exception:
            pass
    return _issue_out(row)


@router.delete("/issues/{issue_ref}", status_code=204)
def delete_issue(
    issue_ref: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = _find_issue(db, issue_ref)
    if not row:
        raise HTTPException(status_code=404, detail="Issue not found")
    project = _load_project(db, row.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    member = _require_project_access(db, user, project)
    if member and member.role == "Viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot delete issues")
    db.delete(row)
    db.commit()


@router.post("/issues/{issue_ref}/comments", response_model=WorkIssueOut)
def add_comment(
    issue_ref: str,
    payload: WorkIssueCommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkIssueOut:
    row = _find_issue(db, issue_ref)
    if not row:
        raise HTTPException(status_code=404, detail="Issue not found")
    project = _load_project(db, row.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    member = _require_project_access(db, user, project)
    if member and member.role == "Viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot comment")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment body is required")
    stamp = _now_label()
    actor = user.full_name or user.email
    comments = row.comments_list()
    comments.append(
        {
            "id": f"comment-{uuid4().hex[:10]}",
            "author": actor,
            "initials": _initials(actor),
            "body": body,
            "createdAt": stamp,
        }
    )
    activity = row.activity_list()
    activity.insert(
        0,
        {
            "id": f"act-{uuid4().hex[:10]}-comment",
            "actor": actor,
            "action": "added a comment",
            "createdAt": stamp,
        },
    )
    row.set_comments_list(comments)
    row.set_activity_list(activity)
    db.commit()
    db.refresh(row)
    return _issue_out(row)
