"""Shared MCP tool execution used by auto-execute and post-approval replay."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models import User
from app.services import mcp_people, mcp_work

WORK_TOOLS = {
    "list_projects",
    "list_issues",
    "create_project",
    "create_issue",
    "update_issue_status",
    "assign_issue",
}

PEOPLE_TOOLS = {
    "list_candidates",
    "move_candidate_stage",
    "draft_offer",
    "start_onboarding_checklist",
    "create_client_note",
    "summarize_engagement",
}


def execute_tool(
    *,
    tool_name: str,
    db: Session,
    organization_id: UUID,
    user: User,
    args: dict[str, Any],
    provider: str | None = None,
) -> dict[str, Any]:
    """Run a governed tool. Returns { message, data }."""
    args = args or {}

    if tool_name == "ask_company_brain":
        from app.routers.ai_platform import BrainAskIn, brain_ask

        ask = brain_ask(
            BrainAskIn(
                question=str(args.get("question") or ""),
                provider=provider,
                projectId=str(args.get("projectId") or "") or None,
            ),
            organization_id=organization_id,
            user=user,
            db=db,
        )
        return {"message": "Company Brain answered.", "data": ask.model_dump()}

    if tool_name == "search_documents":
        from app.routers.ai_platform import _search_docs

        _docs, _retrieval, hits = _search_docs(
            db,
            organization_id,
            str(args.get("query") or ""),
            5,
            project_id=str(args.get("projectId") or "") or None,
            user=user,
        )
        data = [
            {
                "docId": str(h.get("document_id") or ""),
                "title": h.get("name"),
                "category": h.get("category"),
                "excerpt": str(h.get("text") or "")[:200],
                "score": h.get("score"),
            }
            for h in hits
        ]
        return {"message": f"Found {len(data)} document hit(s).", "data": data}

    if tool_name in WORK_TOOLS:
        executed = mcp_work.execute(tool_name, db, organization_id, user, args)
        return {
            "message": str(executed.get("message") or "Executed."),
            "data": executed.get("data"),
        }
    if tool_name in PEOPLE_TOOLS:
        executed = mcp_people.execute(tool_name, db, organization_id, user, args)
        return {
            "message": str(executed.get("message") or "Executed."),
            "data": executed.get("data"),
        }
    raise HTTPException(status_code=400, detail=f"Unknown tool: {tool_name}")
