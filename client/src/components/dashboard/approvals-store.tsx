"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { useAuth } from "@/components/auth/auth-provider"
import { useGovernance } from "@/components/dashboard/governance-store"
import { useOrganization } from "@/components/dashboard/organization-store"
import { governanceApi } from "@/lib/auth-api"
import {
  evaluate,
  riskLevels,
  type ActionContext,
  type ApprovalPath,
  type Decision,
  type Risk,
} from "@/lib/governance"
import type { Employee } from "@/lib/organization"

export type ActionStatus = "Pending" | "Approved" | "Declined" | "Auto-executed" | "Blocked" | "Drafted"

/** One action an agent attempted, and what governance decided about it. */
export type AgentAction = {
  id: string
  passportId: string
  agent: string
  capabilityId: string
  title: string
  detail: string
  context: ActionContext
  status: ActionStatus
  risk: Risk
  requiredPath?: ApprovalPath
  reasons: string[]
  createdAt: string
  decidedBy?: string
  decidedAt?: string
  note?: string
}

export type ActionProposal = {
  passportId: string
  capabilityId: string
  title: string
  detail: string
  context: ActionContext
}

type Result = { ok: true; message?: string } | { ok: false; message: string }

type ApprovalsValue = {
  loading: boolean
  actions: AgentAction[]
  pending: AgentAction[]
  /** Pending actions the signed-in user is allowed to decide. */
  mine: AgentAction[]
  approversFor: (action: AgentAction) => Employee[]
  canDecide: (action: AgentAction) => boolean
  /** Re-runs governance with today's policy (passport may have changed since the request). */
  recheck: (action: AgentAction) => Decision | null
  decide: (id: string, decision: "Approved" | "Declined", note: string) => Result
  submit: (proposal: ActionProposal) => AgentAction | null
}

const ApprovalsContext = createContext<ApprovalsValue | null>(null)

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const statusFor: Record<Decision["outcome"], ActionStatus> = {
  "Auto-execute": "Auto-executed",
  "Needs approval": "Pending",
  "Draft only": "Drafted",
  Blocked: "Blocked",
}

/** Agent activity used to seed the queue; each is run through the real decision engine. */
const seedProposals: (ActionProposal & {
  minutesAgo: number
  resolved?: Pick<AgentAction, "status" | "decidedBy" | "note">
})[] = [
  { passportId: "pp-finance", capabilityId: "payment.execute", title: "Pay Figma annual renewal", detail: "Figma · $2,880 · trusted vendor since 2024", context: { amount: 2880, records: 0, external: true }, minutesAgo: 35 },
  { passportId: "pp-recruiting", capabilityId: "offer.send", title: "Send offer to Elena Rossi", detail: "Senior Backend Engineer · $6,200/month · start in 4 weeks", context: { amount: 0, records: 0, external: true }, minutesAgo: 90 },
  { passportId: "pp-recruiting", capabilityId: "calendar.invite", title: "Invite Omar Haddad to screening call", detail: "Thursday 3:00 PM · 30 min · external candidate", context: { amount: 0, records: 0, external: true }, minutesAgo: 20 },
  { passportId: "pp-finance", capabilityId: "payment.execute", title: "Pay AWS invoice (September)", detail: "Amazon Web Services · $14,500", context: { amount: 14500, records: 0, external: true }, minutesAgo: 60 * 27 },
  { passportId: "pp-finance", capabilityId: "payment.execute", title: "Pay office snacks invoice", detail: "Snackbox · $120", context: { amount: 120, records: 0, external: true }, minutesAgo: 60 * 3 },
  { passportId: "pp-finance", capabilityId: "vendor.bank_change", title: "Update Snackbox bank account", detail: "Vendor emailed new IBAN", context: { amount: 0, records: 0, external: true }, minutesAgo: 60 * 5 },
  { passportId: "pp-people", capabilityId: "onboarding.draft", title: "Draft onboarding plan for Aisha Khan", detail: "Software Engineer · starts next week", context: { amount: 0, records: 0, external: false }, minutesAgo: 60 * 8 },
  { passportId: "pp-revenue", capabilityId: "crm.sync", title: "Sync 240 CRM contacts", detail: "Nightly internal CRM sync", context: { amount: 0, records: 240, external: false }, minutesAgo: 60 * 10 },
  { passportId: "pp-finance", capabilityId: "payment.execute", title: "Pay Notion team plan", detail: "Notion · $960", context: { amount: 960, records: 0, external: true }, minutesAgo: 60 * 30, resolved: { status: "Approved", decidedBy: "emp-ghulam", note: "Renewal budgeted." } },
  { passportId: "pp-recruiting", capabilityId: "offer.send", title: "Send offer to Tom Becker", detail: "Senior Backend Engineer · $7,500/month", context: { amount: 0, records: 0, external: true }, minutesAgo: 60 * 50, resolved: { status: "Declined", decidedBy: "emp-ghulam", note: "Candidate was rejected at interview — offer created in error." } },
]

