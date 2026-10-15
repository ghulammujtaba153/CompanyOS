import {
  evaluate,
  type ActionContext,
  type Decision,
  type FirewallRule,
  type Passport,
  type AutonomyLevel,
} from "@/lib/governance"
import { askCompanyBrain, searchKnowledge } from "@/lib/company-brain"
import { getMcpTool, type McpToolDef } from "@/lib/mcp-tools"

export type McpInvokeInput = {
  toolName: string
  args: Record<string, unknown>
  passport: Passport
  rules: FirewallRule[]
  defaultAutonomy: AutonomyLevel
  context?: Partial<ActionContext>
}

export type McpInvokeResult = {
  tool: McpToolDef
  decision: Decision
  /** Simulated tool payload when Auto-execute / Draft; otherwise explanation. */
  result: {
    ok: boolean
    mode: Decision["outcome"]
    message: string
    data?: unknown
  }
}

function buildContext(tool: McpToolDef, args: Record<string, unknown>, extra?: Partial<ActionContext>): ActionContext {
  const records =
    typeof args.count === "number"
      ? args.count
      : tool.name === "create_issue" && Array.isArray(args.issues)
        ? args.issues.length
        : 1
  return {
    amount: typeof args.amount === "number" ? args.amount : typeof args.salary === "number" ? args.salary : 0,
    external: Boolean(args.external) || tool.capabilityId === "offer.send" || tool.capabilityId === "email.external",
    records,
    ...extra,
  }
}

/** Simulate successful tool execution for demos (no real DB writes yet). */
function simulateExecution(tool: McpToolDef, args: Record<string, unknown>) {
  switch (tool.name) {
    case "ask_company_brain": {
      const question = String(args.question ?? "")
      const answer = askCompanyBrain(question)
      return { message: "Company Brain answered.", data: answer }
    }
    case "search_documents": {
      const query = String(args.query ?? "")
      const hits = searchKnowledge(query)
      return { message: `Found ${hits.length} document hit(s).`, data: hits }
    }
    case "create_project":
      return {
        message: `Would create project ${String(args.key ?? "").toUpperCase()} — ${String(args.name)}.`,
        data: { id: `proj-demo-${Date.now()}`, ...args, status: "Active" },
      }
    case "create_issue":
      return {
        message: `Would create issue “${String(args.title)}” on ${String(args.projectId)}.`,
        data: { id: `ISSUE-${Math.floor(Math.random() * 900 + 100)}`, ...args, status: "Backlog" },
      }
    case "update_issue_status":
      return {
        message: `Would move ${String(args.issueId)} → ${String(args.status)}.`,
        data: args,
      }
    case "assign_issue":
      return {
        message: `Would assign ${String(args.issueId)} to ${String(args.assignee)}.`,
        data: args,
      }
    case "draft_offer":
      return {
        message: `Offer draft prepared for ${String(args.candidateId)} at $${args.salary}. Needs human send.`,
        data: { ...args, status: "Draft" },
      }
    case "start_onboarding_checklist":
      return {
        message: `Onboarding draft ready for ${String(args.employeeName)}.`,
        data: {
          tasks: ["Send offer & contract", "Provision laptop", "Add to Slack/channels", "Assign buddy"],
          ...args,
        },
      }
    case "list_candidates":
      return {
        message: `Listed candidates for ${String(args.jobId)} (demo snapshot).`,
        data: { jobId: args.jobId, stage: args.stage ?? "all", count: 3 },
      }
    case "move_candidate_stage":
      return {
        message: `Would move ${String(args.candidateId)} to ${String(args.stage)}.`,
        data: args,
      }
    case "create_client_note":
      return {
        message: `Note attached to ${String(args.clientId)}.`,
        data: args,
      }
    case "summarize_engagement":
      return {
        message: "Engagement summary generated.",
        data: {
          engagementId: args.engagementId,
          summary:
            "Delivery is mid-phase with inventory exceptions automated; next risk is manager-adoption training before cutover.",
        },
      }
    default:
      return { message: `Tool ${tool.name} acknowledged.`, data: args }
  }
}

/**
 * Gate an MCP tool call through governance, then simulate execution when allowed.
 * When outcome is Needs approval, callers should `submit` to Approvals.
 */
export function invokeMcpTool(input: McpInvokeInput): McpInvokeResult | { error: string } {
  const tool = getMcpTool(input.toolName)
  if (!tool) return { error: `Unknown tool: ${input.toolName}` }

  const context = buildContext(tool, input.args, input.context)
  const decision = evaluate(input.passport, tool.capabilityId, context, input.rules, input.defaultAutonomy)

  if (decision.outcome === "Blocked") {
    return {
      tool,
      decision,
      result: {
        ok: false,
        mode: decision.outcome,
        message: decision.reasons.join(" "),
      },
    }
  }

  if (decision.outcome === "Needs approval") {
    return {
      tool,
      decision,
      result: {
        ok: true,
        mode: decision.outcome,
        message: `Queued for ${decision.approver ?? "approval"}. ${decision.reasons[0] ?? ""}`,
        data: { proposedArgs: input.args },
      },
    }
  }

  const executed = simulateExecution(tool, input.args)
  return {
    tool,
    decision,
    result: {
      ok: true,
      mode: decision.outcome,
      message:
        decision.outcome === "Draft only"
          ? `Draft prepared (not applied): ${executed.message}`
          : executed.message,
      data: executed.data,
    },
  }
}
