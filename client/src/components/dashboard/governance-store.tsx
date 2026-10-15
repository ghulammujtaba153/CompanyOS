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
import { useOrganization } from "@/components/dashboard/organization-store"
import { governanceApi } from "@/lib/auth-api"
import {
  capabilityName,
  conditionLabel,
  seedPassports,
  seedRules,
  type AutonomyLevel,
  type FirewallRule,
  type Passport,
} from "@/lib/governance"
import { canManagePeople } from "@/lib/organization"

export type PolicyChange = { id: string; actorId: string; summary: string; at: string }

type Result = { ok: true; id?: string } | { ok: false; message: string }

type GovernanceValue = {
  /** Owner/Admin may change policy; everyone else sees it read-only. */
  canEdit: boolean
  loading: boolean
  defaultAutonomy: AutonomyLevel
  defaultProvider: string
  setDefaultAutonomy: (level: AutonomyLevel) => void
  setDefaultProvider: (provider: string) => void
  passports: Passport[]
  savePassport: (input: Omit<Passport, "id"> & { id?: string }) => Result
  deletePassport: (id: string) => void
  rules: FirewallRule[]
  saveRule: (input: Omit<FirewallRule, "id"> & { id?: string }) => Result
  deleteRule: (id: string) => void
  toggleRule: (id: string) => void
  changes: PolicyChange[]
  refresh: () => Promise<void>
}

const GovernanceContext = createContext<GovernanceValue | null>(null)

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

function mapPassport(row: Record<string, unknown>): Passport {
  return {
    id: String(row.id),
    agent: String(row.agent ?? ""),
    description: String(row.description ?? ""),
    departmentId: String(row.departmentId ?? ""),
    ownerId: String(row.ownerId ?? ""),
    autonomy: (row.autonomy == null ? null : Number(row.autonomy)) as AutonomyLevel | null,
    capabilityIds: Array.isArray(row.capabilityIds) ? row.capabilityIds.map(String) : [],
    status: row.status === "Paused" ? "Paused" : "Active",
  }
}

function mapRule(row: Record<string, unknown>): FirewallRule {
  return {
    id: String(row.id),
    capabilityId: String(row.capabilityId ?? ""),
    condition: (row.condition as FirewallRule["condition"]) || "Always",
    threshold: Number(row.threshold ?? 0),
    risk: (row.risk as FirewallRule["risk"]) || "Medium",
    path: (row.path as FirewallRule["path"]) || "Accountable owner",
    enabled: Boolean(row.enabled),
  }
}

