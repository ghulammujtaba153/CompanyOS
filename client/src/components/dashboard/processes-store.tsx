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
import { canManagePeople } from "@/lib/organization"
import { seedProcesses, type Policy, type Process, type ProcessStep } from "@/lib/processes"

type Result = { ok: true; id?: string } | { ok: false; message: string }

type ProcessesValue = {
  loading: boolean
  processes: Process[]
  policy: Policy
  getProcess: (id: string) => Process | undefined
  canEdit: (process: Process) => boolean
  canCreate: boolean
  saveProcess: (input: Omit<Process, "id" | "steps"> & { id?: string }) => Result
  deleteProcess: (id: string) => void
  saveStep: (processId: string, step: Omit<ProcessStep, "id"> & { id?: string }) => Result
  removeStep: (processId: string, stepId: string) => void
  moveStep: (processId: string, stepId: string, direction: -1 | 1) => void
  /** Replace step performers with a simulated plan (deploy). */
  applyPlan: (processId: string, steps: ProcessStep[]) => void
}

const ProcessesContext = createContext<ProcessesValue | null>(null)

function mapProcess(row: Record<string, unknown>): Process {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    departmentId: String(row.departmentId ?? ""),
    ownerId: String(row.ownerId ?? ""),
    runsPerWeek: Number(row.runsPerWeek ?? 1),
    context: (row.context as Process["context"]) || { amount: 0, external: false, records: 0 },
    steps: Array.isArray(row.steps) ? (row.steps as ProcessStep[]) : [],
  }
}

function persistProcess(orgId: string, process: Process) {
  return governanceApi.upsertProcess(orgId, {
    id: process.id,
    name: process.name,
    description: process.description,
    departmentId: process.departmentId,
    ownerId: process.ownerId,
    runsPerWeek: process.runsPerWeek,
    context: process.context,
    steps: process.steps,
  })
}

export function ProcessesProvider({ children }: { children: ReactNode }) {
  const { me } = useOrganization()
  const { passports, rules, defaultAutonomy } = useGovernance()
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [loading, setLoading] = useState(useApi)
  const [processes, setProcesses] = useState(seedProcesses)

  const refresh = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setProcesses(seedProcesses)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await governanceApi.listProcesses(activeOrgId)
      // API auto-seeds starter processes when the org catalog is empty.
      setProcesses(rows.length ? rows.map(mapProcess) : seedProcesses)
    } catch {
      setProcesses(seedProcesses)
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<ProcessesValue>(() => {
    const isAdmin = canManagePeople(me?.accessRole)
    const canEdit = (process: Process) => isAdmin || process.ownerId === me?.id
    const update = (id: string, fn: (process: Process) => Process) =>
      setProcesses((current) => {
        const next = current.map((process) => (process.id === id ? fn(process) : process))
        const changed = next.find((process) => process.id === id)
        if (useApi && activeOrgId && changed) {
          void persistProcess(activeOrgId, changed).catch(() => undefined)
        }
        return next
      })

    return {
      loading,
      processes,
      policy: { passports, rules, defaultAutonomy },
      getProcess: (id) => processes.find((process) => process.id === id),
      canEdit,
      canCreate: Boolean(me),

      saveProcess(input) {
        const name = input.name.trim()
        if (!name) return { ok: false, message: "Process name is required." }
        if (!input.ownerId) return { ok: false, message: "Choose an owner." }
        if (!(input.runsPerWeek > 0)) return { ok: false, message: "Runs per week must be above zero." }
        if (processes.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== input.id)) {
          return { ok: false, message: `${name} already exists.` }
        }
        if (input.id) {
          update(input.id, (process) => ({ ...process, ...input, name, description: input.description.trim() }))
          return { ok: true, id: input.id }
        }
        const id = `proc-${Date.now()}`
        const created: Process = {
          ...input,
          id,
          name,
          description: input.description.trim(),
          steps: [],
        }
        setProcesses((current) => [...current, created])
        if (useApi && activeOrgId) {
          void persistProcess(activeOrgId, created)
            .then((row) => {
              const mapped = mapProcess(row)
              setProcesses((current) => current.map((item) => (item.id === id ? mapped : item)))
            })
            .catch(() => undefined)
        }
        return { ok: true, id }
      },

      deleteProcess(id) {
        setProcesses((current) => current.filter((process) => process.id !== id))
        if (useApi && activeOrgId) {
          void governanceApi.deleteProcess(activeOrgId, id).catch(() => undefined)
        }
      },

      saveStep(processId, step) {
        if (!step.name.trim()) return { ok: false, message: "Step name is required." }
        if (step.durationMin <= 0) return { ok: false, message: "Duration must be above zero." }
        if (step.waitHours < 0) return { ok: false, message: "Wait time can't be negative." }
        if (step.performer.kind === "agent" && !step.capabilityId) {
          return { ok: false, message: "Choose the action an agent would perform." }
        }
        if (step.performer.kind === "person" && !step.performer.employeeId) {
          return { ok: false, message: "Choose who performs this step." }
        }
        const clean = { ...step, name: step.name.trim() }
        update(processId, (process) => ({
          ...process,
          steps: clean.id
            ? process.steps.map((item) => (item.id === clean.id ? { ...item, ...clean, id: item.id } : item))
            : [...process.steps, { ...clean, id: `step-${Date.now()}` }],
        }))
        return { ok: true }
      },

      removeStep(processId, stepId) {
        update(processId, (process) => ({ ...process, steps: process.steps.filter((step) => step.id !== stepId) }))
      },

      moveStep(processId, stepId, direction) {
        update(processId, (process) => {
          const index = process.steps.findIndex((step) => step.id === stepId)
          const target = index + direction
          if (index < 0 || target < 0 || target >= process.steps.length) return process
          const steps = [...process.steps]
          ;[steps[index], steps[target]] = [steps[target], steps[index]]
          return { ...process, steps }
        })
      },

      applyPlan(processId, steps) {
        update(processId, (process) => ({ ...process, steps }))
      },
    }
  }, [me, passports, rules, defaultAutonomy, processes, loading, useApi, activeOrgId])

  return <ProcessesContext.Provider value={value}>{children}</ProcessesContext.Provider>
}

export function useProcesses() {
  const context = useContext(ProcessesContext)
  if (!context) throw new Error("useProcesses must be used within ProcessesProvider")
  return context
}
