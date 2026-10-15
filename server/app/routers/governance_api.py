from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import (
    AccountType,
    AgentActionRow,
    AiPassportRow,
    FirewallRuleRow,
    MembershipStatus,
    OrgAiSettings,
    OrganizationMember,
    OrgMemberRole,
    ProcessRow,
    ProcessRunRow,
    User,
)
from app.db.session import get_db
from app.services import governance_engine, process_runtime

router = APIRouter(tags=["governance"])


def _ensure_member(db: Session, user: User, org_id: UUID) -> OrganizationMember | None:
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


def _ensure_admin(db: Session, user: User, org_id: UUID) -> None:
    membership = _ensure_member(db, user, org_id)
    if membership is None:
        return
    if membership.role not in (OrgMemberRole.owner, OrgMemberRole.admin):
        raise HTTPException(status_code=403, detail="Owner or admin required")


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _settings(db: Session, org_id: UUID) -> OrgAiSettings:
    row = db.get(OrgAiSettings, org_id)
    if not row:
        row = OrgAiSettings(organization_id=org_id, default_autonomy=3, default_provider="")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _passport_out(row: AiPassportRow) -> dict[str, Any]:
    return {
        "id": row.client_key or str(row.id),
        "dbId": str(row.id),
        "agent": row.agent,
        "description": row.description,
        "departmentId": row.department_id,
        "ownerId": row.owner_id,
        "autonomy": row.autonomy,
        "capabilityIds": row.capability_ids(),
        "status": row.status,
    }


def _rule_out(row: FirewallRuleRow) -> dict[str, Any]:
    return {
        "id": row.client_key or str(row.id),
        "dbId": str(row.id),
        "capabilityId": row.capability_id,
        "condition": row.condition,
        "threshold": float(row.threshold or 0),
        "risk": row.risk,
        "path": row.path,
        "enabled": bool(row.enabled),
    }


def _action_out(row: AgentActionRow) -> dict[str, Any]:
    try:
        context = json.loads(row.context_json or "{}")
    except Exception:
        context = {}
    try:
        reasons = json.loads(row.reasons_json or "[]")
    except Exception:
        reasons = []
    return {
        "id": str(row.id),
        "passportId": row.passport_id,
        "agent": row.agent,
        "capabilityId": row.capability_id,
        "title": row.title,
        "detail": row.detail,
        "context": context if isinstance(context, dict) else {},
        "status": row.status,
        "risk": row.risk,
        "requiredPath": row.required_path or None,
        "reasons": reasons if isinstance(reasons, list) else [],
        "createdAt": row.created_at,
        "decidedBy": row.decided_by or None,
        "decidedAt": row.decided_at or None,
        "note": row.note or None,
    }


def _process_out(row: ProcessRow) -> dict[str, Any]:
    try:
        context = json.loads(row.context_json or "{}")
    except Exception:
        context = {}
    try:
        steps = json.loads(row.steps_json or "[]")
    except Exception:
        steps = []
    return {
        "id": row.client_key or str(row.id),
        "dbId": str(row.id),
        "name": row.name,
        "description": row.description,
        "departmentId": row.department_id,
        "ownerId": row.owner_id,
        "runsPerWeek": float(row.runs_per_week or 0),
        "context": context if isinstance(context, dict) else {"amount": 0, "external": False, "records": 0},
        "steps": steps if isinstance(steps, list) else [],
    }


class PolicyBundleOut(BaseModel):
    defaultAutonomy: int
    defaultProvider: str = ""
    passports: list[dict[str, Any]] = Field(default_factory=list)
    rules: list[dict[str, Any]] = Field(default_factory=list)


class PassportIn(BaseModel):
    id: str | None = None
    agent: str
    description: str = ""
    departmentId: str = ""
    ownerId: str
    autonomy: int | None = None
    capabilityIds: list[str] = Field(default_factory=list)
    status: str = "Active"


