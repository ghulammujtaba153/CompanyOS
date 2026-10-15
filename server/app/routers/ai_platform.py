from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import get_settings
from app.db.models import (
    AccountType,
    AgentActionRow,
    AiPassportRow,
    FirewallRuleRow,
    MembershipStatus,
    OrgAiSettings,
    OrganizationMember,
    User,
    VaultDocumentRow,
)
from app.db.session import get_db
from app.services import governance_engine, llm, mcp_execute, pinecone_store

router = APIRouter(prefix="/ai", tags=["ai"])


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


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _tokenize(text: str) -> list[str]:
    return [t for t in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split() if len(t) > 2]


def _search_docs_keyword(db: Session, org_id: UUID, question: str, top_k: int = 5) -> list[VaultDocumentRow]:
    tokens = _tokenize(question)
    rows = (
        db.query(VaultDocumentRow)
        .filter(VaultDocumentRow.organization_id == org_id, VaultDocumentRow.status != "Archived")
        .order_by(VaultDocumentRow.uploaded_at.desc())
        .limit(200)
        .all()
    )
    scored: list[tuple[int, VaultDocumentRow]] = []
    for row in rows:
        hay = f"{row.name} {row.category} {row.body}".lower()
        score = 0
        for token in tokens:
            if token in hay:
                score += 2
            if token in row.name.lower():
                score += 3
        if score:
            scored.append((score, row))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [row for _, row in scored[:top_k]]


def _viewer_may_see(doc: VaultDocumentRow, user: User | None) -> bool:
    """Lightweight share ACL: Everyone / empty / owner name / viewer identity."""
    shared = (doc.shared_with or "").strip().lower()
    if not shared or shared in {"everyone", "project team", "people ops", "managers+", "leadership"}:
        return True
    if not user:
        return True
    identity = {(user.full_name or "").strip().lower(), (user.email or "").strip().lower()}
    identity.discard("")
    if any(token and token in shared for token in identity):
        return True
    owner = (doc.owner_name or "").strip().lower()
    return bool(owner and owner in identity)


def _search_docs(
    db: Session,
    org_id: UUID,
    question: str,
    top_k: int = 5,
    *,
    project_id: str | None = None,
    user: User | None = None,
) -> tuple[list[VaultDocumentRow], str, list[dict[str, Any]]]:
    """
    Hybrid LlamaIndex + lexical retrieval; fall back to keyword scoring.
    Returns (docs, mode, vector_hits).
    """
    from app.services import llama_retrieval

    hits = llama_retrieval.retrieve(
        organization_id=org_id,
        question=question,
        top_k=top_k * 3,
        project_id=project_id,
        db=db,
        hybrid=True,
    )
    if hits:
        ordered_ids: list[UUID] = []
        seen: set[str] = set()
        for hit in hits:
            doc_id = hit.get("document_id") or ""
            if not doc_id or doc_id in seen:
                continue
            seen.add(doc_id)
            try:
                ordered_ids.append(UUID(doc_id))
            except Exception:
                continue
            if len(ordered_ids) >= top_k:
                break
        docs: list[VaultDocumentRow] = []
        if ordered_ids:
            rows = (
                db.query(VaultDocumentRow)
                .filter(
                    VaultDocumentRow.organization_id == org_id,
                    VaultDocumentRow.id.in_(ordered_ids),
                    VaultDocumentRow.status != "Archived",
                )
                .all()
            )
            by_id = {row.id: row for row in rows}
            docs = [by_id[doc_id] for doc_id in ordered_ids if doc_id in by_id]
            docs = [doc for doc in docs if _viewer_may_see(doc, user)]
            allowed = {str(doc.id) for doc in docs}
            hits = [h for h in hits if not h.get("document_id") or str(h.get("document_id")) in allowed]
        modes = {str(h.get("retrieval") or "") for h in hits}
        if "hybrid" in modes:
            mode = "hybrid"
        elif "llamaindex" in modes:
            mode = "llamaindex"
        else:
            mode = "pinecone"
        return docs, mode, hits[: max(1, min(8, top_k * 2))]
    return _search_docs_keyword(db, org_id, question, top_k), "keyword", []


