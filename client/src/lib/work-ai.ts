import type { Project, ProjectIssue } from "@/lib/project-types"
import { isOverdue } from "@/lib/work-utils"

export type IssueDraft = {
  title: string
  description: string
  type: ProjectIssue["type"]
  priority: ProjectIssue["priority"]
  labels: string[]
  estimate: string
  rationale: string
}

export type TriageSuggestion = {
  issueId: string
  title: string
  suggestedPriority: ProjectIssue["priority"]
  suggestedAssignee: string
  suggestedDue: string
  rationale: string
}

/** Draft an issue from a free-text client email / brief (local GenAI). */
export function draftIssueFromBrief(brief: string): IssueDraft {
  const text = brief.trim()
  const lower = text.toLowerCase()
  let type: ProjectIssue["type"] = "Task"
  if (lower.includes("bug") || lower.includes("broken") || lower.includes("error") || lower.includes("fail")) {
    type = "Bug"
  } else if (lower.includes("feature") || lower.includes("want") || lower.includes("add")) {
    type = "Story"
  }

  let priority: ProjectIssue["priority"] = "Medium"
  if (lower.includes("urgent") || lower.includes("asap") || lower.includes("production") || lower.includes("p0")) {
    priority = "Critical"
  } else if (lower.includes("important") || lower.includes("blocked") || lower.includes("high")) {
    priority = "High"
  } else if (lower.includes("nice to have") || lower.includes("low")) {
    priority = "Low"
  }

  const firstLine = text.split(/\n/)[0]?.replace(/^subject:\s*/i, "").slice(0, 80) || "Follow up from client brief"
  const labels = [
    lower.includes("portal") ? "portal" : "",
    lower.includes("invoice") || lower.includes("billing") ? "billing" : "",
    lower.includes("api") ? "api" : "",
    type === "Bug" ? "bug" : "delivery",
  ].filter(Boolean)

  return {
    title: firstLine.length > 8 ? firstLine : `Client request: ${firstLine}`,
    description: `## Context\n${text}\n\n## Acceptance criteria\n- [ ] Reproduced / clarified with client\n- [ ] Fix or delivery merged\n- [ ] Client notified`,
    type,
    priority,
    labels: labels.slice(0, 3),
    estimate: priority === "Critical" || priority === "High" ? "1d" : "2d",
    rationale: `Classified as ${type} / ${priority} from urgency and defect language in the brief.`,
  }
}

/** Suggest triage moves for open issues. */
export function triageBacklog(issues: ProjectIssue[], assignees: string[]): TriageSuggestion[] {
  const pool = assignees.length ? assignees : ["Unassigned"]
  return issues
    .filter((issue) => issue.status !== "Done")
    .slice(0, 8)
    .map((issue, index) => {
      const overdue = isOverdue(issue)
      let suggestedPriority = issue.priority
      if (overdue && issue.priority !== "Critical") suggestedPriority = "High"
      if (issue.type === "Bug" && issue.priority === "Low") suggestedPriority = "Medium"
      const suggestedAssignee =
        issue.assignee !== "Unassigned" ? issue.assignee : pool[index % pool.length]
      const due = issue.dueDate || new Date(Date.now() + (overdue ? 2 : 7) * 86400000).toISOString().slice(0, 10)
      return {
        issueId: issue.id,
        title: issue.title,
        suggestedPriority,
        suggestedAssignee,
        suggestedDue: due,
        rationale: overdue
          ? "Overdue — raise priority and set a near-term due date."
          : issue.assignee === "Unassigned"
            ? "Unassigned — route to available teammate."
            : "Keep owner; tighten due date for visibility.",
      }
    })
}

/** Narrative standup summary for a project. */
export function standupSummary(project: Project, issues: ProjectIssue[]) {
  const open = issues.filter((i) => i.status !== "Done")
  const done = issues.filter((i) => i.status === "Done")
  const inProgress = issues.filter((i) => i.status === "In progress" || i.status === "In review")
  const overdue = issues.filter(isOverdue)
  const blocked = issues.filter((i) => i.status === "Blocked")

  const lines = [
    `**${project.name}** (${project.key}) — ${project.status}`,
    "",
    `Yesterday / recently done: **${done.length}** issues closed in the seed set.`,
    `Today: **${inProgress.length}** in progress/review · **${open.length}** still open.`,
    overdue.length ? `Risk: **${overdue.length}** overdue — ${overdue
      .slice(0, 3)
      .map((i) => i.id)
      .join(", ")}.` : "Risk: no overdue issues.",
    blocked.length ? `Blocked: ${blocked.map((i) => i.id).join(", ")}.` : "Blocked: none.",
    "",
    "Suggested focus: clear overdue items first, then finish In review to keep throughput healthy.",
  ]
  return lines.join("\n")
}
