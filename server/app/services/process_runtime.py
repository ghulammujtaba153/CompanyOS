"""Kick off and advance process runs; bridge agent steps to approvals."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models import (
    AgentActionRow,
    AiPassportRow,
    FirewallRuleRow,
    OrgAiSettings,
    ProcessRow,
    ProcessRunRow,
    User,
)
from app.services import governance_engine, notifications as notif


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _default_autonomy(db: Session, org_id: UUID) -> int:
    settings = db.get(OrgAiSettings, org_id)
    return int(settings.default_autonomy) if settings else 3


def _passport_dict(row: AiPassportRow) -> dict[str, Any]:
    return {
        "id": row.client_key or str(row.id),
        "agent": row.agent,
        "description": row.description,
        "departmentId": row.department_id,
        "ownerId": row.owner_id,
        "autonomy": row.autonomy,
        "capabilityIds": row.capability_ids(),
        "status": row.status,
    }


def _rule_dict(row: FirewallRuleRow) -> dict[str, Any]:
    return {
        "id": row.client_key or str(row.id),
        "capabilityId": row.capability_id,
        "condition": row.condition,
        "threshold": float(row.threshold or 0),
        "risk": row.risk,
        "path": row.path,
        "enabled": bool(row.enabled),
    }


def run_out(row: ProcessRunRow) -> dict[str, Any]:
    return {
        "id": row.client_key or str(row.id),
        "dbId": str(row.id),
        "processId": row.process_client_key,
        "processName": row.process_name,
        "status": row.status,
        "currentStepIndex": int(row.current_step_index or 0),
        "context": row.context_dict(),
        "steps": row.steps_list(),
        "stepResults": row.results_list(),
        "startedBy": row.started_by,
        "note": row.note or "",
        "createdAt": row.created_at.isoformat() if row.created_at else "",
        "updatedAt": row.updated_at.isoformat() if row.updated_at else "",
    }


def load_run(db: Session, organization_id: UUID, run_ref: str) -> ProcessRunRow | None:
    row = (
        db.query(ProcessRunRow)
        .filter(
            ProcessRunRow.organization_id == organization_id,
            ProcessRunRow.client_key == run_ref,
        )
        .first()
    )
    if row:
        return row
    try:
        rid = UUID(run_ref)
    except Exception:
        return None
    row = db.get(ProcessRunRow, rid)
    if row and row.organization_id == organization_id:
        return row
    return None


def seed_default_processes(db: Session, organization_id: UUID) -> int:
    """Insert starter process definitions when the org has none."""
    existing = db.query(ProcessRow).filter(ProcessRow.organization_id == organization_id).count()
    if existing:
        return 0
    catalog = [
        {
            "id": "proc-purchase",
            "name": "Purchase approvals",
            "description": "From a team's purchase request to the vendor being paid.",
            "departmentId": "dep-finance",
            "ownerId": "",
            "runsPerWeek": 25,
            "context": {"amount": 1200, "records": 0, "external": True},
            "steps": [
                {
                    "id": "s1",
                    "name": "Review purchase request",
                    "performer": {"kind": "agent", "passportId": "pp-finance"},
                    "capabilityId": "invoice.read",
                    "durationMin": 10,
                    "waitHours": 4,
                },
                {
                    "id": "s2",
                    "name": "Match invoice to request",
                    "performer": {"kind": "agent", "passportId": "pp-finance"},
                    "capabilityId": "invoice.read",
                    "durationMin": 15,
                    "waitHours": 6,
                },
                {
                    "id": "s3",
                    "name": "Prepare payment",
                    "performer": {"kind": "agent", "passportId": "pp-finance"},
                    "capabilityId": "payment.prepare",
                    "durationMin": 20,
                    "waitHours": 4,
                },
                {
                    "id": "s4",
                    "name": "Execute payment",
                    "performer": {"kind": "agent", "passportId": "pp-finance"},
                    "capabilityId": "payment.execute",
                    "durationMin": 10,
                    "waitHours": 8,
                },
            ],
        },
        {
            "id": "proc-scheduling",
            "name": "Candidate scheduling",
            "description": "Getting a screened candidate onto the right interviewers' calendars.",
            "departmentId": "dep-people",
            "ownerId": "",
            "runsPerWeek": 30,
            "context": {"amount": 0, "records": 0, "external": True},
            "steps": [
                {
                    "id": "s1",
                    "name": "Review candidate profile",
                    "performer": {"kind": "agent", "passportId": "pp-recruiting"},
                    "capabilityId": "candidate.read",
                    "durationMin": 15,
                    "waitHours": 24,
                },
                {
                    "id": "s2",
                    "name": "Find interviewer availability",
                    "performer": {"kind": "agent", "passportId": "pp-recruiting"},
                    "capabilityId": "interview.schedule",
                    "durationMin": 20,
                    "waitHours": 4,
                },
                {
                    "id": "s3",
                    "name": "Send calendar invite",
                    "performer": {"kind": "agent", "passportId": "pp-recruiting"},
                    "capabilityId": "calendar.invite",
                    "durationMin": 5,
                    "waitHours": 2,
                },
                {
                    "id": "s4",
                    "name": "Brief interviewers",
                    "performer": {"kind": "person", "employeeId": ""},
                    "capabilityId": "",
                    "durationMin": 10,
                    "waitHours": 1,
                },
            ],
        },
        {
            "id": "proc-onboarding",
            "name": "Employee onboarding",
            "description": "Everything between a signed offer and a productive first week.",
            "departmentId": "dep-people",
            "ownerId": "",
            "runsPerWeek": 2,
            "context": {"amount": 0, "records": 0, "external": False},
            "steps": [
                {
                    "id": "s1",
                    "name": "Draft onboarding plan",
                    "performer": {"kind": "agent", "passportId": "pp-people"},
                    "capabilityId": "onboarding.draft",
                    "durationMin": 45,
                    "waitHours": 24,
                },
                {
                    "id": "s2",
                    "name": "Create accounts",
                    "performer": {"kind": "person", "employeeId": ""},
                    "capabilityId": "",
                    "durationMin": 30,
                    "waitHours": 24,
                },
                {
                    "id": "s3",
                    "name": "Order laptop",
                    "performer": {"kind": "person", "employeeId": ""},
                    "capabilityId": "",
                    "durationMin": 20,
                    "waitHours": 48,
                },
                {
                    "id": "s4",
                    "name": "Schedule first-week meetings",
                    "performer": {"kind": "agent", "passportId": "pp-people"},
                    "capabilityId": "calendar.invite",
                    "durationMin": 25,
                    "waitHours": 4,
                },
            ],
        },
        {
            "id": "proc-delivery",
            "name": "Client brief → delivery board",
            "description": "Turn a client brief into a project and first issues under Delivery Agent.",
            "departmentId": "dep-engineering",
            "ownerId": "",
            "runsPerWeek": 8,
            "context": {"amount": 0, "records": 2, "external": False},
            "steps": [
                {
                    "id": "s1",
                    "name": "Create project from brief",
                    "performer": {"kind": "agent", "passportId": "pp-delivery"},
                    "capabilityId": "project.create",
                    "durationMin": 20,
                    "waitHours": 2,
                },
                {
                    "id": "s2",
                    "name": "Open initial issues",
                    "performer": {"kind": "agent", "passportId": "pp-delivery"},
                    "capabilityId": "issue.create",
                    "durationMin": 25,
                    "waitHours": 1,
                },
                {
                    "id": "s3",
                    "name": "Triage priorities with PM",
                    "performer": {"kind": "person", "employeeId": ""},
                    "capabilityId": "",
                    "durationMin": 30,
                    "waitHours": 4,
                },
            ],
        },
    ]
    for item in catalog:
        row = ProcessRow(
            organization_id=organization_id,
            client_key=item["id"],
            name=item["name"],
            description=item["description"],
            department_id=item["departmentId"],
            owner_id=item["ownerId"],
            runs_per_week=float(item["runsPerWeek"]),
        )
        row.context_json = json.dumps(item["context"])
        row.steps_json = json.dumps(item["steps"])
        db.add(row)
    db.commit()
    return len(catalog)


def kickoff(
    db: Session,
    *,
    organization_id: UUID,
    process: ProcessRow,
    user: User,
    context_override: dict[str, Any] | None = None,
    auto_advance: bool = True,
) -> ProcessRunRow:
    try:
        steps = json.loads(process.steps_json or "[]")
    except Exception:
        steps = []
    if not isinstance(steps, list) or not steps:
        raise HTTPException(status_code=400, detail="Process has no steps to run")
    try:
        base_ctx = json.loads(process.context_json or "{}")
    except Exception:
        base_ctx = {}
    if not isinstance(base_ctx, dict):
        base_ctx = {}
    ctx = {**base_ctx, **(context_override or {})}

    run = ProcessRunRow(
        organization_id=organization_id,
        client_key=f"run-{uuid4().hex[:10]}",
        process_client_key=process.client_key or str(process.id),
        process_name=process.name,
        status="Running",
        current_step_index=0,
        started_by=str(user.id),
    )
    run.set_context(ctx)
    run.set_steps(steps)
    run.set_results([])
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        notif.notify_kind_roles(
            db,
            organization_id=organization_id,
            kind="governance",
            title=f"Process started: {process.name}",
            body=f"Run {run.client_key} kicked off by {user.full_name or user.email}.",
            href=f"/dashboard/processes/{process.client_key}",
            actor_user_id=user.id,
            entity_type="process_run",
            entity_id=run.client_key,
            exclude_user_id=user.id,
        )
    except Exception:
        pass

    if auto_advance:
        run = advance(db, run=run, user=user, force_person=False)
    return run


def _complete_step(
    results: list[dict[str, Any]],
    step: dict[str, Any],
    *,
    status: str,
    detail: str = "",
    action_id: str = "",
    decision: str = "",
) -> list[dict[str, Any]]:
    entry = {
        "stepId": str(step.get("id") or ""),
        "name": str(step.get("name") or ""),
        "status": status,
        "detail": detail,
        "actionId": action_id,
        "decision": decision,
        "at": _now(),
    }
    # replace if already present for this step
    out = [r for r in results if r.get("stepId") != entry["stepId"]]
    out.append(entry)
    return out


def advance(
    db: Session,
    *,
    run: ProcessRunRow,
    user: User,
    force_person: bool = False,
    note: str = "",
) -> ProcessRunRow:
    if run.status in {"Completed", "Failed", "Cancelled"}:
        raise HTTPException(status_code=400, detail=f"Run is already {run.status}")

    steps = run.steps_list()
    results = run.results_list()
    idx = int(run.current_step_index or 0)

    # Resume after approval wait
    if run.status == "WaitingApproval":
        pending = next((r for r in reversed(results) if r.get("status") == "WaitingApproval"), None)
        action_id = str((pending or {}).get("actionId") or "")
        if not action_id:
            raise HTTPException(status_code=400, detail="No approval linked to this run")
        try:
            aid = UUID(action_id)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid approval id") from exc
        action = db.get(AgentActionRow, aid)
        if not action:
            raise HTTPException(status_code=404, detail="Linked approval not found")
        if action.status == "Pending":
            raise HTTPException(status_code=400, detail="Still waiting for approval")
        if action.status in {"Declined", "Blocked"}:
            results = _complete_step(
                results,
                steps[idx] if idx < len(steps) else {},
                status="Failed",
                detail=f"Approval {action.status.lower()}",
                action_id=action_id,
                decision=action.status,
            )
            run.set_results(results)
            run.status = "Failed"
            run.note = ((run.note or "") + f"\n{note}".strip()).strip()
            db.commit()
            db.refresh(run)
            return run
        # Approved / Auto-executed / Drafted → complete current step and continue
        results = _complete_step(
            results,
            steps[idx] if idx < len(steps) else {},
            status="Completed",
            detail=f"Approval {action.status}",
            action_id=action_id,
            decision=action.status,
        )
        idx += 1
        run.current_step_index = idx
        run.status = "Running"
        run.set_results(results)
        db.commit()
        db.refresh(run)

    # Drain auto-exec agent / person steps
    while idx < len(steps) and run.status == "Running":
        step = steps[idx] if isinstance(steps[idx], dict) else {}
        performer = step.get("performer") if isinstance(step.get("performer"), dict) else {}
        kind = str(performer.get("kind") or "person")
        name = str(step.get("name") or f"Step {idx + 1}")

        # Person step (or agent without a capability): wait for an operator unless forced.
        if kind != "agent" or not str(step.get("capabilityId") or "").strip():
            if not force_person:
                results = _complete_step(
                    results,
                    step,
                    status="WaitingPerson",
                    detail="Waiting for a person to complete this step",
                )
                run.set_results(results)
                run.status = "WaitingPerson"
                run.current_step_index = idx
                db.commit()
                db.refresh(run)
                return run
            results = _complete_step(
                results,
                step,
                status="Completed",
                detail=(note.strip() or "Completed by operator"),
            )
            idx += 1
            run.current_step_index = idx
            run.set_results(results)
            run.status = "Running"
            if idx >= len(steps):
                run.status = "Completed"
            db.commit()
            db.refresh(run)
            force_person = False
            continue

        # Agent step → governance + optional approval
        passport_id = str(performer.get("passportId") or "")
        capability_id = str(step.get("capabilityId") or "")
        passport = (
            db.query(AiPassportRow)
            .filter(
                AiPassportRow.organization_id == run.organization_id,
                AiPassportRow.client_key == passport_id,
            )
            .first()
        )
        if not passport or passport.status != "Active":
            results = _complete_step(
                results, step, status="Failed", detail="Agent passport missing or inactive"
            )
            run.set_results(results)
            run.status = "Failed"
            db.commit()
            db.refresh(run)
            return run

        rules = [
            _rule_dict(r)
            for r in db.query(FirewallRuleRow)
            .filter(FirewallRuleRow.organization_id == run.organization_id)
            .all()
        ]
        decision = governance_engine.evaluate(
            _passport_dict(passport),
            capability_id,
            run.context_dict(),
            rules,
            _default_autonomy(db, run.organization_id),
        )
        outcome = str(decision.get("outcome") or "Blocked")
        status_map = {
            "Auto-execute": "Auto-executed",
            "Needs approval": "Pending",
            "Draft only": "Drafted",
            "Blocked": "Blocked",
        }
        action = AgentActionRow(
            organization_id=run.organization_id,
            passport_id=passport_id,
            agent=passport.agent,
            capability_id=capability_id,
            title=f"{run.process_name}: {name}",
            detail=f"Process run {run.client_key} · step {idx + 1}/{len(steps)}",
            status=status_map.get(outcome, "Pending"),
            risk=(decision.get("matchedRules") or [{}])[0].get("risk", "Medium")
            if decision.get("matchedRules")
            else "Medium",
            required_path=str(decision.get("approver") or ""),
            created_at=_now(),
        )
        ctx = dict(run.context_dict())
        ctx["processRunId"] = run.client_key
        ctx["processId"] = run.process_client_key
        ctx["stepId"] = str(step.get("id") or "")
        ctx["requestedByUserId"] = str(user.id)
        action.context_json = json.dumps(ctx)
        action.reasons_json = json.dumps(decision.get("reasons") or [])
        db.add(action)
        db.commit()
        db.refresh(action)

        if outcome == "Needs approval":
            results = _complete_step(
                results,
                step,
                status="WaitingApproval",
                detail="Queued for human approval",
                action_id=str(action.id),
                decision=outcome,
            )
            run.set_results(results)
            run.status = "WaitingApproval"
            run.current_step_index = idx
            db.commit()
            db.refresh(run)
            try:
                notif.notify_kind_roles(
                    db,
                    organization_id=run.organization_id,
                    kind="approval",
                    title=f"Process needs approval: {name}",
                    body=f"{run.process_name} · run {run.client_key}",
                    href="/dashboard/approvals",
                    actor_user_id=user.id,
                    entity_type="process_run",
                    entity_id=run.client_key,
                    exclude_user_id=user.id,
                )
            except Exception:
                pass
            return run

        if outcome == "Blocked":
            results = _complete_step(
                results,
                step,
                status="Failed",
                detail="; ".join(decision.get("reasons") or ["Blocked by policy"]),
                action_id=str(action.id),
                decision=outcome,
            )
            run.set_results(results)
            run.status = "Failed"
            run.current_step_index = idx
            db.commit()
            db.refresh(run)
            return run

        # Auto-execute or Draft only → step done
        results = _complete_step(
            results,
            step,
            status="Completed",
            detail=outcome,
            action_id=str(action.id),
            decision=outcome,
        )
        idx += 1
        run.current_step_index = idx
        run.set_results(results)
        if idx >= len(steps):
            run.status = "Completed"
        db.commit()
        db.refresh(run)

    if idx >= len(steps) and run.status == "Running":
        run.status = "Completed"
        db.commit()
        db.refresh(run)
    return run
