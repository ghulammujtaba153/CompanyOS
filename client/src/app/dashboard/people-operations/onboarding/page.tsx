"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, KeyedSelect, OptionSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useOrganization } from "@/components/dashboard/organization-store"
import { usePeopleOps } from "@/components/dashboard/people-ops-store"
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
import { TablePagination } from "@/components/dashboard/table-pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "cn"
import {
  addDays,
  overdueTasks,
  planProgress,
  todayIso,
  type OnboardingPlan,
  type OnboardingTask,
} from "@/lib/people-ops"
import { useClientPagination } from "@/lib/use-client-pagination"
import { formatDate } from "@/lib/work-utils"

const owners: OnboardingTask["owner"][] = ["People Ops", "IT", "Manager", "New hire"]

function startsLabel(startDate: string) {
  const start = Date.parse(startDate)
  if (Number.isNaN(start)) return "Start date TBD"
  const days = Math.round((start - Date.parse(todayIso())) / 86_400_000)
  if (days > 1) return `Starts in ${days} days`
  if (days === 1) return "Starts tomorrow"
  if (days === 0) return "Starts today"
  return `Day ${-days + 1}`
}

export default function PeopleOnboardingPage() {
  const { loading, plans, isPeopleTeam } = usePeopleOps()
  const { getEmployee, getDepartment } = useOrganization()
  const [filter, setFilter] = useState<"active" | "done">("active")
  const [openId, setOpenId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const visible = plans
    .filter((plan) => (filter === "done" ? planProgress(plan) === 100 : planProgress(plan) < 100))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  const pagination = useClientPagination(visible, { pageSize: 10, resetKey: filter })
  const open = plans.find((plan) => plan.id === openId)

  if (loading) {
    return (
      <>
        <DashboardHeader title="Onboarding" parent="People Operations" />
        <PageLoadingState label="Loading onboarding…" variant="list" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="Onboarding" parent="People Operations" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Onboarding</h1>
          {isPeopleTeam ? (
            <Button onClick={() => setStarting(true)}>
              <Plus data-icon="inline-start" />
              Start onboarding
            </Button>
          ) : null}
        </div>

        <Tabs value={filter} onValueChange={(value) => setFilter(value as "active" | "done")}>
          <TabsList variant="line">
            <TabsTrigger value="active">In progress ({plans.filter((p) => planProgress(p) < 100).length})</TabsTrigger>
            <TabsTrigger value="done">Completed</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="overflow-hidden rounded-lg border">
          {visible.length ? (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>New hire</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Buddy</TableHead>
                  <TableHead className="w-48">Checklist</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((plan) => {
                  const person = getEmployee(plan.employeeId)
                  const progress = planProgress(plan)
                  const overdue = overdueTasks(plan).length
                  return (
                    <TableRow key={plan.id} className="cursor-pointer" onClick={() => setOpenId(plan.id)}>
                      <TableCell>
                        <p className="font-medium">{person?.name ?? "Former employee"}</p>
                        <p className="text-xs text-muted-foreground">{person?.title}</p>
                      </TableCell>
                      <TableCell>{person ? getDepartment(person.departmentId)?.name : "—"}</TableCell>
                      <TableCell>
                        <p>{formatDate(plan.startDate)}</p>
                        <p className="text-xs text-muted-foreground">{startsLabel(plan.startDate)}</p>
                      </TableCell>
                      <TableCell>{getEmployee(plan.buddyId)?.name ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="flex-1" />
                          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", overdue && "font-medium text-destructive")}>
                        {overdue}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <TablePagination
              page={pagination.page}
              pageCount={pagination.pageCount}
              total={pagination.total}
              from={pagination.from}
              to={pagination.to}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
            </>
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {filter === "active" ? "No one is onboarding right now." : "No completed onboarding yet."}
            </p>
          )}
        </div>
      </div>

      {open ? <ChecklistDialog plan={open} canEdit={isPeopleTeam} onClose={() => setOpenId(null)} /> : null}
      {starting ? <StartOnboardingDialog onClose={() => setStarting(false)} /> : null}
    </>
  )
}

function ChecklistDialog({
  plan,
  canEdit,
  onClose,
}: {
  plan: OnboardingPlan
  canEdit: boolean
  onClose: () => void
}) {
  const { toggleTask, addTask, removeTask } = usePeopleOps()
  const { me, getEmployee } = useOrganization()
  const person = getEmployee(plan.employeeId)
  const manager = person ? getEmployee(person.managerId) : undefined
  const today = todayIso()
  const [title, setTitle] = useState("")
  const [owner, setOwner] = useState<OnboardingTask["owner"]>("People Ops")
  const [due, setDue] = useState(plan.startDate)

  // People Ops can tick anything; managers their tasks; the new hire their own.
  function canToggle(task: OnboardingTask) {
    if (canEdit) return true
    if (task.owner === "Manager") return manager?.id === me?.id
    if (task.owner === "New hire") return plan.employeeId === me?.id
    return false
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{person?.name ?? "Onboarding"}</DialogTitle>
          <DialogDescription>
            {person?.title} · Starts {formatDate(plan.startDate)} · {planProgress(plan)}% complete
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[55vh] space-y-4 overflow-y-auto px-1">
          <section className="rounded-lg border bg-muted/20 p-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Required documents
            </h3>
            <ul className="mt-2 space-y-2 text-sm">
              {[
                { name: "Signed offer letter", status: "Uploaded" as const },
                { name: "Government ID", status: "Uploaded" as const },
                { name: "Tax / payroll forms", status: "Pending" as const },
                { name: "Emergency contact sheet", status: "Pending" as const },
              ].map((doc) => (
                <li key={doc.name} className="flex items-center justify-between gap-2">
                  <span>{doc.name}</span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      doc.status === "Uploaded"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400"
                    )}
                  >
                    {doc.status}
                  </span>
                </li>
              ))}
            </ul>
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                type="button"
                onClick={() =>
                  window.alert("Document upload is simulated in this demo — no file is stored.")
                }
              >
                Upload document (demo)
              </Button>
            ) : null}
          </section>

          {owners.map((group) => {
            const tasks = plan.tasks
              .filter((task) => task.owner === group)
              .sort((a, b) => a.dueOffset - b.dueOffset)
            if (!tasks.length) return null
            return (
              <section key={group}>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {group}
                  {group === "Manager" && manager ? ` · ${manager.name}` : ""}
                </h3>
                <ul className="divide-y rounded-lg border">
                  {tasks.map((task) => {
                    const dueDate = addDays(plan.startDate, task.dueOffset)
                    const late = !task.done && dueDate < today
                    return (
                      <li key={task.id} className="group flex items-center gap-2.5 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={task.done}
                          disabled={!canToggle(task)}
                          onChange={() => toggleTask(plan.id, task.id)}
                          aria-label={task.title}
                        />
                        <span className={cn("flex-1", task.done && "text-muted-foreground line-through")}>
                          {task.title}
                        </span>
                        <span className={cn("text-xs whitespace-nowrap", late ? "font-medium text-destructive" : "text-muted-foreground")}>
                          {formatDate(dueDate)}
                        </span>
                        {canEdit ? (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100"
                            aria-label={`Remove ${task.title}`}
                            onClick={() => removeTask(plan.id, task.id)}
                          >
                            <X />
                          </Button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>

        {canEdit ? (
          <form
            className="flex flex-wrap items-end gap-2 border-t pt-3"
            onSubmit={(event) => {
              event.preventDefault()
              const dueOffset = Math.round((Date.parse(due) - Date.parse(plan.startDate)) / 86_400_000)
              addTask(plan.id, { title, owner, dueOffset })
              setTitle("")
            }}
          >
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add a task…"
              className="min-w-40 flex-1"
            />
            <div className="w-32">
              <OptionSelect value={owner} options={owners} onChange={setOwner} />
            </div>
            <Input type="date" value={due} onChange={(event) => setDue(event.target.value)} className="w-36" aria-label="Due date" />
            <Button type="submit" variant="outline" disabled={!title.trim()}>
              Add
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function StartOnboardingDialog({ onClose }: { onClose: () => void }) {
  const { plans, startOnboarding } = usePeopleOps()
  const { employees } = useOrganization()
  const eligible = employees
    .filter((employee) => employee.status !== "Suspended" && !plans.some((plan) => plan.employeeId === employee.id))
    // Invited people (not started yet) are the most likely new hires.
    .sort((a, b) => Number(b.status === "Invited") - Number(a.status === "Invited") || a.name.localeCompare(b.name))
  const [employeeId, setEmployeeId] = useState(eligible[0]?.id ?? "")
  const [startDate, setStartDate] = useState(addDays(todayIso(), 14))
  const [buddyId, setBuddyId] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!employeeId) return setError("Choose a person.")
    setSaving(true)
    setError("")
    try {
      const result = await Promise.resolve(startOnboarding(employeeId, startDate, buddyId))
      if (!result.ok) return setError(result.message)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start onboarding</DialogTitle>
          <DialogDescription>Creates the standard checklist for People Ops, IT, the manager, and the new hire.</DialogDescription>
        </DialogHeader>
        {eligible.length ? (
          <form
            id="onboarding-form"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <Field label="New hire">
              <KeyedSelect
                className="w-full"
                value={employeeId}
                onChange={setEmployeeId}
                options={eligible.map((item) => [item.id, `${item.name}${item.status === "Invited" ? " (invited)" : ""}`] as const)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="onb-start">
                <Input id="onb-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </Field>
              <Field label="Buddy">
                <KeyedSelect
                  className="w-full"
                  value={buddyId}
                  onChange={setBuddyId}
                  options={[
                    ["", "No buddy"],
                    ...employees
                      .filter((item) => item.status === "Active" && item.id !== employeeId)
                      .map((item) => [item.id, item.name] as const),
                  ]}
                />
              </Field>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Everyone already has a plan. Invite someone from People first.
          </p>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="onboarding-form" loading={saving} disabled={!eligible.length}>
            {saving ? "Starting…" : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

