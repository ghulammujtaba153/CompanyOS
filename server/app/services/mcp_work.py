"""Execute Work Management MCP tools against Neon (projects + tickets/issues)."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    AccountType,
    MembershipStatus,
    OrganizationMember,
    OrgMemberRole,
    User,
    WorkIssue,
    WorkProject,
    WorkProjectMember,
)
from app.routers.work import (
    ISSUE_PRIORITIES,
    ISSUE_STATUSES,
    ISSUE_TYPES,
    KEY_RE,
    _issue_out,
    _next_issue_key,
    _now_label,
    _project_out,
    _find_issue,
    _name_from_email,
)
from app.services import audit_log

PRIORITY_ALIASES = {
    "p0": "Critical",
    "critical": "Critical",
    "p1": "High",
    "high": "High",
    "p2": "Medium",
    "medium": "Medium",
    "p3": "Low",
    "low": "Low",
}

STATUS_ALIASES = {
    "todo": "To do",
    "to do": "To do",
    "to-do": "To do",
    "backlog": "Backlog",
    "in progress": "In progress",
    "inprogress": "In progress",
    "doing": "In progress",
    "in review": "In review",
    "review": "In review",
    "blocked": "Blocked",
    "done": "Done",
    "complete": "Done",
    "completed": "Done",
}

TYPE_ALIASES = {
    "ticket": "Ticket",
    "task": "Task",
    "bug": "Bug",
    "story": "Story",
    "epic": "Epic",
}


def _norm_priority(value: str) -> str:
    raw = (value or "Medium").strip()
    mapped = PRIORITY_ALIASES.get(raw.lower(), raw)
    return mapped if mapped in ISSUE_PRIORITIES else "Medium"


def _norm_status(value: str) -> str:
    raw = (value or "To do").strip()
    mapped = STATUS_ALIASES.get(raw.lower(), raw)
    return mapped if mapped in ISSUE_STATUSES else "To do"


def _norm_type(value: str) -> str:
    raw = (value or "Ticket").strip()
    mapped = TYPE_ALIASES.get(raw.lower(), raw)
    # Accept "Ticket" as first-class; fall back to Task if unknown.
    if mapped in ISSUE_TYPES:
        return mapped
    return "Ticket" if "ticket" in raw.lower() else "Task"


def _org_role(db: Session, user: User, org_id: UUID) -> OrgMemberRole | None:
    if user.account_type == AccountType.platform_admin:
        return OrgMemberRole.owner
    row = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.status == MembershipStatus.active,
        )
        .first()
    )
    return row.role if row else None


def _ensure_project_member(db: Session, user: User, project: WorkProject) -> None:
    """Org owners/admins can act via MCP even if not yet on the project roster."""
    email = user.email.lower()
    existing = next((m for m in project.members if m.email.lower() == email), None)
    if existing:
        return
    role = _org_role(db, user, project.organization_id)
    if role not in {OrgMemberRole.owner, OrgMemberRole.admin} and user.account_type != AccountType.platform_admin:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    db.add(
        WorkProjectMember(
            project_id=project.id,
            email=email,
            name=user.full_name or _name_from_email(user.email),
            role="Admin",
            status="Active",
        )
    )
    db.flush()
    db.refresh(project)


def resolve_project(db: Session, org_id: UUID, project_ref: str) -> WorkProject:
    ref = (project_ref or "").strip()
    if not ref:
        raise HTTPException(status_code=400, detail="projectId is required")
    try:
        uid = UUID(ref)
        row = (
            db.query(WorkProject)
            .options(joinedload(WorkProject.members))
            .filter(WorkProject.id == uid, WorkProject.organization_id == org_id)
            .first()
        )
        if row:
            return row
    except ValueError:
        pass
    key = ref.upper()
    row = (
        db.query(WorkProject)
        .options(joinedload(WorkProject.members))
        .filter(WorkProject.organization_id == org_id, WorkProject.key == key)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_ref}")
    return row


def list_projects(db: Session, org_id: UUID, user: User) -> dict[str, Any]:
    rows = (
        db.query(WorkProject)
        .options(joinedload(WorkProject.members))
        .filter(WorkProject.organization_id == org_id)
        .order_by(WorkProject.updated_at.desc())
        .all()
    )
    role = _org_role(db, user, org_id)
    is_admin = role in {OrgMemberRole.owner, OrgMemberRole.admin} or user.account_type == AccountType.platform_admin
    email = user.email.lower()
    if not is_admin:
        rows = [p for p in rows if any(m.email.lower() == email for m in p.members)]
    data = [
        {
            "id": str(p.id),
            "key": p.key,
            "name": p.name,
            "status": p.status,
            "team": p.team or "",
            "description": (p.description or "")[:200],
        }
        for p in rows
    ]
    return {"ok": True, "message": f"Found {len(data)} project(s).", "data": data}


def list_issues(db: Session, org_id: UUID, user: User, args: dict[str, Any]) -> dict[str, Any]:
    project_ref = str(args.get("projectId") or args.get("project_id") or "").strip()
    q = (
        db.query(WorkIssue)
        .filter(WorkIssue.organization_id == org_id)
        .order_by(WorkIssue.updated_at.desc())
    )
    if project_ref:
        project = resolve_project(db, org_id, project_ref)
        _ensure_project_member(db, user, project)
        q = q.filter(WorkIssue.project_id == project.id)
    rows = q.limit(50).all()
    data = [
        {
            "id": row.issue_key,
            "uuid": str(row.id),
            "projectId": str(row.project_id),
            "title": row.title,
            "status": row.status,
            "priority": row.priority,
            "type": row.type,
            "assignee": row.assignee,
        }
        for row in rows
    ]
    return {"ok": True, "message": f"Found {len(data)} issue(s).", "data": data}


def create_project(db: Session, org_id: UUID, user: User, args: dict[str, Any]) -> dict[str, Any]:
    name = str(args.get("name") or "").strip()
    key = str(args.get("key") or "").strip().upper()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if not KEY_RE.match(key):
        # Derive a key from name when missing/invalid.
        letters = re.sub(r"[^A-Za-z0-9]", "", name.upper())
        key = (letters[:4] or "PROJ")[:5]
        if not KEY_RE.match(key):
            key = f"P{key}"[:5]
        if not KEY_RE.match(key):
            key = "PROJ"
    exists = (
        db.query(WorkProject)
        .filter(WorkProject.organization_id == org_id, WorkProject.key == key)
        .first()
    )
    if exists:
        suffix = 2
        base = key[:4]
        while (
            db.query(WorkProject)
            .filter(WorkProject.organization_id == org_id, WorkProject.key == f"{base}{suffix}"[:5])
            .first()
        ):
            suffix += 1
        key = f"{base}{suffix}"[:5]

    row = WorkProject(
        organization_id=org_id,
        key=key,
        name=name,
        team=str(args.get("team") or "").strip(),
        description=str(args.get("description") or "").strip(),
        due="",
        status="Active",
        visibility="Company",
        client_id="",
        client_engagement_id="",
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
    row = (
        db.query(WorkProject)
        .options(joinedload(WorkProject.members))
        .filter(WorkProject.id == row.id)
        .first()
    )
    assert row is not None
    out = _project_out(row)
    audit_log.record_user_action(
        db,
        organization_id=org_id,
        user=user,
        action="Created project",
        target=f"{out.key} · {out.name}",
        area="Work",
    )
    return {
        "ok": True,
        "message": f"Created project {out.key} — {out.name}.",
        "data": out.model_dump(mode="json"),
    }


def create_issue(db: Session, org_id: UUID, user: User, args: dict[str, Any]) -> dict[str, Any]:
    project_ref = str(args.get("projectId") or args.get("project_id") or "").strip()
    title = str(args.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    project = resolve_project(db, org_id, project_ref)
    _ensure_project_member(db, user, project)

    stamp = _now_label()
    actor = user.full_name or user.email
    issue_key = _next_issue_key(db, project)
    priority = _norm_priority(str(args.get("priority") or "Medium"))
    issue_type = _norm_type(str(args.get("type") or "Ticket"))
    status = _norm_status(str(args.get("status") or "To do"))
    labels_raw = args.get("labels") or []
    labels = [str(x).strip().lower() for x in labels_raw if str(x).strip()] if isinstance(labels_raw, list) else []

    row = WorkIssue(
        organization_id=org_id,
        project_id=project.id,
        issue_key=issue_key,
        title=title[:255],
        description=str(args.get("description") or "").strip(),
        priority=priority,
        status=status,
        type=issue_type,
        assignee=str(args.get("assignee") or "Unassigned").strip() or "Unassigned",
        reporter=actor,
        estimate=str(args.get("estimate") or "").strip(),
        due_date=str(args.get("dueDate") or args.get("due_date") or "").strip(),
    )
    row.set_labels_list(labels)
    row.set_comments_list([])
    row.set_activity_list(
        [
            {
                "id": f"act-{uuid4().hex[:10]}",
                "actor": actor,
                "action": "created this issue via MCP",
                "createdAt": stamp,
            }
        ]
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    out = _issue_out(row)
    audit_log.record_user_action(
        db,
        organization_id=org_id,
        user=user,
        action="Created ticket",
        target=f"{out.id} · {out.title}",
        area="Work",
    )
    return {
        "ok": True,
        "message": f"Created ticket {out.id} on {project.key}: {out.title}",
        "data": out.model_dump(mode="json"),
    }


def update_issue_status(db: Session, org_id: UUID, user: User, args: dict[str, Any]) -> dict[str, Any]:
    issue_ref = str(args.get("issueId") or args.get("issue_id") or "").strip()
    status = _norm_status(str(args.get("status") or ""))
    row = _find_issue(db, issue_ref)
    if not row or row.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Issue not found")
    project = (
        db.query(WorkProject)
        .options(joinedload(WorkProject.members))
        .filter(WorkProject.id == row.project_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _ensure_project_member(db, user, project)

    stamp = _now_label()
    actor = user.full_name or user.email
    activity = row.activity_list()
    activity.insert(
        0,
        {
            "id": f"act-{uuid4().hex[:10]}-status",
            "actor": actor,
            "action": f"moved status to {status} via MCP",
            "createdAt": stamp,
        },
    )
    row.status = status
    row.set_activity_list(activity)
    db.commit()
    db.refresh(row)
    out = _issue_out(row)
    return {"ok": True, "message": f"Moved {out.id} → {status}.", "data": out.model_dump(mode="json")}


def assign_issue(db: Session, org_id: UUID, user: User, args: dict[str, Any]) -> dict[str, Any]:
    issue_ref = str(args.get("issueId") or args.get("issue_id") or "").strip()
    assignee = str(args.get("assignee") or "").strip() or "Unassigned"
    row = _find_issue(db, issue_ref)
    if not row or row.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Issue not found")
    project = (
        db.query(WorkProject)
        .options(joinedload(WorkProject.members))
        .filter(WorkProject.id == row.project_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _ensure_project_member(db, user, project)

    stamp = _now_label()
    actor = user.full_name or user.email
    activity = row.activity_list()
    activity.insert(
        0,
        {
            "id": f"act-{uuid4().hex[:10]}-assignee",
            "actor": actor,
            "action": f"assigned to {assignee} via MCP",
            "createdAt": stamp,
        },
    )
    row.assignee = assignee
    row.set_activity_list(activity)
    db.commit()
    db.refresh(row)
    out = _issue_out(row)
    return {"ok": True, "message": f"Assigned {out.id} to {assignee}.", "data": out.model_dump(mode="json")}


def execute(tool_name: str, db: Session, org_id: UUID, user: User, args: dict[str, Any]) -> dict[str, Any]:
    if tool_name == "list_projects":
        return list_projects(db, org_id, user)
    if tool_name == "list_issues":
        return list_issues(db, org_id, user, args)
    if tool_name == "create_project":
        return create_project(db, org_id, user, args)
    if tool_name == "create_issue":
        return create_issue(db, org_id, user, args)
    if tool_name == "update_issue_status":
        return update_issue_status(db, org_id, user, args)
    if tool_name == "assign_issue":
        return assign_issue(db, org_id, user, args)
    raise HTTPException(status_code=400, detail=f"Unsupported work tool: {tool_name}")
