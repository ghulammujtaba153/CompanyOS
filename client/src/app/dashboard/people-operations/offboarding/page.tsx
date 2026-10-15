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
import { peopleOpsApi, type ApiOffboardingPlan } from "@/lib/auth-api"
import {
  offboardingProgress,
  seedOffboardingPlans,
  type OffboardingPlan,
  type OffboardingTask,
} from "@/lib/offboarding"
import { cn } from "@/lib/utils"
import { InlineListSkeleton } from "@/components/dashboard/page-skeletons"

const reasons: OffboardingPlan["reason"][] = [
  "Resignation",
  "End of contract",
  "Restructuring",
  "Other",
]

function mapPlan(row: ApiOffboardingPlan): OffboardingPlan {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    title: row.title,
    department: row.department,
    lastDay: row.lastDay,
    reason: row.reason as OffboardingPlan["reason"],
    status: row.status as OffboardingPlan["status"],
    tasks: (row.tasks as OffboardingTask[]).map((task) => ({
      id: String(task.id),
      title: String(task.title ?? ""),
      owner: task.owner as OffboardingTask["owner"],
      dueDate: String(task.dueDate ?? ""),
      done: Boolean(task.done),
    })),
  }
}

export default function OffboardingPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const { isPeopleTeam } = usePeopleOps()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [plans, setPlans] = useState<OffboardingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"active" | "done">("active")
  const [openId, setOpenId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setPlans(seedOffboardingPlans)
      setOpenId((current) => current ?? seedOffboardingPlans[0]?.id ?? null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await peopleOpsApi.listOffboarding(activeOrgId)
      const mapped = rows.map(mapPlan)
      setPlans(mapped)
      setOpenId((current) => {
        if (current && mapped.some((plan) => plan.id === current)) return current
        return mapped[0]?.id ?? null
      })
    } catch {
      setPlans([])
      setNotice("Could not load offboarding plans.")
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void load()
  }, [load])

  const visible = plans.filter((plan) =>
    filter === "done" ? plan.status === "Completed" : plan.status === "In progress"
  )
  const open = plans.find((plan) => plan.id === openId) ?? visible[0]

  async function toggleTask(planId: string, taskId: string) {
    const plan = plans.find((item) => item.id === planId)
    if (!plan) return
    const tasks = plan.tasks.map((task) =>
      task.id === taskId ? { ...task, done: !task.done } : task
    )
    const progress = offboardingProgress({ ...plan, tasks })
    const next: OffboardingPlan = {
      ...plan,
      tasks,
      status: progress === 100 ? "Completed" : "In progress",
    }
    setPlans((current) => current.map((item) => (item.id === planId ? next : item)))
    if (useApi) {
      try {
        const row = await peopleOpsApi.updateOffboarding(planId, { tasks })
        setPlans((current) => current.map((item) => (item.id === planId ? mapPlan(row) : item)))
      } catch {
        setNotice("Could not update task.")
        void load()
      }
    }
  }

  async function createPlan(input: {
    employeeId: string
    employeeName: string
    title: string
    department: string
    lastDay: string
    reason: OffboardingPlan["reason"]
  }) {
    if (useApi && activeOrgId) {
      try {
        const row = await peopleOpsApi.createOffboarding(activeOrgId, input)
        const plan = mapPlan(row)
        setPlans((current) => [plan, ...current])
        setOpenId(plan.id)
        setFilter("active")
        setNotice("Offboarding plan started.")
        return { ok: true as const }
      } catch (err) {
        return {
          ok: false as const,
          message: err instanceof Error ? err.message : "Could not start offboarding.",
        }
      }
    }
    const id = `offb-${Date.now()}`
    const plan: OffboardingPlan = {
      id,
      ...input,
      status: "In progress",
      tasks: [
        {
          id: `${id}-1`,
          title: "Collect laptop and access badge",
          owner: "IT",
          dueDate: input.lastDay,
          done: false,
        },
        {
          id: `${id}-2`,
          title: "Revoke SSO and SaaS access",
          owner: "IT",
          dueDate: input.lastDay,
          done: false,
        },
        {
          id: `${id}-3`,
          title: "Exit interview",
          owner: "People Ops",
          dueDate: input.lastDay,
          done: false,
        },
      ],
    }
    setPlans((current) => [plan, ...current])
    setOpenId(plan.id)
    setFilter("active")
    setNotice("Offboarding plan started.")
    return { ok: true as const }
  }

  return (
    <>
      <DashboardHeader title="Offboarding" parent="People Operations" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Offboarding</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Access revoke, asset return, and exit steps when someone leaves.
            </p>
          </div>
          {isPeopleTeam ? (
            <Button size="sm" onClick={() => setStarting(true)}>
              <Plus data-icon="inline-start" />
              Start offboarding
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
            variant={filter === "active" ? "default" : "outline"}
            onClick={() => setFilter("active")}
          >
            In progress
          </Button>
          <Button
            size="sm"
            variant={filter === "done" ? "default" : "outline"}
            onClick={() => setFilter("done")}
          >
            Completed
          </Button>
        </div>

        {loading ? (
          <InlineListSkeleton rows={5} />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
            <ul className="space-y-2">
              {visible.map((plan) => {
                const pct = offboardingProgress(plan)
                return (
                  <li key={plan.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(plan.id)}
                      className={cn(
                        "w-full rounded-2xl border bg-card px-4 py-3 text-left transition-colors",
                        open?.id === plan.id
                          ? "border-foreground ring-1 ring-foreground/10"
                          : "hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{plan.employeeName}</p>
                          <p className="text-xs text-muted-foreground">
                            {plan.title} · last day {plan.lastDay}
                          </p>
                        </div>
                        <Badge variant="outline">{plan.reason}</Badge>
                      </div>
                      <Progress value={pct} className="mt-3 h-1.5" />
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{pct}%</p>
                    </button>
                  </li>
                )
              })}
              {!visible.length ? (
                <li className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No plans in this filter.
                </li>
              ) : null}
            </ul>

            {open ? <OffboardingDetail plan={open} onToggle={toggleTask} /> : null}
          </div>
        )}
      </div>

      {starting ? (
        <StartOffboardingDialog
          plans={plans}
          onClose={() => setStarting(false)}
          onCreate={async (input) => {
            const result = await createPlan(input)
            if (result.ok) setStarting(false)
            return result
          }}
        />
      ) : null}
    </>
  )
}

function OffboardingDetail({
  plan,
  onToggle,
}: {
  plan: OffboardingPlan
  onToggle: (planId: string, taskId: string) => void
}) {
  const pct = offboardingProgress(plan)
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{plan.employeeName}</h2>
          <p className="text-sm text-muted-foreground">
            {plan.department} · {plan.status}
          </p>
        </div>
        <Badge variant="outline">{pct}% complete</Badge>
      </div>
      <ul className="mt-5 space-y-2">
        {plan.tasks.map((task) => (
          <li
            key={task.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm"
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={task.done}
                onChange={() => onToggle(plan.id, task.id)}
              />
              <span>
                <span className={cn("font-medium", task.done && "text-muted-foreground line-through")}>
                  {task.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {task.owner} · due {task.dueDate}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}

function StartOffboardingDialog({
  plans,
  onClose,
  onCreate,
}: {
  plans: OffboardingPlan[]
  onClose: () => void
  onCreate: (input: {
    employeeId: string
    employeeName: string
    title: string
    department: string
    lastDay: string
    reason: OffboardingPlan["reason"]
  }) => Promise<{ ok: true } | { ok: false; message: string }>
}) {
  const { employees, getDepartment } = useOrganization()
  const activeIds = new Set(
    plans.filter((plan) => plan.status === "In progress").map((plan) => plan.employeeId)
  )
  const eligible = employees
    .filter((employee) => employee.status === "Active" && !activeIds.has(employee.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const [employeeId, setEmployeeId] = useState(eligible[0]?.id ?? "")
  const [lastDay, setLastDay] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().slice(0, 10)
  })
  const [reason, setReason] = useState<OffboardingPlan["reason"]>("Resignation")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    const employee = eligible.find((item) => item.id === employeeId)
    if (!employee) return setError("Choose a person.")
    if (!lastDay) return setError("Choose a last day.")
    setSaving(true)
    setError("")
    const result = await onCreate({
      employeeId: employee.id,
      employeeName: employee.name,
      title: employee.title,
      department: getDepartment(employee.departmentId)?.name ?? "",
      lastDay,
      reason,
    })
    setSaving(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start offboarding</DialogTitle>
          <DialogDescription>
            Creates the standard exit checklist for IT, People Ops, Finance, and the manager.
          </DialogDescription>
        </DialogHeader>
        {eligible.length ? (
          <form
            id="offboarding-form"
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
              <Field label="Last day" htmlFor="offb-last">
                <Input
                  id="offb-last"
                  type="date"
                  value={lastDay}
                  onChange={(event) => setLastDay(event.target.value)}
                />
              </Field>
              <Field label="Reason">
                <OptionSelect value={reason} options={reasons} onChange={setReason} />
              </Field>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Everyone active already has an offboarding plan, or there are no active employees.
          </p>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="offboarding-form" loading={saving} disabled={!eligible.length}>
            {saving ? "Starting…" : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
