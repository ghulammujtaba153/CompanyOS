import type { ProjectIssue } from "@/lib/project-types"

export const WORK_ROOT = "/dashboard/work-management"

export function projectHref(projectId: string, section = "") {
  return `${WORK_ROOT}/projects/${projectId}${section ? `/${section}` : ""}`
}

export function issueHref(issue: Pick<ProjectIssue, "id" | "projectId">) {
  return projectHref(issue.projectId, `issues/${issue.id}`)
}

function todayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

/** Formats an ISO yyyy-mm-dd date for display; empty → "—". */
export function formatDate(iso: string) {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: y === new Date().getFullYear() ? undefined : "numeric",
  })
}

export function isOverdue(issue: Pick<ProjectIssue, "dueDate" | "status">) {
  return Boolean(issue.dueDate) && issue.status !== "Done" && issue.dueDate < todayIso()
}

export function projectProgress(issues: ProjectIssue[]) {
  if (!issues.length) return 0
  return Math.round((issues.filter((issue) => issue.status === "Done").length / issues.length) * 100)
}

/** Next sequential number for a project key, never reusing an existing id. */
export function nextIssueId(key: string, issues: ProjectIssue[]) {
  const max = issues.reduce((highest, issue) => {
    const [prefix, num] = issue.id.split("-")
    return prefix === key ? Math.max(highest, Number(num) || 0) : highest
  }, 100)
  return `${key}-${max + 1}`
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function parseLabels(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}
