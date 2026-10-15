/**
 * CompanyOS MCP tool catalog.
 * External ChatGPT/Claude clients will call these tool names via an MCP server.
 * Mutating tools map to governance capability ids and must pass `evaluate()`.
 */

export type McpToolKind = "read" | "write"

export type McpToolDef = {
  name: string
  description: string
  kind: McpToolKind
  /** Governance capability required for writes (and some sensitive reads). */
  capabilityId: string
  /** Suggested passport that owns this tool in demos. */
  defaultPassportId: string
  inputSchema: {
    type: "object"
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
  /** Demo example args for the playground. */
  exampleArgs: Record<string, unknown>
}

export const mcpTools: McpToolDef[] = [
  {
    name: "list_projects",
    description: "List Work Management projects (id, key, name, status) before creating tickets.",
    kind: "read",
    capabilityId: "document.search",
    defaultPassportId: "pp-delivery",
    inputSchema: { type: "object", properties: {} },
    exampleArgs: {},
  },
  {
    name: "list_issues",
    description: "List tickets/issues, optionally filtered by project UUID or key.",
    kind: "read",
    capabilityId: "issue.create",
    defaultPassportId: "pp-delivery",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Optional project UUID or key" },
      },
    },
    exampleArgs: { projectId: "OPS" },
  },
  {
    name: "create_project",
    description: "Create a Work Management project from a name, key, and brief.",
    kind: "write",
    capabilityId: "project.create",
    defaultPassportId: "pp-delivery",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        key: { type: "string", description: "2–5 char project key" },
        description: { type: "string", description: "Short brief" },
        team: { type: "string", description: "Owning team label" },
      },
      required: ["name", "key"],
    },
    exampleArgs: {
      name: "Client portal MVP",
      key: "PORT",
      description: "Ship read-only client portal for Northwind",
      team: "Engineering",
    },
  },
  {
    name: "create_issue",
    description: "Create a real ticket/issue on a project (projectId = UUID or key).",
    kind: "write",
    capabilityId: "issue.create",
    defaultPassportId: "pp-delivery",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Target project UUID or key" },
        title: { type: "string", description: "Issue title" },
        description: { type: "string", description: "Issue body" },
        priority: { type: "string", description: "P0–P3 or High/Medium/Low" },
        type: { type: "string", description: "Bug | Task | Story | Ticket" },
        status: { type: "string", description: "Backlog | To do | In progress | …" },
        assignee: { type: "string", description: "Assignee display name" },
      },
      required: ["projectId", "title"],
    },
    exampleArgs: {
      projectId: "OPS",
      title: "Exception digest email failures",
      description: "Clients report missing nightly exception digests.",
      priority: "High",
      type: "Bug",
    },
  },
  {
    name: "update_issue_status",
    description: "Move an issue to a new status (Backlog, In progress, Done, …).",
    kind: "write",
    capabilityId: "issue.update",
    defaultPassportId: "pp-delivery",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue id / key" },
        status: { type: "string", description: "New status" },
      },
      required: ["issueId", "status"],
    },
    exampleArgs: { issueId: "OPS-12", status: "In review" },
  },
  {
    name: "assign_issue",
    description: "Assign an issue to a person by name or email.",
    kind: "write",
    capabilityId: "issue.update",
    defaultPassportId: "pp-delivery",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", description: "Issue id" },
        assignee: { type: "string", description: "Assignee display name" },
      },
      required: ["issueId", "assignee"],
    },
    exampleArgs: { issueId: "OPS-12", assignee: "Daniel Kim" },
  },
  {
    name: "list_candidates",
    description: "List candidates for a job id, optionally filtered by stage.",
    kind: "read",
    capabilityId: "candidate.read",
    defaultPassportId: "pp-recruiting",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "Job id" },
        stage: { type: "string", description: "Optional ATS stage" },
      },
      required: ["jobId"],
    },
    exampleArgs: { jobId: "job-backend", stage: "Offer" },
  },
  {
    name: "move_candidate_stage",
    description: "Move a candidate to another ATS stage (may require approval for Offer).",
    kind: "write",
    capabilityId: "candidate.read",
    defaultPassportId: "pp-recruiting",
    inputSchema: {
      type: "object",
      properties: {
        candidateId: { type: "string", description: "Candidate id" },
        stage: { type: "string", description: "Target stage" },
      },
      required: ["candidateId", "stage"],
    },
    exampleArgs: { candidateId: "cand-omar", stage: "Shortlisted" },
  },
  {
    name: "draft_offer",
    description: "Draft an offer letter package for a candidate (always approval-gated).",
    kind: "write",
    capabilityId: "offer.send",
    defaultPassportId: "pp-recruiting",
    inputSchema: {
      type: "object",
      properties: {
        candidateId: { type: "string", description: "Candidate id" },
        salary: { type: "number", description: "Annual salary USD" },
        startDate: { type: "string", description: "ISO start date" },
      },
      required: ["candidateId", "salary"],
    },
    exampleArgs: { candidateId: "cand-elena", salary: 145000, startDate: "2026-11-03" },
  },
  {
    name: "start_onboarding_checklist",
    description: "Draft an onboarding checklist for a new hire.",
    kind: "write",
    capabilityId: "onboarding.draft",
    defaultPassportId: "pp-people",
    inputSchema: {
      type: "object",
      properties: {
        employeeName: { type: "string", description: "New hire name" },
        role: { type: "string", description: "Job title" },
        startDate: { type: "string", description: "Start date" },
      },
      required: ["employeeName", "role"],
    },
    exampleArgs: { employeeName: "Elena Rossi", role: "Senior Backend Engineer", startDate: "2026-11-03" },
  },
  {
    name: "search_documents",
    description: "Search the document vault by keyword (optional project scope).",
    kind: "read",
    capabilityId: "document.search",
    defaultPassportId: "pp-people",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        projectId: { type: "string", description: "Optional project UUID to scope retrieval" },
      },
      required: ["query"],
    },
    exampleArgs: { query: "PTO policy" },
  },
  {
    name: "ask_company_brain",
    description: "Ask a question grounded in company documents and policies.",
    kind: "read",
    capabilityId: "brain.ask",
    defaultPassportId: "pp-people",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Natural language question" },
        projectId: { type: "string", description: "Optional project UUID to scope retrieval" },
      },
      required: ["question"],
    },
    exampleArgs: { question: "How many PTO days do employees get?" },
  },
  {
    name: "create_client_note",
    description: "Attach an internal note to a client record.",
    kind: "write",
    capabilityId: "crm.sync",
    defaultPassportId: "pp-revenue",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Client id" },
        note: { type: "string", description: "Note text" },
      },
      required: ["clientId", "note"],
    },
    exampleArgs: { clientId: "client-northwind", note: "Asked for portal milestone update by Friday." },
  },
  {
    name: "summarize_engagement",
    description: "Summarize an engagement’s phases, status, and risks.",
    kind: "read",
    capabilityId: "crm.sync",
    defaultPassportId: "pp-revenue",
    inputSchema: {
      type: "object",
      properties: {
        engagementId: { type: "string", description: "Engagement id" },
      },
      required: ["engagementId"],
    },
    exampleArgs: { engagementId: "eng-northwind-ops" },
  },
]

export function getMcpTool(name: string) {
  return mcpTools.find((tool) => tool.name === name)
}
