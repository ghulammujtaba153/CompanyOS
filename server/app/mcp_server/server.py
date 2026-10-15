"""
CompanyOS MCP server (stdio).

Attach in Cursor via `.cursor/mcp.json`, then call tools like ask_company_brain.
All mutating calls go through FastAPI `/api/v1/ai/mcp/invoke` + governance.
"""

from __future__ import annotations

from typing import Any

from app.mcp_server.client import get_client


def _call(tool_name: str, args: dict[str, Any], passport_id: str | None = None) -> str:
    client = get_client()
    result = client.invoke(tool_name, args, passport_id=passport_id)
    return client.format_result(result)


def build_server():
    """Create MCPServer (v2) or FastMCP (v1) with CompanyOS tools."""
    try:
        from mcp.server import MCPServer

        mcp = MCPServer(
            "CompanyOS",
            instructions=(
                "CompanyOS operating layer tools. Writes are gated by AI governance passports. "
                "Prefer ask_company_brain for policy questions and search_documents for vault lookup."
            ),
        )
    except ImportError:
        from mcp.server.fastmcp import FastMCP

        mcp = FastMCP("CompanyOS")

    @mcp.tool()
    def ask_company_brain(question: str, passport_id: str = "") -> str:
        """Ask a question grounded in company documents and policies (Company Brain)."""
        return _call("ask_company_brain", {"question": question}, passport_id or None)

    @mcp.tool()
    def search_documents(query: str, passport_id: str = "") -> str:
        """Search the document vault by keyword / vectors."""
        return _call("search_documents", {"query": query}, passport_id or None)

    @mcp.tool()
    def list_projects(passport_id: str = "") -> str:
        """List Work Management projects (id, key, name, status) for ticket creation."""
        return _call("list_projects", {}, passport_id or None)

    @mcp.tool()
    def list_issues(projectId: str = "", passport_id: str = "") -> str:
        """List tickets/issues. Optionally filter by project UUID or key."""
        args: dict[str, Any] = {}
        if projectId:
            args["projectId"] = projectId
        return _call("list_issues", args, passport_id or None)

    @mcp.tool()
    def create_project(
        name: str,
        key: str = "",
        description: str = "",
        team: str = "",
        passport_id: str = "",
    ) -> str:
        """Create a Work Management project. Key is 2–5 chars (optional; derived from name if omitted)."""
        return _call(
            "create_project",
            {"name": name, "key": key, "description": description, "team": team},
            passport_id or None,
        )

    @mcp.tool()
    def create_issue(
        projectId: str,
        title: str,
        description: str = "",
        priority: str = "Medium",
        type: str = "Ticket",
        status: str = "To do",
        assignee: str = "Unassigned",
        passport_id: str = "",
    ) -> str:
        """Create a real ticket/issue on a project. projectId may be UUID or project key (e.g. OPS)."""
        return _call(
            "create_issue",
            {
                "projectId": projectId,
                "title": title,
                "description": description,
                "priority": priority,
                "type": type,
                "status": status,
                "assignee": assignee,
            },
            passport_id or None,
        )

    @mcp.tool()
    def update_issue_status(issueId: str, status: str, passport_id: str = "") -> str:
        """Move an issue to a new status (Backlog, In progress, Done, …)."""
        return _call(
            "update_issue_status",
            {"issueId": issueId, "status": status},
            passport_id or None,
        )

    @mcp.tool()
    def assign_issue(issueId: str, assignee: str, passport_id: str = "") -> str:
        """Assign an issue to a person by name or email."""
        return _call(
            "assign_issue",
            {"issueId": issueId, "assignee": assignee},
            passport_id or None,
        )

    @mcp.tool()
    def list_candidates(jobId: str, stage: str = "", passport_id: str = "") -> str:
        """List candidates for a job id, optionally filtered by stage."""
        args: dict[str, Any] = {"jobId": jobId}
        if stage:
            args["stage"] = stage
        return _call("list_candidates", args, passport_id or None)

    @mcp.tool()
    def move_candidate_stage(candidateId: str, stage: str, passport_id: str = "") -> str:
        """Move a candidate to another ATS stage."""
        return _call(
            "move_candidate_stage",
            {"candidateId": candidateId, "stage": stage},
            passport_id or None,
        )

    @mcp.tool()
    def draft_offer(
        candidateId: str,
        salary: float,
        startDate: str = "",
        passport_id: str = "",
    ) -> str:
        """Draft an offer letter package for a candidate (approval-gated)."""
        args: dict[str, Any] = {"candidateId": candidateId, "salary": salary}
        if startDate:
            args["startDate"] = startDate
        return _call("draft_offer", args, passport_id or None)

    @mcp.tool()
    def start_onboarding_checklist(
        employeeName: str,
        role: str,
        startDate: str = "",
        passport_id: str = "",
    ) -> str:
        """Draft an onboarding checklist for a new hire."""
        args: dict[str, Any] = {"employeeName": employeeName, "role": role}
        if startDate:
            args["startDate"] = startDate
        return _call("start_onboarding_checklist", args, passport_id or None)

    @mcp.tool()
    def create_client_note(clientId: str, note: str, passport_id: str = "") -> str:
        """Attach an internal note to a client record."""
        return _call(
            "create_client_note",
            {"clientId": clientId, "note": note},
            passport_id or None,
        )

    @mcp.tool()
    def summarize_engagement(engagementId: str, passport_id: str = "") -> str:
        """Summarize an engagement’s phases, status, and risks."""
        return _call(
            "summarize_engagement",
            {"engagementId": engagementId},
            passport_id or None,
        )

    @mcp.tool()
    def companyos_status() -> str:
        """Show CompanyOS MCP connection settings (no secrets)."""
        client = get_client()
        return client.format_result(
            {
                "apiUrl": client.api_url,
                "orgIdSet": bool(client.org_id),
                "tokenSet": bool(client._token or (client.email and client.password)),
                "defaultPassport": client.default_passport or "(per-tool default)",
            }
        )

    return mcp


def main() -> None:
    import os

    mcp = build_server()
    transport = (os.environ.get("COMPANYOS_MCP_TRANSPORT") or "stdio").strip().lower()
    if transport in {"http", "streamable-http", "sse"}:
        host = os.environ.get("COMPANYOS_MCP_HOST") or "127.0.0.1"
        port = int(os.environ.get("COMPANYOS_MCP_PORT") or "8765")
        # Cursor / Claude attach via: http://127.0.0.1:8765/mcp
        try:
            mcp.run(transport="streamable-http", host=host, port=port)
        except TypeError:
            # Older FastMCP signature
            mcp.run(transport="streamable-http")
    else:
        mcp.run()


if __name__ == "__main__":
    main()
