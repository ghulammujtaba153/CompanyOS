"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, KeyedSelect, OptionSelect } from "@/components/dashboard/form-controls"
import { useOrganization } from "@/components/dashboard/organization-store"
import { usePeopleOps } from "@/components/dashboard/people-ops-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { peopleOpsApi, type ApiPerformanceCycle } from "@/lib/auth-api"
import {
  seedPerformanceCycles,
  type GoalStatus,
  type OneOnOneNote,
  type PerformanceCycle,
  type PerformanceGoal,
} from "@/lib/performance"
import { cn } from "@/lib/utils"
import { InlineListSkeleton } from "@/components/dashboard/page-skeletons"

const goalStatuses: GoalStatus[] = ["Not started", "On track", "At risk", "Done"]

function mapCycle(row: ApiPerformanceCycle): PerformanceCycle {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    title: row.title,
    managerName: row.managerName,
    period: row.period,
    status: row.status as PerformanceCycle["status"],
    goals: (row.goals as PerformanceGoal[]).map((goal) => ({
      id: String(goal.id),
      title: String(goal.title ?? ""),
      progress: Number(goal.progress ?? 0),
      status: goal.status as GoalStatus,
    })),
    oneOnOnes: (row.oneOnOnes as OneOnOneNote[]).map((note) => ({
      id: String(note.id),
      date: String(note.date ?? ""),
      summary: String(note.summary ?? ""),
    })),
  }
}

function currentPeriod() {
  const month = new Date().getMonth()
  const year = new Date().getFullYear()
  return month < 6 ? `H1 ${year}` : `H2 ${year}`
}