function mapAction(row: Record<string, unknown>): AgentAction {
  const context = (row.context as ActionContext) || { amount: 0, external: false, records: 0 }
  return {
    id: String(row.id),
    passportId: String(row.passportId ?? ""),
    agent: String(row.agent ?? ""),
    capabilityId: String(row.capabilityId ?? ""),
    title: String(row.title ?? ""),
    detail: String(row.detail ?? ""),
    context: {
      amount: Number(context.amount ?? 0),
      external: Boolean(context.external),
      records: Number(context.records ?? 0),
    },
    status: (row.status as ActionStatus) || "Pending",
    risk: (row.risk as Risk) || "Medium",
    requiredPath: (row.requiredPath as ApprovalPath) || undefined,
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    createdAt: String(row.createdAt ?? ""),
    decidedBy: row.decidedBy ? String(row.decidedBy) : undefined,
    decidedAt: row.decidedAt ? String(row.decidedAt) : undefined,
    note: row.note ? String(row.note) : undefined,
  }
}

function buildSeedActions(
  passports: ReturnType<typeof useGovernance>["passports"],
  rules: ReturnType<typeof useGovernance>["rules"],
  defaultAutonomy: ReturnType<typeof useGovernance>["defaultAutonomy"]
): AgentAction[] {
  return seedProposals.flatMap((proposal, index) => {
    const passport = passports.find((item) => item.id === proposal.passportId)
    if (!passport) return []
    const decision = evaluate(passport, proposal.capabilityId, proposal.context, rules, defaultAutonomy)
    const createdAt = ago(proposal.minutesAgo)
    return [
      {
        ...proposal,
        id: `act-${index + 1}`,
        agent: passport.agent,
        status: proposal.resolved?.status ?? statusFor[decision.outcome],
        risk: highestRisk(decision),
        requiredPath: decision.approver ?? (proposal.resolved ? "Executive" : undefined),
        reasons: decision.reasons,
        createdAt,
        decidedBy: proposal.resolved?.decidedBy,
        decidedAt: proposal.resolved ? ago(proposal.minutesAgo - 30) : undefined,
        note: proposal.resolved?.note,
      },
    ]
  })
}