class RuleIn(BaseModel):
    id: str | None = None
    capabilityId: str
    condition: str = "Always"
    threshold: float = 0
    risk: str = "Medium"
    path: str = "Accountable owner"
    enabled: bool = True


class AutonomyIn(BaseModel):
    defaultAutonomy: int
    defaultProvider: str | None = None


class EvaluateIn(BaseModel):
    passportId: str
    capabilityId: str
    context: dict[str, Any] = Field(default_factory=dict)


class ActionIn(BaseModel):
    passportId: str
    capabilityId: str
    title: str
    detail: str = ""
    context: dict[str, Any] = Field(default_factory=dict)
    agent: str = ""


class DecideIn(BaseModel):
    decision: str
    note: str = ""


class KickoffIn(BaseModel):
    context: dict[str, Any] = Field(default_factory=dict)
    autoAdvance: bool = True


class AdvanceIn(BaseModel):
    """Complete the current person step, or resume after an approval decision."""

    forcePerson: bool = True
    note: str = ""


class ProcessIn(BaseModel):
    id: str | None = None
    name: str
    description: str = ""
    departmentId: str = ""
    ownerId: str = ""
    runsPerWeek: float = 1
    context: dict[str, Any] = Field(default_factory=dict)
    steps: list[dict[str, Any]] = Field(default_factory=list)