export function GovernanceProvider({ children }: { children: ReactNode }) {
  const { me } = useOrganization()
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [loading, setLoading] = useState(useApi)
  const [defaultAutonomy, setDefault] = useState<AutonomyLevel>(3)
  const [defaultProvider, setProvider] = useState("")
  const [passports, setPassports] = useState(seedPassports)
  const [rules, setRules] = useState(seedRules)
  const [changes, setChanges] = useState<PolicyChange[]>([
    { id: "pc-2", actorId: "emp-ghulam", summary: "Paused Revenue Ops Agent", at: ago(60 * 5) },
    { id: "pc-1", actorId: "emp-ghulam", summary: "Added rule: Execute payments · Amount over $10,000 → Executive", at: ago(60 * 30) },
  ])

  const refresh = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setPassports(seedPassports)
      setRules(seedRules)
      setDefault(3)
      setProvider("")
      return
    }
    setLoading(true)
    try {
      let policy = await governanceApi.getPolicy(activeOrgId)
      if (!policy.passports.length) {
        await governanceApi.seedDefaults(activeOrgId)
        policy = await governanceApi.getPolicy(activeOrgId)
      }
      setDefault((policy.defaultAutonomy as AutonomyLevel) || 3)
      setProvider(policy.defaultProvider || "")
      setPassports(policy.passports.length ? policy.passports.map(mapPassport) : seedPassports)
      setRules(policy.rules.length ? policy.rules.map(mapRule) : seedRules)
    } catch {
      setPassports(seedPassports)
      setRules(seedRules)
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<GovernanceValue>(() => {
    const canEdit = canManagePeople(me?.accessRole)
    const log = (summary: string) =>
      setChanges((current) => [
        { id: `pc-${Date.now()}`, actorId: me?.id ?? "", summary, at: new Date().toISOString() },
        ...current,
      ])

    return {
      canEdit,
      loading,
      defaultAutonomy,
      defaultProvider,
      passports,
      rules,
      changes,
      refresh,

      setDefaultAutonomy(level) {
        if (!canEdit || level === defaultAutonomy) return
        const previous = defaultAutonomy
        setDefault(level)
        log(`Changed company default autonomy from L${previous} to L${level}`)
        if (useApi && activeOrgId) {
          void governanceApi.updateSettings(activeOrgId, { defaultAutonomy: level, defaultProvider }).catch(() => {
            setDefault(previous)
          })
        }
      },

      setDefaultProvider(provider) {
        if (!canEdit) return
        const previous = defaultProvider
        setProvider(provider)
        log(`Set default AI provider to ${provider || "system default"}`)
        if (useApi && activeOrgId) {
          void governanceApi
            .updateSettings(activeOrgId, { defaultAutonomy, defaultProvider: provider })
            .catch(() => setProvider(previous))
        }
      },

      savePassport(input) {
        if (!canEdit) return { ok: false, message: "Only Owners and Admins can change passports." }
        const agent = input.agent.trim()
        if (!agent) return { ok: false, message: "Agent name is required." }
        if (!input.ownerId) return { ok: false, message: "Every agent needs an accountable owner." }
        if (passports.some((item) => item.agent.toLowerCase() === agent.toLowerCase() && item.id !== input.id)) {
          return { ok: false, message: `${agent} already has a passport.` }
        }
        const id = input.id ?? `pp-${Date.now()}`
        const next: Passport = { ...input, agent, id }
        if (input.id) {
          const before = passports.find((item) => item.id === input.id)
          setPassports((current) => current.map((item) => (item.id === input.id ? next : item)))
          if (before && before.status !== input.status) log(`${input.status === "Paused" ? "Paused" : "Resumed"} ${agent}`)
          else log(`Updated ${agent}'s passport`)
        } else {
          setPassports((current) => [...current, next])
          log(`Created passport for ${agent}`)
        }
        if (useApi && activeOrgId) {
          void governanceApi
            .upsertPassport(activeOrgId, {
              id,
              agent: next.agent,
              description: next.description ?? "",
              departmentId: next.departmentId ?? "",
              ownerId: next.ownerId,
              autonomy: next.autonomy,
              capabilityIds: next.capabilityIds,
              status: next.status,
            })
            .catch(() => undefined)
        }
        return { ok: true, id }
      },

      deletePassport(id) {
        if (!canEdit) return
        const passport = passports.find((item) => item.id === id)
        setPassports((current) => current.filter((item) => item.id !== id))
        if (passport) log(`Revoked ${passport.agent}'s passport`)
        if (useApi && activeOrgId) {
          void governanceApi.deletePassport(activeOrgId, id).catch(() => undefined)
        }
      },

      saveRule(input) {
        if (!canEdit) return { ok: false, message: "Only Owners and Admins can change firewall rules." }
        if (input.condition !== "Always" && input.condition !== "External party" && !(input.threshold > 0)) {
          return { ok: false, message: "Enter a threshold above zero." }
        }
        const duplicate = rules.find(
          (rule) =>
            rule.id !== input.id &&
            rule.capabilityId === input.capabilityId &&
            rule.condition === input.condition &&
            rule.threshold === input.threshold
        )
        if (duplicate) return { ok: false, message: "An identical rule already exists for this action." }
        const label = `${capabilityName(input.capabilityId)} · ${conditionLabel(input)} → ${input.path}`
        const id = input.id ?? `fr-${Date.now()}`
        const next: FirewallRule = { ...input, id }
        if (input.id) {
          setRules((current) => current.map((rule) => (rule.id === input.id ? next : rule)))
          log(`Updated rule: ${label}`)
        } else {
          setRules((current) => [...current, next])
          log(`Added rule: ${label}`)
        }
        if (useApi && activeOrgId) {
          void governanceApi
            .upsertRule(activeOrgId, {
              id,
              capabilityId: next.capabilityId,
              condition: next.condition,
              threshold: next.threshold,
              risk: next.risk,
              path: next.path,
              enabled: next.enabled,
            })
            .catch(() => undefined)
        }
        return { ok: true }
      },

      deleteRule(id) {
        if (!canEdit) return
        const rule = rules.find((item) => item.id === id)
        setRules((current) => current.filter((item) => item.id !== id))
        if (rule) log(`Deleted rule: ${capabilityName(rule.capabilityId)} · ${conditionLabel(rule)}`)
        if (useApi && activeOrgId) {
          void governanceApi.deleteRule(activeOrgId, id).catch(() => undefined)
        }
      },

      toggleRule(id) {
        if (!canEdit) return
        const rule = rules.find((item) => item.id === id)
        if (!rule) return
        const next = { ...rule, enabled: !rule.enabled }
        setRules((current) => current.map((item) => (item.id === id ? next : item)))
        log(`${rule.enabled ? "Disabled" : "Enabled"} rule: ${capabilityName(rule.capabilityId)} · ${conditionLabel(rule)}`)
        if (useApi && activeOrgId) {
          void governanceApi
            .upsertRule(activeOrgId, {
              id: next.id,
              capabilityId: next.capabilityId,
              condition: next.condition,
              threshold: next.threshold,
              risk: next.risk,
              path: next.path,
              enabled: next.enabled,
            })
            .catch(() => undefined)
        }
      },
    }
  }, [
    me,
    loading,
    defaultAutonomy,
    defaultProvider,
    passports,
    rules,
    changes,
    useApi,
    activeOrgId,
    refresh,
  ])

  return <GovernanceContext.Provider value={value}>{children}</GovernanceContext.Provider>
}

export function useGovernance() {
  const context = useContext(GovernanceContext)
  if (!context) throw new Error("useGovernance must be used within GovernanceProvider")
  return context
}
