import { UNASSIGNED, type ProjectIssue } from "@/lib/project-types"

export const workflowStates = ["To do", "In progress", "Done"] as const

export type WorkflowState = (typeof workflowStates)[number]

export function toWorkflowState(status: ProjectIssue["status"]): WorkflowState {
  if (status === "Done") return "Done"
  if (status === "In progress" || status === "In review" || status === "Blocked") {
    return "In progress"
  }
  return "To do"
}

type TransitionResult = { ok: true } | { ok: false; message: string }

/**
 * Single source of truth for status changes. Used by the board (drag/drop)
 * and the issue detail page so both enforce identical rules.
 */
export function validateStatusChange(
  issue: ProjectIssue,
  next: ProjectIssue["status"]
): TransitionResult {
  if (issue.status === next) return { ok: false, message: `${issue.id} is already ${next}.` }

  if (next === "Done") {
    if (issue.assignee === UNASSIGNED) {
      return { ok: false, message: `Assign ${issue.id} before closing it.` }
    }
    if (issue.status === "Blocked") {
      return { ok: false, message: `${issue.id} is blocked. Unblock it before closing.` }
    }
    if (!issue.description.trim()) {
      return { ok: false, message: `Add a description to ${issue.id} before closing it.` }
    }
  }

  return { ok: true }
}