def _snippet(body: str, tokens: list[str]) -> str:
    lower = body.lower()
    idx = -1
    for token in tokens:
        idx = lower.find(token)
        if idx >= 0:
            break
    if idx < 0:
        return body[:160] + ("…" if len(body) > 160 else "")
    start = max(0, idx - 40)
    end = min(len(body), idx + 140)
    return f"{'…' if start else ''}{body[start:end]}{'…' if end < len(body) else ''}"


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


def _default_autonomy(db: Session, org_id: UUID) -> int:
    settings = db.get(OrgAiSettings, org_id)
    return int(settings.default_autonomy) if settings else 3


class ProvidersOut(BaseModel):
    defaultProvider: str
    providers: list[dict[str, Any]]
    configured: bool


class BrainAskIn(BaseModel):
    question: str
    top_k: int = 4
    provider: str | None = None
    projectId: str | None = None


class BrainCitation(BaseModel):
    title: str
    docId: str
    excerpt: str


class BrainAskOut(BaseModel):
    answer: str
    citations: list[BrainCitation] = Field(default_factory=list)
    confidence: str
    mode: str
    retrieval: str = "keyword"  # hybrid | llamaindex | pinecone | keyword
    provider: str = ""
    model: str = ""
    traceId: str = ""


class WorkDraftIn(BaseModel):
    kind: str = "issue"  # issue | standup | triage
    prompt: str = ""
    projectId: str = ""
    projectName: str = ""
    issues: list[dict[str, Any]] = Field(default_factory=list)
    assignees: list[str] = Field(default_factory=list)
    provider: str | None = None


class WorkDraftOut(BaseModel):
    kind: str
    title: str = ""
    description: str = ""
    type: str = "Task"
    priority: str = "Medium"
    labels: list[str] = Field(default_factory=list)
    estimate: str = ""
    rationale: str = ""
    body: str = ""
    suggestions: list[dict[str, Any]] = Field(default_factory=list)
    provider: str = ""
    model: str = ""


class McpInvokeIn(BaseModel):
    toolName: str
    args: dict[str, Any] = Field(default_factory=dict)
    passportId: str
    provider: str | None = None


class McpInvokeOut(BaseModel):
    toolName: str
    decision: dict[str, Any]
    result: dict[str, Any]
    approvalId: str = ""


@router.get("/providers", response_model=ProvidersOut)
def list_providers() -> ProvidersOut:
    settings = get_settings()
    return ProvidersOut(
        defaultProvider=settings.ai_default_provider or "openai",
        providers=llm.available_providers(),
        configured=settings.ai_configured,
    )


@router.get("/vectors/status")
def vectors_status() -> dict[str, Any]:
    from app.services import langgraph_brain, llama_retrieval

    payload = pinecone_store.status()
    payload["retrieval"] = llama_retrieval.status()
    payload["answer"] = langgraph_brain.status()
    return payload