@router.get("/governance/policy", response_model=PolicyBundleOut)
def get_policy(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PolicyBundleOut:
    _ensure_member(db, user, organization_id)
    settings = _settings(db, organization_id)
    passports = (
        db.query(AiPassportRow).filter(AiPassportRow.organization_id == organization_id).order_by(AiPassportRow.agent).all()
    )
    rules = (
        db.query(FirewallRuleRow)
        .filter(FirewallRuleRow.organization_id == organization_id)
        .order_by(FirewallRuleRow.created_at.asc())
        .all()
    )
    return PolicyBundleOut(
        defaultAutonomy=int(settings.default_autonomy),
        defaultProvider=settings.default_provider or "",
        passports=[_passport_out(row) for row in passports],
        rules=[_rule_out(row) for row in rules],
    )


@router.put("/governance/settings")
def update_settings(
    payload: AutonomyIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_admin(db, user, organization_id)
    if payload.defaultAutonomy < 0 or payload.defaultAutonomy > 5:
        raise HTTPException(status_code=400, detail="Autonomy must be 0–5")
    settings = _settings(db, organization_id)
    settings.default_autonomy = payload.defaultAutonomy
    if payload.defaultProvider is not None:
        settings.default_provider = payload.defaultProvider.strip()
    db.commit()
    return {"defaultAutonomy": settings.default_autonomy, "defaultProvider": settings.default_provider}


@router.post("/governance/passports")
def upsert_passport(
    payload: PassportIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_admin(db, user, organization_id)
    client_key = (payload.id or "").strip() or f"pp-{uuid4().hex[:10]}"
    row = (
        db.query(AiPassportRow)
        .filter(AiPassportRow.organization_id == organization_id, AiPassportRow.client_key == client_key)
        .first()
    )
    if not row:
        row = AiPassportRow(organization_id=organization_id, client_key=client_key)
        db.add(row)
    row.agent = payload.agent.strip()
    row.description = payload.description.strip()
    row.department_id = payload.departmentId
    row.owner_id = payload.ownerId
    row.autonomy = payload.autonomy
    row.status = payload.status if payload.status in {"Active", "Paused"} else "Active"
    row.set_capability_ids(payload.capabilityIds)
    db.commit()
    db.refresh(row)
    return _passport_out(row)


@router.delete("/governance/passports/{passport_id}", status_code=204)
def delete_passport(
    passport_id: str,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    _ensure_admin(db, user, organization_id)
    row = (
        db.query(AiPassportRow)
        .filter(AiPassportRow.organization_id == organization_id, AiPassportRow.client_key == passport_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Passport not found")
    db.delete(row)
    db.commit()


@router.post("/governance/rules")
def upsert_rule(
    payload: RuleIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_admin(db, user, organization_id)
    client_key = (payload.id or "").strip() or f"fr-{uuid4().hex[:10]}"
    row = (
        db.query(FirewallRuleRow)
        .filter(FirewallRuleRow.organization_id == organization_id, FirewallRuleRow.client_key == client_key)
        .first()
    )
    if not row:
        row = FirewallRuleRow(organization_id=organization_id, client_key=client_key)
        db.add(row)
    row.capability_id = payload.capabilityId
    row.condition = payload.condition
    row.threshold = float(payload.threshold or 0)
    row.risk = payload.risk
    row.path = payload.path
    row.enabled = bool(payload.enabled)
    db.commit()
    db.refresh(row)
    return _rule_out(row)


@router.delete("/governance/rules/{rule_id}", status_code=204)
def delete_rule(
    rule_id: str,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    _ensure_admin(db, user, organization_id)
    row = (
        db.query(FirewallRuleRow)
        .filter(FirewallRuleRow.organization_id == organization_id, FirewallRuleRow.client_key == rule_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(row)
    db.commit()


@router.post("/governance/evaluate")
def evaluate_action(
    payload: EvaluateIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_member(db, user, organization_id)
    passport = (
        db.query(AiPassportRow)
        .filter(AiPassportRow.organization_id == organization_id, AiPassportRow.client_key == payload.passportId)
        .first()
    )
    if not passport:
        raise HTTPException(status_code=404, detail="Passport not found")
    rules = [
        _rule_out(row)
        for row in db.query(FirewallRuleRow).filter(FirewallRuleRow.organization_id == organization_id).all()
    ]
    settings = _settings(db, organization_id)
    return governance_engine.evaluate(
        _passport_out(passport),
        payload.capabilityId,
        payload.context or {},
        rules,
        int(settings.default_autonomy),
    )


@router.get("/approvals/actions")
def list_actions(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    _ensure_member(db, user, organization_id)
    rows = (
        db.query(AgentActionRow)
        .filter(AgentActionRow.organization_id == organization_id)
        .order_by(AgentActionRow.created_at.desc())
        .limit(200)
        .all()
    )
    return [_action_out(row) for row in rows]


@router.post("/approvals/actions", status_code=201)
def submit_action(
    payload: ActionIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_member(db, user, organization_id)
    passport = (
        db.query(AiPassportRow)
        .filter(AiPassportRow.organization_id == organization_id, AiPassportRow.client_key == payload.passportId)
        .first()
    )
    if not passport:
        raise HTTPException(status_code=404, detail="Passport not found")
    rules = [
        _rule_out(row)
        for row in db.query(FirewallRuleRow).filter(FirewallRuleRow.organization_id == organization_id).all()
    ]
    decision = governance_engine.evaluate(
        _passport_out(passport),
        payload.capabilityId,
        payload.context or {},
        rules,
        int(_settings(db, organization_id).default_autonomy),
    )
    status_map = {
        "Auto-execute": "Auto-executed",
        "Needs approval": "Pending",
        "Draft only": "Drafted",
        "Blocked": "Blocked",
    }
    row = AgentActionRow(
        organization_id=organization_id,
        passport_id=payload.passportId,
        agent=payload.agent or passport.agent,
        capability_id=payload.capabilityId,
        title=payload.title.strip(),
        detail=payload.detail.strip(),
        status=status_map.get(decision["outcome"], "Pending"),
        risk=(decision.get("matchedRules") or [{}])[0].get("risk", "Medium") if decision.get("matchedRules") else "Medium",
        required_path=str(decision.get("approver") or ""),
        created_at=_now(),
    )
    ctx = dict(payload.context or {})
    ctx["requestedByUserId"] = str(user.id)
    row.context_json = json.dumps(ctx)
    row.reasons_json = json.dumps(decision.get("reasons") or [])
    db.add(row)
    db.commit()
    db.refresh(row)
    if row.status == "Pending":
        try:
            from app.services import notifications as notif

            notif.notify_kind_roles(
                db,
                organization_id=organization_id,
                kind="approval",
                title=f"Approval needed: {row.title}",
                body=row.detail[:240] or f"{row.agent} needs a decision ({row.risk}).",
                href="/dashboard/approvals",
                actor_user_id=user.id,
                entity_type="agent_action",
                entity_id=str(row.id),
                exclude_user_id=user.id,
            )
        except Exception:
            pass
    return _action_out(row)


@router.post("/approvals/actions/{action_id}/decide")
def decide_action(
    action_id: UUID,
    payload: DecideIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    import json

    row = db.get(AgentActionRow, action_id)
    if not row:
        raise HTTPException(status_code=404, detail="Action not found")
    _ensure_member(db, user, row.organization_id)
    if payload.decision not in {"Approved", "Declined"}:
        raise HTTPException(status_code=400, detail="decision must be Approved or Declined")
    if row.status != "Pending":
        raise HTTPException(status_code=400, detail="Action already decided")
    row.status = payload.decision
    row.note = payload.note.strip()
    row.decided_by = str(user.id)
    row.decided_at = _now()

    execution: dict[str, Any] | None = None
    if payload.decision == "Approved":
        try:
            ctx = json.loads(row.context_json or "{}")
        except Exception:
            ctx = {}
        tool_name = str(ctx.get("toolName") or "").strip()
        args = ctx.get("args") if isinstance(ctx.get("args"), dict) else {}
        # Legacy rows: parse tool from title "MCP <tool>"
        if not tool_name and (row.title or "").startswith("MCP "):
            tool_name = row.title[4:].strip()
        if tool_name:
            from app.services import mcp_execute

            try:
                execution = mcp_execute.execute_tool(
                    tool_name=tool_name,
                    db=db,
                    organization_id=row.organization_id,
                    user=user,
                    args=args or {},
                    provider=str(ctx.get("provider") or "") or None,
                )
                row.status = "Auto-executed"
                if execution.get("message"):
                    row.note = ((row.note or "") + f"\nExecuted: {execution['message']}").strip()
            except Exception as exc:
                row.note = ((row.note or "") + f"\nExecution failed: {exc}").strip()
                execution = {"ok": False, "message": str(exc)}

    db.commit()
    db.refresh(row)

    # Resume any process run waiting on this approval.
    try:
        ctx = json.loads(row.context_json or "{}")
        run_key = str(ctx.get("processRunId") or "").strip()
        if run_key:
            run = process_runtime.load_run(db, row.organization_id, run_key)
            if run and run.status == "WaitingApproval":
                process_runtime.advance(db, run=run, user=user, force_person=False)
    except Exception:
        pass

    try:
        from app.services import notifications as notif

        requester = ""
        try:
            ctx = json.loads(row.context_json or "{}")
            requester = str(ctx.get("requestedByUserId") or "")
        except Exception:
            requester = ""
        if requester:
            from uuid import UUID as _UUID

            try:
                rid = _UUID(requester)
                notif.notify_users(
                    db,
                    organization_id=row.organization_id,
                    recipient_user_ids=[rid],
                    kind="approval",
                    title=f"Action {payload.decision.lower()}: {row.title}",
                    body=(payload.note or row.detail or "")[:240] or f"Your request was {payload.decision.lower()}.",
                    href="/dashboard/approvals",
                    actor_user_id=user.id,
                    entity_type="agent_action",
                    entity_id=str(row.id),
                    exclude_user_id=user.id,
                )
            except Exception:
                pass
    except Exception:
        pass
    out = _action_out(row)
    if execution is not None:
        out["execution"] = execution
    return out


@router.get("/processes")
def list_processes(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    _ensure_member(db, user, organization_id)
    rows = (
        db.query(ProcessRow)
        .filter(ProcessRow.organization_id == organization_id)
        .order_by(ProcessRow.name.asc())
        .all()
    )
    if not rows:
        process_runtime.seed_default_processes(db, organization_id)
        rows = (
            db.query(ProcessRow)
            .filter(ProcessRow.organization_id == organization_id)
            .order_by(ProcessRow.name.asc())
            .all()
        )
    return [_process_out(row) for row in rows]


@router.post("/processes", status_code=201)
def upsert_process(
    payload: ProcessIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_admin(db, user, organization_id)
    client_key = (payload.id or "").strip() or f"proc-{uuid4().hex[:10]}"
    row = (
        db.query(ProcessRow)
        .filter(ProcessRow.organization_id == organization_id, ProcessRow.client_key == client_key)
        .first()
    )
    if not row:
        row = ProcessRow(organization_id=organization_id, client_key=client_key)
        db.add(row)
    row.name = payload.name.strip()
    row.description = payload.description.strip()
    row.department_id = payload.departmentId
    row.owner_id = payload.ownerId
    row.runs_per_week = float(payload.runsPerWeek or 0)
    row.context_json = json.dumps(payload.context or {})
    row.steps_json = json.dumps(payload.steps or [])
    db.commit()
    db.refresh(row)
    return _process_out(row)


@router.delete("/processes/{process_id}", status_code=204)
def delete_process(
    process_id: str,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    _ensure_admin(db, user, organization_id)
    row = (
        db.query(ProcessRow)
        .filter(ProcessRow.organization_id == organization_id, ProcessRow.client_key == process_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Process not found")
    db.delete(row)
    db.commit()


def _load_process(db: Session, organization_id: UUID, process_id: str) -> ProcessRow:
    row = (
        db.query(ProcessRow)
        .filter(ProcessRow.organization_id == organization_id, ProcessRow.client_key == process_id)
        .first()
    )
    if row:
        return row
    try:
        pid = UUID(process_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Process not found") from exc
    row = db.get(ProcessRow, pid)
    if not row or row.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Process not found")
    return row


@router.get("/processes/{process_id}/runs")
def list_process_runs(
    process_id: str,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    _ensure_member(db, user, organization_id)
    process = _load_process(db, organization_id, process_id)
    key = process.client_key or str(process.id)
    rows = (
        db.query(ProcessRunRow)
        .filter(
            ProcessRunRow.organization_id == organization_id,
            ProcessRunRow.process_client_key == key,
        )
        .order_by(ProcessRunRow.created_at.desc())
        .limit(50)
        .all()
    )
    return [process_runtime.run_out(row) for row in rows]


@router.post("/processes/{process_id}/runs", status_code=201)
def kickoff_process_run(
    process_id: str,
    payload: KickoffIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_member(db, user, organization_id)
    process = _load_process(db, organization_id, process_id)
    run = process_runtime.kickoff(
        db,
        organization_id=organization_id,
        process=process,
        user=user,
        context_override=payload.context or None,
        auto_advance=bool(payload.autoAdvance),
    )
    return process_runtime.run_out(run)


@router.get("/process-runs/{run_id}")
def get_process_run(
    run_id: str,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_member(db, user, organization_id)
    run = process_runtime.load_run(db, organization_id, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return process_runtime.run_out(run)


@router.post("/process-runs/{run_id}/advance")
def advance_process_run(
    run_id: str,
    payload: AdvanceIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_member(db, user, organization_id)
    run = process_runtime.load_run(db, organization_id, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    force = bool(payload.forcePerson) if run.status == "WaitingPerson" else False
    run = process_runtime.advance(
        db,
        run=run,
        user=user,
        force_person=force,
        note=payload.note or "",
    )
    return process_runtime.run_out(run)


@router.post("/process-runs/{run_id}/cancel")
def cancel_process_run(
    run_id: str,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_member(db, user, organization_id)
    run = process_runtime.load_run(db, organization_id, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status in {"Completed", "Failed", "Cancelled"}:
        raise HTTPException(status_code=400, detail=f"Run is already {run.status}")
    run.status = "Cancelled"
    db.commit()
    db.refresh(run)
    return process_runtime.run_out(run)


@router.post("/governance/seed-defaults")
def seed_defaults(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Seed default passports/rules/processes when org has none."""
    _ensure_admin(db, user, organization_id)
    existing = db.query(AiPassportRow).filter(AiPassportRow.organization_id == organization_id).count()
    processes_seeded = process_runtime.seed_default_processes(db, organization_id)
    if existing:
        return {"seeded": False, "passports": existing, "processes": processes_seeded}
    defaults = [
        {
            "id": "pp-recruiting",
            "agent": "Recruiting Agent",
            "description": "Sources, screens, and schedules candidates for open roles.",
            "departmentId": "dep-people",
            "ownerId": "",
            "autonomy": 3,
            "capabilityIds": [
                "candidate.read",
                "interview.schedule",
                "calendar.invite",
                "offer.send",
                "email.external",
                "document.search",
            ],
            "status": "Active",
        },
        {
            "id": "pp-finance",
            "agent": "Finance Agent",
            "description": "Processes invoices, flags exceptions, and pays approved vendors.",
            "departmentId": "dep-finance",
            "ownerId": "",
            "autonomy": 4,
            "capabilityIds": ["invoice.read", "payment.prepare", "payment.execute"],
            "status": "Active",
        },
        {
            "id": "pp-people",
            "agent": "People Ops Agent",
            "description": "Drafts onboarding plans and keeps leave records up to date.",
            "departmentId": "dep-people",
            "ownerId": "",
            "autonomy": 2,
            "capabilityIds": ["onboarding.draft", "leave.update", "calendar.invite", "brain.ask", "document.search"],
            "status": "Active",
        },
        {
            "id": "pp-delivery",
            "agent": "Delivery Agent",
            "description": "Creates projects and issues from briefs; triages delivery work.",
            "departmentId": "dep-engineering",
            "ownerId": "",
            "autonomy": 4,
            "capabilityIds": ["project.create", "issue.create", "issue.update", "brain.ask", "document.search"],
            "status": "Active",
        },
    ]
    owner_fallback = str(user.id)
    for item in defaults:
        row = AiPassportRow(
            organization_id=organization_id,
            client_key=item["id"],
            agent=item["agent"],
            description=item["description"],
            department_id=item["departmentId"],
            owner_id=item["ownerId"] or owner_fallback,
            autonomy=item["autonomy"],
            status=item["status"],
        )
        row.set_capability_ids(item["capabilityIds"])
        db.add(row)
    rules = [
        {"id": "fr-offer", "capabilityId": "offer.send", "condition": "Always", "threshold": 0, "risk": "High", "path": "Executive"},
        {"id": "fr-payment", "capabilityId": "payment.execute", "condition": "Amount over", "threshold": 500, "risk": "Medium", "path": "Department head"},
        {"id": "fr-payment-big", "capabilityId": "payment.execute", "condition": "Amount over", "threshold": 10000, "risk": "High", "path": "Executive"},
        {"id": "fr-bank", "capabilityId": "vendor.bank_change", "condition": "Always", "threshold": 0, "risk": "Critical", "path": "Block"},
        # Project create allowed for L4 Delivery agent (MCP can open projects without a human hop).
        {"id": "fr-project", "capabilityId": "project.create", "condition": "Always", "threshold": 0, "risk": "Low", "path": "Auto-execute"},
        {"id": "fr-issue-bulk", "capabilityId": "issue.create", "condition": "Records over", "threshold": 5, "risk": "Medium", "path": "Department head"},
    ]
    for item in rules:
        row = FirewallRuleRow(
            organization_id=organization_id,
            client_key=item["id"],
            capability_id=item["capabilityId"],
            condition=item["condition"],
            threshold=item["threshold"],
            risk=item["risk"],
            path=item["path"],
            enabled=True,
        )
        db.add(row)
    _settings(db, organization_id)
    db.commit()
    return {
        "seeded": True,
        "passports": len(defaults),
        "rules": len(rules),
        "processes": processes_seeded,
    }