export function ApprovalsProvider({ children }: { children: ReactNode }) {
  const { me, employees, departments, getEmployee } = useOrganization()
  const { passports, rules, defaultAutonomy } = useGovernance()
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [actions, setActions] = useState<AgentAction[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setActions(buildSeedActions(passports, rules, defaultAutonomy))
      setHydrated(true)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await governanceApi.listActions(activeOrgId)
      setActions(rows.length ? rows.map(mapAction) : [])
    } catch {
      setActions([])
    } finally {
      setHydrated(true)
      setLoading(false)
    }
  }, [useApi, activeOrgId, passports, rules, defaultAutonomy])

  useEffect(() => {
    if (!hydrated || !useApi) {
      void refresh()
      return
    }
    // Re-seed local demos when passports first land offline only.
  }, [refresh, hydrated, useApi])

  useEffect(() => {
    void refresh()
  }, [useApi, activeOrgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<ApprovalsValue>(() => {
    const active = employees.filter((employee) => employee.status === "Active")
    const owners = active.filter((employee) => employee.accessRole === "Owner")
    const admins = active.filter((employee) => employee.accessRole === "Owner" || employee.accessRole === "Admin")

    /** Who may decide a request, by its required path. Owners can always decide as a fallback. */
    function approversFor(action: AgentAction): Employee[] {
      const passport = passports.find((item) => item.id === action.passportId)
      const owner = passport ? getEmployee(passport.ownerId) : undefined
      let primary: Employee[] = []
      switch (action.requiredPath) {
        case "Accountable owner":
          primary = owner && owner.status === "Active" ? [owner] : []
          break
        case "Department head": {
          const head = owner ? getEmployee(departments.find((d) => d.id === owner.departmentId)?.headId ?? "") : undefined
          primary = head && head.status === "Active" ? [head] : []
          break
        }
        case "Executive":
          primary = owners
          break
        case "Legal / security review":
          primary = admins
          break
      }
      const ids = new Set([...primary, ...owners].map((employee) => employee.id))
      return active.filter((employee) => ids.has(employee.id))
    }

    function recheck(action: AgentAction) {
      const passport = passports.find((item) => item.id === action.passportId)
      if (!passport) return null
      return evaluate(passport, action.capabilityId, action.context, rules, defaultAutonomy)
    }

    const canDecide = (action: AgentAction) =>
      action.status === "Pending" && Boolean(me) && approversFor(action).some((employee) => employee.id === me!.id)

    const pending = actions.filter((action) => action.status === "Pending")

    return {
      loading: loading || !hydrated,
      actions,
      pending,
      mine: pending.filter(canDecide),
      approversFor,
      canDecide,
      recheck,

      decide(id, decision, note) {
        const action = actions.find((item) => item.id === id)
        if (!action) return { ok: false, message: "Request not found." }
        if (!canDecide(action)) return { ok: false, message: "You're not an approver for this request." }
        if (decision === "Declined" && !note.trim()) return { ok: false, message: "Add a reason when declining." }
        if (decision === "Approved") {
          const current = recheck(action)
          if (!current || current.outcome === "Blocked") {
            return { ok: false, message: current?.reasons[0] ?? "This agent no longer has a passport." }
          }
        }
        setActions((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, status: decision, decidedBy: me!.id, decidedAt: new Date().toISOString(), note: note.trim() || undefined }
              : item
          )
        )
        if (useApi && !id.startsWith("act-")) {
          void governanceApi.decideAction(id, { decision, note: note.trim() }).catch(() => undefined)
        }
        return { ok: true, message: decision === "Approved" ? `${action.agent} will execute “${action.title}”.` : undefined }
      },

      submit(proposal) {
        const passport = passports.find((item) => item.id === proposal.passportId)
        if (!passport) return null
        const decision = evaluate(passport, proposal.capabilityId, proposal.context, rules, defaultAutonomy)
        const localId = `act-${Date.now()}`
        const action: AgentAction = {
          ...proposal,
          id: localId,
          agent: passport.agent,
          status: statusFor[decision.outcome],
          risk: highestRisk(decision),
          requiredPath: decision.approver,
          reasons: decision.reasons,
          createdAt: new Date().toISOString(),
        }
        setActions((current) => [action, ...current])
        if (useApi && activeOrgId) {
          void governanceApi
            .submitAction(activeOrgId, {
              passportId: proposal.passportId,
              capabilityId: proposal.capabilityId,
              title: proposal.title,
              detail: proposal.detail,
              context: proposal.context,
              agent: passport.agent,
            })
            .then((row) => {
              const mapped = mapAction(row)
              setActions((current) => current.map((item) => (item.id === localId ? mapped : item)))
            })
            .catch(() => undefined)
        }
        return action
      },
    }
  }, [
    me,
    employees,
    departments,
    getEmployee,
    passports,
    rules,
    defaultAutonomy,
    actions,
    loading,
    hydrated,
    useApi,
    activeOrgId,
  ])

  return <ApprovalsContext.Provider value={value}>{children}</ApprovalsContext.Provider>
}

function highestRisk(decision: Decision): Risk {
  return (
    decision.matchedRules
      .map((rule) => rule.risk)
      .sort((a, b) => riskLevels.indexOf(b) - riskLevels.indexOf(a))[0] ?? "Low"
  )
}

export function useApprovals() {
  const context = useContext(ApprovalsContext)
  if (!context) throw new Error("useApprovals must be used within ApprovalsProvider")
  return context
}
