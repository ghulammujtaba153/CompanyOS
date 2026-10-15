import type { AgentAction } from "@/components/dashboard/approvals-store"

export const WEEK_MS = 7 * 24 * 60 * 60_000

export type AgentStats = {
  total: number
  autoExecuted: number
  approved: number
  declined: number
  pending: number
  blocked: number
  drafted: number
  /** Share of completed actions that needed no human (auto ÷ auto+approved+declined). */
  autonomyRate: number | null
}

/** Activity metrics for one agent (or all, when passportId is omitted) since `since` (ms epoch). */
export function agentStats(actions: AgentAction[], since: number, passportId?: string): AgentStats {
  const list = actions.filter(
    (action) => (!passportId || action.passportId === passportId) && Date.parse(action.createdAt) >= since
  )
  const count = (status: AgentAction["status"]) => list.filter((action) => action.status === status).length
  const autoExecuted = count("Auto-executed")
  const approved = count("Approved")
  const declined = count("Declined")
  const finished = autoExecuted + approved + declined
  return {
    total: list.length,
    autoExecuted,
    approved,
    declined,
    pending: count("Pending"),
    blocked: count("Blocked"),
    drafted: count("Drafted"),
    autonomyRate: finished ? Math.round((autoExecuted / finished) * 100) : null,
  }
}

/** Something needs a human look: blocked attempts or requests waiting over a day. */
export function needsAttention(actions: AgentAction[], passportId: string, now: number) {
  return actions.some(
    (action) =>
      action.passportId === passportId &&
      ((action.status === "Blocked" && now - Date.parse(action.createdAt) < WEEK_MS) ||
        (action.status === "Pending" && now - Date.parse(action.createdAt) > 24 * 60 * 60_000))
  )
}