@router.post("/vectors/reindex")
def vectors_reindex(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Re-embed and upsert all active vault documents for an organization into Pinecone."""
    _ensure_org_member(db, user, organization_id)
    if not pinecone_store.ready():
        raise HTTPException(
            status_code=400,
            detail="Pinecone + embedding provider required. Set PINECONE_API_KEY and OPENAI_API_KEY or GEMINI_API_KEY.",
        )
    rows = (
        db.query(VaultDocumentRow)
        .filter(VaultDocumentRow.organization_id == organization_id, VaultDocumentRow.status != "Archived")
        .all()
    )
    indexed = 0
    errors: list[str] = []
    for row in rows:
        result = pinecone_store.upsert_document(
            organization_id=organization_id,
            document_id=row.id,
            name=row.name,
            category=row.category,
            body=row.body or "",
            status=row.status,
            project_id=row.project_id,
        )
        if result.get("ok"):
            indexed += 1
        elif result.get("error"):
            errors.append(f"{row.name}: {result['error']}")
    return {
        "ok": True,
        "total": len(rows),
        "indexed": indexed,
        "errors": errors[:10],
        "pinecone": pinecone_store.status(),
    }


class RagEvalIn(BaseModel):
    provider: str | None = None
    projectId: str | None = None
    withAnswers: bool = True


@router.post("/eval/run")
def rag_eval_run(
    payload: RagEvalIn | None = None,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Run golden-set RAG eval (retrieval hit rate, citations, faithfulness)."""
    from app.services import rag_eval

    _ensure_org_member(db, user, organization_id)
    body = payload or RagEvalIn()
    project_id = (body.projectId or "").strip() or None

    def _answer_fn(question: str, hits: list[dict[str, Any]]) -> dict[str, Any]:
        from app.services import langgraph_brain

        docs: list[VaultDocumentRow] = []
        ordered: list[UUID] = []
        for hit in hits:
            raw = hit.get("document_id") or ""
            if not raw:
                continue
            try:
                ordered.append(UUID(str(raw)))
            except Exception:
                continue
        if ordered:
            rows = (
                db.query(VaultDocumentRow)
                .filter(
                    VaultDocumentRow.organization_id == organization_id,
                    VaultDocumentRow.id.in_(ordered),
                )
                .all()
            )
            by_id = {row.id: row for row in rows}
            docs = [by_id[i] for i in ordered if i in by_id]
        snippets = [
            {
                "id": str(doc.id),
                "name": doc.name,
                "body": doc.body or "",
                "excerpt": (doc.body or "")[:160],
            }
            for doc in docs
        ]
        return langgraph_brain.answer(
            question=question,
            retrieval="hybrid",
            vector_hits=hits,
            doc_snippets=snippets,
            provider=body.provider,
            top_k=4,
        )

    return rag_eval.run_eval(
        db=db,
        organization_id=organization_id,
        provider=body.provider,
        project_id=project_id,
        answer_fn=_answer_fn if body.withAnswers else None,
    )


@router.post("/brain/ask", response_model=BrainAskOut)
def brain_ask(
    payload: BrainAskIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BrainAskOut:
    from uuid import uuid4

    from app.services import audit_log, langgraph_brain

    _ensure_org_member(db, user, organization_id)
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    project_id = (payload.projectId or "").strip() or None
    docs, retrieval, vector_hits = _search_docs(
        db,
        organization_id,
        question,
        max(1, min(8, payload.top_k)),
        project_id=project_id,
        user=user,
    )
    tokens = _tokenize(question)
    doc_snippets = [
        {
            "id": str(doc.id),
            "name": doc.name,
            "body": doc.body or "",
            "excerpt": _snippet(doc.body or "", tokens),
        }
        for doc in docs
    ]
    result = langgraph_brain.answer(
        question=question,
        retrieval=retrieval,
        vector_hits=vector_hits,
        doc_snippets=doc_snippets,
        provider=payload.provider,
        top_k=max(1, min(8, payload.top_k)),
    )
    citations = [
        BrainCitation(
            title=str(item.get("title") or "Document"),
            docId=str(item.get("docId") or ""),
            excerpt=str(item.get("excerpt") or "")[:200],
        )
        for item in (result.get("citations") or [])
    ]
    trace_id = uuid4().hex[:16]
    cite_ids = ",".join(c.docId for c in citations[:6] if c.docId)
    audit_log.record_user_action(
        db,
        organization_id=organization_id,
        user=user,
        action=f"Brain ask [{trace_id}] ({retrieval}/{result.get('mode')})",
        target=(question[:120] + (f" · cites:{cite_ids}" if cite_ids else ""))[:255],
        area="AI",
    )
    return BrainAskOut(
        answer=str(result.get("answer") or ""),
        citations=citations,
        confidence=str(result.get("confidence") or "low"),
        mode=str(result.get("mode") or "rag-local"),
        retrieval=str(result.get("retrieval") or retrieval),
        provider=str(result.get("provider") or ""),
        model=str(result.get("model") or ""),
        traceId=trace_id,
    )


@router.post("/work/draft", response_model=WorkDraftOut)
def work_draft(
    payload: WorkDraftIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkDraftOut:
    _ensure_org_member(db, user, organization_id)
    kind = payload.kind if payload.kind in {"issue", "standup", "triage"} else "issue"

    if llm.resolve_provider(payload.provider):
        try:
            if kind == "standup":
                issues_txt = "\n".join(
                    f"- {i.get('title')} [{i.get('status')}] assignee={i.get('assignee')}"
                    for i in payload.issues[:20]
                ) or "No issues"
                result = llm.chat(
                    system="You write crisp daily standup notes for a software delivery team.",
                    user=(
                        f"Project: {payload.projectName or payload.projectId}\n"
                        f"Issues:\n{issues_txt}\n\nWrite standup markdown with Done / Doing / Blockers."
                    ),
                    provider=payload.provider,
                )
                return WorkDraftOut(
                    kind="standup",
                    title="Daily standup draft",
                    body=result["text"],
                    provider=result["provider"],
                    model=result["model"],
                )
            if kind == "triage":
                result = llm.chat(
                    system="You triage a software backlog. Return JSON with key suggestions (array of objects with issueId,title,suggestedPriority,suggestedAssignee,suggestedDue,rationale).",
                    user=json_dumps_safe({"issues": payload.issues[:12], "assignees": payload.assignees}),
                    provider=payload.provider,
                    json_mode=True,
                )
                data = llm.parse_json_object(result["text"])
                suggestions = data.get("suggestions") if isinstance(data.get("suggestions"), list) else []
                return WorkDraftOut(
                    kind="triage",
                    title="Triage suggestion",
                    suggestions=suggestions,
                    body=result["text"],
                    provider=result["provider"],
                    model=result["model"],
                )
            result = llm.chat(
                system=(
                    "Draft a work issue from a client brief. Return JSON with keys: "
                    "title, description, type (Bug|Story|Task), priority (Critical|High|Medium|Low), "
                    "labels (string array), estimate, rationale."
                ),
                user=payload.prompt or "Untitled request",
                provider=payload.provider,
                json_mode=True,
            )
            data = llm.parse_json_object(result["text"])
            return WorkDraftOut(
                kind="issue",
                title=str(data.get("title") or "Untitled issue")[:120],
                description=str(data.get("description") or ""),
                type=str(data.get("type") or "Task"),
                priority=str(data.get("priority") or "Medium"),
                labels=[str(x) for x in (data.get("labels") or [])][:5],
                estimate=str(data.get("estimate") or ""),
                rationale=str(data.get("rationale") or ""),
                provider=result["provider"],
                model=result["model"],
            )
        except Exception:
            pass

    # Local heuristic fallback
    prompt = payload.prompt.strip()
    lower = prompt.lower()
    if kind == "standup":
        lines = [
            f"• {i.get('title')} — {i.get('status')} ({i.get('assignee')})"
            for i in payload.issues[:8]
            if i.get("status") in {"In progress", "Blocked", "In review"}
        ] or ["• No active issues in scope."]
        return WorkDraftOut(kind="standup", title="Daily standup draft", body="Standup notes\n\n" + "\n".join(lines))
    if kind == "triage":
        return WorkDraftOut(
            kind="triage",
            title="Triage suggestion",
            body=f"Suggested triage for: {prompt or 'incoming item'}",
            suggestions=[],
        )
    issue_type = "Bug" if any(w in lower for w in ("bug", "broken", "error")) else "Story" if "feature" in lower else "Task"
    priority = "Critical" if any(w in lower for w in ("urgent", "asap", "p0")) else "High" if "important" in lower else "Medium"
    title = (prompt.split("\n")[0].replace("Subject:", "").strip() or "Follow up from client brief")[:80]
    return WorkDraftOut(
        kind="issue",
        title=title,
        description=f"## Context\n{prompt}\n\n## Acceptance criteria\n- [ ] Clarified\n- [ ] Delivered\n- [ ] Client notified",
        type=issue_type,
        priority=priority,
        labels=["delivery"],
        estimate="1d" if priority in {"Critical", "High"} else "2d",
        rationale=f"Classified as {issue_type} / {priority} locally (configure OpenAI or Gemini for richer drafts).",
    )


def json_dumps_safe(value: Any) -> str:
    import json

    return json.dumps(value, default=str)


TOOL_CAPABILITIES = {
    "ask_company_brain": "brain.ask",
    "search_documents": "document.search",
    "list_projects": "document.search",
    "list_issues": "issue.create",
    "create_project": "project.create",
    "create_issue": "issue.create",
    "update_issue_status": "issue.update",
    "assign_issue": "issue.update",
    "list_candidates": "candidate.read",
    "move_candidate_stage": "candidate.read",
    "draft_offer": "offer.send",
    "start_onboarding_checklist": "onboarding.draft",
    "create_client_note": "crm.sync",
    "summarize_engagement": "document.search",
}

@router.post("/mcp/invoke", response_model=McpInvokeOut)
def mcp_invoke(
    payload: McpInvokeIn,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> McpInvokeOut:
    _ensure_org_member(db, user, organization_id)
    capability = TOOL_CAPABILITIES.get(payload.toolName)
    if not capability:
        raise HTTPException(status_code=400, detail="Unknown MCP tool")

    passport_row = (
        db.query(AiPassportRow)
        .filter(
            AiPassportRow.organization_id == organization_id,
            AiPassportRow.client_key == payload.passportId,
        )
        .first()
    )
    if not passport_row:
        maybe_id = _maybe_uuid(payload.passportId)
        if maybe_id:
            passport_row = db.get(AiPassportRow, maybe_id)
            if passport_row and passport_row.organization_id != organization_id:
                passport_row = None
    if not passport_row:
        # Allow ephemeral passport from client id when not yet synced.
        raise HTTPException(status_code=404, detail="Passport not found. Sync governance passports first.")

    rules = [
        _rule_dict(row)
        for row in db.query(FirewallRuleRow).filter(FirewallRuleRow.organization_id == organization_id).all()
    ]
    decision = governance_engine.evaluate(
        _passport_dict(passport_row),
        capability,
        _tool_context(payload.toolName, payload.args),
        rules,
        _default_autonomy(db, organization_id),
    )

    import json

    if decision["outcome"] == "Needs approval":
        action = AgentActionRow(
            organization_id=organization_id,
            passport_id=_passport_dict(passport_row)["id"],
            agent=passport_row.agent,
            capability_id=capability,
            title=f"MCP {payload.toolName}",
            detail=str(payload.args)[:500],
            status="Pending",
            risk=(decision.get("matchedRules") or [{}])[0].get("risk", "Medium") if decision.get("matchedRules") else "Medium",
            required_path=str(decision.get("approver") or "Accountable owner"),
            created_at=_now(),
        )
        ctx = _tool_context(payload.toolName, payload.args)
        ctx["toolName"] = payload.toolName
        ctx["args"] = payload.args or {}
        ctx["provider"] = payload.provider
        ctx["requestedByUserId"] = str(user.id)
        action.context_json = json.dumps(ctx)
        action.reasons_json = json.dumps(decision.get("reasons") or [])
        db.add(action)
        db.commit()
        db.refresh(action)
        try:
            from app.services import notifications as notif

            notif.notify_kind_roles(
                db,
                organization_id=organization_id,
                kind="approval",
                title=f"Approval needed: {payload.toolName}",
                body=f"{passport_row.agent} requested “{payload.toolName}” ({action.risk} risk).",
                href="/dashboard/approvals",
                actor_user_id=user.id,
                entity_type="agent_action",
                entity_id=str(action.id),
                exclude_user_id=user.id,
            )
        except Exception:
            pass
        return McpInvokeOut(
            toolName=payload.toolName,
            decision=decision,
            result={
                "ok": True,
                "mode": decision["outcome"],
                "message": "Queued for approval.",
                "data": {"actionId": str(action.id)},
            },
            approvalId=str(action.id),
        )

    if decision["outcome"] in {"Blocked", "Draft only"}:
        return McpInvokeOut(
            toolName=payload.toolName,
            decision=decision,
            result={
                "ok": decision["outcome"] == "Draft only",
                "mode": decision["outcome"],
                "message": "; ".join(decision.get("reasons") or [decision["outcome"]]),
            },
        )

    executed = mcp_execute.execute_tool(
        tool_name=payload.toolName,
        db=db,
        organization_id=organization_id,
        user=user,
        args=payload.args or {},
        provider=payload.provider,
    )
    return McpInvokeOut(
        toolName=payload.toolName,
        decision=decision,
        result={
            "ok": True,
            "mode": "Auto-execute",
            "message": executed.get("message") or "Executed.",
            "data": executed.get("data"),
        },
    )


def _maybe_uuid(value: str) -> UUID | None:
    try:
        return UUID(value)
    except Exception:
        return None


def _tool_context(tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
    records = args.get("count")
    if not isinstance(records, (int, float)):
        records = len(args.get("issues") or []) if tool_name == "create_issue" else 1
    amount = args.get("amount") if isinstance(args.get("amount"), (int, float)) else args.get("salary")
    if not isinstance(amount, (int, float)):
        amount = 0
    external = bool(args.get("external")) or tool_name in {"draft_offer"} or TOOL_CAPABILITIES.get(tool_name) in {
        "offer.send",
        "email.external",
    }
    return {"amount": float(amount), "external": external, "records": int(records)}