export default function PerformancePage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const { isPeopleTeam } = usePeopleOps()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [cycles, setCycles] = useState<PerformanceCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"Active" | "Completed">("Active")
  const [openId, setOpenId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setCycles(seedPerformanceCycles)
      setOpenId((current) => current ?? seedPerformanceCycles[0]?.id ?? null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await peopleOpsApi.listPerformance(activeOrgId)
      const mapped = rows.map(mapCycle)
      setCycles(mapped)
      setOpenId((current) => {
        if (current && mapped.some((cycle) => cycle.id === current)) return current
        return mapped[0]?.id ?? null
      })
    } catch {
      setCycles([])
      setNotice("Could not load performance cycles.")
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void load()
  }, [load])

  const visible = cycles.filter((cycle) => cycle.status === filter)
  const open = cycles.find((cycle) => cycle.id === openId) ?? visible[0]

  async function persist(cycleId: string, patch: Record<string, unknown>, next: PerformanceCycle) {
    setCycles((current) => current.map((cycle) => (cycle.id === cycleId ? next : cycle)))
    if (!useApi) return
    try {
      const row = await peopleOpsApi.updatePerformance(cycleId, patch)
      setCycles((current) => current.map((cycle) => (cycle.id === cycleId ? mapCycle(row) : cycle)))
    } catch {
      setNotice("Could not save performance changes.")
      void load()
    }
  }

  function updateGoal(cycleId: string, goalId: string, changes: Partial<PerformanceGoal>) {
    const cycle = cycles.find((item) => item.id === cycleId)
    if (!cycle) return
    const goals = cycle.goals.map((goal) => {
      if (goal.id !== goalId) return goal
      const next = { ...goal, ...changes }
      if (typeof changes.progress === "number") {
        next.progress = Math.max(0, Math.min(100, changes.progress))
        if (next.progress >= 100) next.status = "Done"
        else if (next.status === "Done") next.status = "On track"
      }
      if (changes.status === "Done") next.progress = 100
      return next
    })
    const status: PerformanceCycle["status"] =
      goals.length > 0 && goals.every((goal) => goal.status === "Done" || goal.progress >= 100)
        ? "Completed"
        : cycle.status === "Completed"
          ? "Active"
          : cycle.status
    void persist(cycleId, { goals, status }, { ...cycle, goals, status })
  }

  function addOneOnOne(cycleId: string, summary: string, date: string) {
    const cycle = cycles.find((item) => item.id === cycleId)
    if (!cycle || !summary.trim()) return
    const oneOnOnes = [
      { id: `o-${Date.now()}`, date, summary: summary.trim() },
      ...cycle.oneOnOnes,
    ]
    void persist(cycleId, { oneOnOnes }, { ...cycle, oneOnOnes })
  }

  async function createCycle(input: {
    employeeId: string
    employeeName: string
    title: string
    managerName: string
    period: string
  }) {
    if (useApi && activeOrgId) {
      try {
        const row = await peopleOpsApi.createPerformance(activeOrgId, input)
        const cycle = mapCycle(row)
        setCycles((current) => [cycle, ...current])
        setOpenId(cycle.id)
        setFilter("Active")
        setNotice("Performance cycle started.")
        return { ok: true as const }
      } catch (err) {
        return {
          ok: false as const,
          message: err instanceof Error ? err.message : "Could not start cycle.",
        }
      }
    }
    const id = `perf-${Date.now()}`
    const cycle: PerformanceCycle = {
      id,
      ...input,
      status: "Active",
      goals: [
        { id: `${id}-g1`, title: "Deliver primary team OKR", progress: 0, status: "Not started" },
        { id: `${id}-g2`, title: "Grow capability / mentorship", progress: 0, status: "Not started" },
        { id: `${id}-g3`, title: "Improve reliability or quality metric", progress: 0, status: "Not started" },
      ],
      oneOnOnes: [],
    }
    setCycles((current) => [cycle, ...current])
    setOpenId(cycle.id)
    setFilter("Active")
    setNotice("Performance cycle started.")
    return { ok: true as const }
  }

  async function markCompleted(cycleId: string) {
    const cycle = cycles.find((item) => item.id === cycleId)
    if (!cycle) return
    void persist(cycleId, { status: "Completed" }, { ...cycle, status: "Completed" })
  }

  return (
    <>
      <DashboardHeader title="Performance" parent="People Operations" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Review cycles, goals / OKRs, and 1:1 notes.
            </p>
          </div>
          {isPeopleTeam ? (
            <Button size="sm" onClick={() => setStarting(true)}>
              <Plus data-icon="inline-start" />
              Start cycle
            </Button>
          ) : null}
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm">
            {notice}
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filter === "Active" ? "default" : "outline"}
            onClick={() => setFilter("Active")}
          >
            Active
          </Button>
          <Button
            size="sm"
            variant={filter === "Completed" ? "default" : "outline"}
            onClick={() => setFilter("Completed")}
          >
            Completed
          </Button>
        </div>

        {loading ? (
          <InlineListSkeleton rows={5} />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
            <ul className="space-y-2">
              {visible.map((cycle) => (
                <li key={cycle.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(cycle.id)}
                    className={cn(
                      "w-full rounded-2xl border bg-card px-4 py-3 text-left",
                      open?.id === cycle.id
                        ? "border-foreground ring-1 ring-foreground/10"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <p className="font-medium">{cycle.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {cycle.period} · {cycle.title}
                    </p>
                  </button>
                </li>
              ))}
              {!visible.length ? (
                <li className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No cycles.
                </li>
              ) : null}
            </ul>

            {open ? (
              <CycleDetail
                cycle={open}
                canEdit={isPeopleTeam}
                onUpdateGoal={updateGoal}
                onAddOneOnOne={addOneOnOne}
                onMarkCompleted={markCompleted}
              />
            ) : null}
          </div>
        )}
      </div>

      {starting ? (
        <StartCycleDialog
          cycles={cycles}
          onClose={() => setStarting(false)}
          onCreate={async (input) => {
            const result = await createCycle(input)
            if (result.ok) setStarting(false)
            return result
          }}
        />
      ) : null}
    </>
  )
}

function CycleDetail({
  cycle,
  canEdit,
  onUpdateGoal,
  onAddOneOnOne,
  onMarkCompleted,
}: {
  cycle: PerformanceCycle
  canEdit: boolean
  onUpdateGoal: (cycleId: string, goalId: string, changes: Partial<PerformanceGoal>) => void
  onAddOneOnOne: (cycleId: string, summary: string, date: string) => void
  onMarkCompleted: (cycleId: string) => void
}) {
  const [note, setNote] = useState("")
  const [noteDate, setNoteDate] = useState(() => new Date().toISOString().slice(0, 10))

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{cycle.employeeName}</h2>
            <p className="text-sm text-muted-foreground">
              {cycle.title} · Manager {cycle.managerName} · {cycle.period}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{cycle.status}</Badge>
            {canEdit && cycle.status === "Active" ? (
              <Button size="sm" variant="outline" onClick={() => onMarkCompleted(cycle.id)}>
                Mark completed
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <h3 className="font-semibold">Goals</h3>
        <ul className="mt-4 space-y-4">
          {cycle.goals.map((goal) => (
            <li key={goal.id}>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{goal.title}</span>
                {canEdit ? (
                  <div className="w-36">
                    <OptionSelect
                      value={goal.status}
                      options={goalStatuses}
                      onChange={(status) => onUpdateGoal(cycle.id, goal.id, { status })}
                    />
                  </div>
                ) : (
                  <Badge
                    variant="outline"
                    className={cn(
                      goal.status === "At risk" && "border-amber-500/30 text-amber-700 dark:text-amber-400",
                      goal.status === "Done" && "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {goal.status}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Progress value={goal.progress} className="h-1.5 flex-1" />
                {canEdit ? (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={goal.progress}
                    className="h-8 w-16 text-xs"
                    onChange={(event) =>
                      onUpdateGoal(cycle.id, goal.id, { progress: Number(event.target.value) || 0 })
                    }
                  />
                ) : (
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {goal.progress}%
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <h3 className="font-semibold">1:1 notes</h3>
        {canEdit ? (
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[8rem_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault()
              onAddOneOnOne(cycle.id, note, noteDate)
              setNote("")
            }}
          >
            <Input type="date" value={noteDate} onChange={(event) => setNoteDate(event.target.value)} />
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Discussion summary"
              className="min-h-10"
            />
            <Button type="submit" variant="outline" disabled={!note.trim()}>
              Add
            </Button>
          </form>
        ) : null}
        <ul className="mt-3 divide-y text-sm">
          {cycle.oneOnOnes.map((item) => (
            <li key={item.id} className="py-3">
              <p className="text-xs text-muted-foreground">{item.date}</p>
              <p className="mt-1">{item.summary}</p>
            </li>
          ))}
          {!cycle.oneOnOnes.length ? (
            <li className="py-3 text-muted-foreground">No 1:1 notes yet.</li>
          ) : null}
        </ul>
      </div>
    </section>
  )
}

function StartCycleDialog({
  cycles,
  onClose,
  onCreate,
}: {
  cycles: PerformanceCycle[]
  onClose: () => void
  onCreate: (input: {
    employeeId: string
    employeeName: string
    title: string
    managerName: string
    period: string
  }) => Promise<{ ok: true } | { ok: false; message: string }>
}) {
  const { employees, getEmployee } = useOrganization()
  const periodDefault = currentPeriod()
  const activeKeys = new Set(
    cycles
      .filter((cycle) => cycle.status === "Active")
      .map((cycle) => `${cycle.employeeId}:${cycle.period}`)
  )
  const eligible = employees
    .filter((employee) => employee.status === "Active" && !activeKeys.has(`${employee.id}:${periodDefault}`))
    .sort((a, b) => a.name.localeCompare(b.name))
  const [employeeId, setEmployeeId] = useState(eligible[0]?.id ?? "")
  const [period, setPeriod] = useState(periodDefault)
  const [managerName, setManagerName] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const employee = employees.find((item) => item.id === employeeId)
    if (!employee) return
    const manager = employee.managerId ? getEmployee(employee.managerId) : undefined
    setManagerName(manager?.name ?? "")
  }, [employeeId, employees, getEmployee])

  async function submit() {
    const employee = eligible.find((item) => item.id === employeeId)
    if (!employee) return setError("Choose a person.")
    if (!period.trim()) return setError("Enter a period.")
    setSaving(true)
    setError("")
    const result = await onCreate({
      employeeId: employee.id,
      employeeName: employee.name,
      title: employee.title,
      managerName: managerName.trim(),
      period: period.trim(),
    })
    setSaving(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start performance cycle</DialogTitle>
          <DialogDescription>
            Creates a review cycle with default goals for the selected person and period.
          </DialogDescription>
        </DialogHeader>
        {eligible.length ? (
          <form
            id="performance-form"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <Field label="Employee">
              <KeyedSelect
                className="w-full"
                value={employeeId}
                onChange={setEmployeeId}
                options={eligible.map((item) => [item.id, item.name] as const)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Period" htmlFor="perf-period">
                <Input
                  id="perf-period"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                  placeholder="H2 2026"
                />
              </Field>
              <Field label="Manager" htmlFor="perf-manager">
                <Input
                  id="perf-manager"
                  value={managerName}
                  onChange={(event) => setManagerName(event.target.value)}
                />
              </Field>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Everyone eligible already has an active cycle for this period.
          </p>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="performance-form" loading={saving} disabled={!eligible.length}>
            {saving ? "Starting…" : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
