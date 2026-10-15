"""CompanyOS MCP tool catalog (mirrors client/src/lib/mcp-tools.ts)."""

from __future__ import annotations

from typing import Any

TOOL_DEFAULT_PASSPORT: dict[str, str] = {
    "list_projects": "pp-delivery",
    "list_issues": "pp-delivery",
    "create_project": "pp-delivery",
    "create_issue": "pp-delivery",
    "update_issue_status": "pp-delivery",
    "assign_issue": "pp-delivery",
    "list_candidates": "pp-recruiting",
    "move_candidate_stage": "pp-recruiting",
    "draft_offer": "pp-recruiting",
    "start_onboarding_checklist": "pp-people",
    # Delivery passport (L4) can auto-run knowledge tools; People is L2 draft-only.
    "search_documents": "pp-delivery",
    "ask_company_brain": "pp-delivery",
    "create_client_note": "pp-delivery",
    "summarize_engagement": "pp-delivery",
}

TOOL_META: dict[str, dict[str, Any]] = {
    "ask_company_brain": {
        "description": "Ask a question grounded in company documents and policies (Company Brain + Pinecone).",
    },
    "search_documents": {
        "description": "Search the document vault by keyword / vectors.",
    },
    "list_projects": {
        "description": "List Work Management projects (id, key, name, status).",
    },
    "list_issues": {
        "description": "List tickets/issues, optionally filtered by project id or key.",
    },
    "create_project": {
        "description": "Create a Work Management project from a name, key, and brief.",
    },
    "create_issue": {
        "description": "Create a ticket/issue on a project (projectId may be UUID or project key).",
    },
    "update_issue_status": {
        "description": "Move an issue to a new status (Backlog, In progress, Done, …).",
    },
    "assign_issue": {
        "description": "Assign an issue to a person by name or email.",
    },
    "list_candidates": {
        "description": "List candidates for a job id, optionally filtered by stage.",
    },
    "move_candidate_stage": {
        "description": "Move a candidate to another ATS stage.",
    },
    "draft_offer": {
        "description": "Draft an offer letter package for a candidate (approval-gated).",
    },
    "start_onboarding_checklist": {
        "description": "Draft an onboarding checklist for a new hire.",
    },
    "create_client_note": {
        "description": "Attach an internal note to a client record.",
    },
    "summarize_engagement": {
        "description": "Summarize an engagement’s phases, status, and risks.",
    },
}
