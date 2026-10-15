"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowDown, ArrowLeft, ArrowUp, Bot, Pencil, Plus, Sparkles, Trash2, User } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, KeyedSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useOrganization } from "@/components/dashboard/organization-store"
import { ProcessDialog } from "@/components/dashboard/process-dialog"
import { ProcessRunsPanel } from "@/components/dashboard/process-runs-panel"
import { useProcesses } from "@/components/dashboard/processes-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import { capabilities, capabilityName, type Decision } from "@/lib/governance"
import {
  bestCasePlan,
  candidateAgents,
  formatHours,
  processMetrics,
  type Performer,
  type Process,
  type ProcessMetrics,
  type ProcessStep,
  type StepResult,
} from "@/lib/processes"

const outcomeVariant: Record<Decision["outcome"], "secondary" | "outline" | "destructive" | "default"> = {
  "Auto-execute": "secondary",
  "Needs approval": "outline",
  "Draft only": "outline",
  Blocked: "destructive",
}

export default function ProcessDetailPage() {
  const { processId } = useParams<{ processId: string }>()
  const router = useRouter()
  const { loading, getProcess, policy, canEdit, deleteProcess } = useProcesses()
  const { getEmployee, getDepartment } = useOrganization()
  const [editingDetails, setEditingDetails] = useState(false)
  const process = getProcess(processId)

  if (loading) {
    return (
      <>
        <DashboardHeader title="Process" parent="Processes" />
        <PageLoadingState label="Loading process…" variant="detail" />
      </>
    )
  }

  if (!process) {
    return (
      <>
        <DashboardHeader title="Process" parent="Processes" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-medium">This process doesn&apos;t exist.</p>
          <Button variant="outline" render={<Link href="/dashboard/processes" />}>
            All processes
          </Button>
        </div>
      </>
    )
  }

  const editable = canEdit(process)
  const metrics = processMetrics(process, policy)

  return (
    <>
      <DashboardHeader title={process.name} parent="Processes" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <Link href="/dashboard/processes" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Processes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{process.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {getDepartment(process.departmentId)?.name} · Owner {getEmployee(process.ownerId)?.name ?? "—"} ·{" "}
              {process.runsPerWeek} runs / week
              {process.context.amount ? ` · typical $${process.context.amount.toLocaleString()}` : ""}
            </p>
            {process.description ? <p className="mt-1 max-w-2xl text-sm">{process.description}</p> : null}
          </div>
          {editable ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingDetails(true)}>
                <Pencil data-icon="inline-start" />
                Edit details
              </Button>
              <Button
                variant="ghost"
                aria-label="Delete process"
                onClick={() => {
                  if (window.confirm(`Delete ${process.name}?`)) {
                    deleteProcess(process.id)
                    router.push("/dashboard/processes")
                  }
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ) : null}
        </div>

        <MetricStrip metrics={metrics} />

        <ProcessRunsPanel processId={process.id} />

        <div className="grid gap-4 xl:grid-cols-2">
          <StepList process={process} metrics={metrics} editable={editable} />
          {/* Remount when steps change so the simulation never runs on stale step data. */}
          <Simulation key={JSON.stringify(process.steps)} process={process} editable={editable} />
        </div>
      </div>

      {editingDetails ? <ProcessDialog process={process} onClose={() => setEditingDetails(false)} /> : null}
    </>
  )
}

function MetricStrip({ metrics, compare }: { metrics: ProcessMetrics; compare?: ProcessMetrics }) {
  const items: [string, string, number, number | undefined][] = [
    ["Cycle time", formatHours(metrics.cycleHours), metrics.cycleHours, compare?.cycleHours],
    ["Person time / run", formatHours(metrics.humanMinutesPerRun / 60), metrics.humanMinutesPerRun, compare?.humanMinutesPerRun],
    ["Person time / week", formatHours(metrics.humanHoursPerWeek), metrics.humanHoursPerWeek, compare?.humanHoursPerWeek],
    ["Steps a person touches", String(metrics.humanTouches), metrics.humanTouches, compare?.humanTouches],
  ]
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
      {items.map(([label, value, raw, before]) => {
        const delta = before === undefined || before === 0 ? null : Math.round(((raw - before) / before) * 100)
        return (
          <div key={label} className="bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {value}
              {delta ? (
                <span className={cn("ml-1.5 text-xs font-medium", delta < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                  {delta > 0 ? "+" : ""}
                  {delta}%
                </span>
              ) : null}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function PerformerLabel({ performer }: { performer: Performer }) {
  const { getEmployee } = useOrganization()
  const { policy } = useProcesses()
  if (performer.kind === "agent") {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <Bot className="size-3.5" />
        {policy.passports.find((p) => p.id === performer.passportId)?.agent ?? "Revoked agent"}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <User className="size-3.5 text-muted-foreground" />
      {getEmployee(performer.employeeId)?.name ?? "Former member"}
    </span>
  )
}

function OutcomeBadge({ result }: { result: StepResult }) {
  if (!result.decision) return null
  return (
    <Badge variant={outcomeVariant[result.decision.outcome]} title={result.decision.reasons.join("\n")}>
      {result.decision.outcome}
      {result.decision.approver ? ` · ${result.decision.approver}` : ""}
    </Badge>
  )
}

function StepList({ process, metrics, editable }: { process: Process; metrics: ProcessMetrics; editable: boolean }) {
  const { removeStep, moveStep } = useProcesses()
  const [editing, setEditing] = useState<ProcessStep | "new" | null>(null)

  return (
    <section className="h-fit rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">Steps today</h2>
        {editable ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
            <Plus data-icon="inline-start" />
            Add step
          </Button>
        ) : null}
      </div>
      <ol className="divide-y">
        {metrics.steps.map((result, index) => {
          const step = result.step
          return (
            <li key={step.id} className="group flex gap-3 px-4 py-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{step.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <PerformerLabel performer={step.performer} />
                  <span>· {step.durationMin}m work</span>
                  <span>· waits {formatHours(step.waitHours)}</span>
                  {step.capabilityId ? <span>· {capabilityName(step.capabilityId)}</span> : null}
                </p>
                <div className="mt-1">
                  <OutcomeBadge result={result} />
                </div>
              </div>
              {editable ? (
                <div className="flex shrink-0 items-start opacity-60 group-hover:opacity-100">
                  <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => moveStep(process.id, step.id, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={index === process.steps.length - 1}
                    onClick={() => moveStep(process.id, step.id, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Edit step" onClick={() => setEditing(step)}>
                    <Pencil />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Remove step" onClick={() => removeStep(process.id, step.id)}>
                    <Trash2 />
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
        {!process.steps.length ? (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">Add the first step of this process.</li>
        ) : null}
      </ol>
      {editing ? (
        <StepDialog
          key={editing === "new" ? "new" : editing.id}
          process={process}
          step={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  )
}

/** Digital twin: reassign steps, see the projected effect under current governance, then apply. */
function Simulation({ process, editable }: { process: Process; editable: boolean }) {
  const { policy, applyPlan } = useProcesses()
  const [plan, setPlan] = useState<Process>(process)
  const before = processMetrics(process, policy)
  const after = processMetrics(plan, policy)
  const changed = plan.steps.filter((step, index) => step.performer !== process.steps[index]?.performer).length
  const blocked = after.steps.some((result) => result.decision?.outcome === "Blocked")

  function assign(stepId: string, value: string) {
    const original = process.steps.find((step) => step.id === stepId)!
    setPlan((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id !== stepId
          ? step
          : value === "keep"
            ? original
            : value.startsWith("person:")
              ? { ...step, performer: { kind: "person", employeeId: value.slice(7) } }
              : { ...step, performer: { kind: "agent", passportId: value.slice(6) } }
      ),
    }))
  }

  return (
    <section className="h-fit rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">Simulate changes</h2>
        <Button size="sm" variant="ghost" onClick={() => setPlan(bestCasePlan(process, policy))}>
          <Sparkles data-icon="inline-start" />
          Suggest best plan
        </Button>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          Hand steps to agents and see what governance would allow. Approval adds ~5 min of person time and a ~2h wait;
          draft-only agents still need a person to review.
        </p>
        <ol className="space-y-2">
          {after.steps.map((result, index) => {
            const step = result.step
            const original = process.steps[index]
            const agents = candidateAgents(step, policy)
            const value =
              step.performer === original.performer
                ? "keep"
                : step.performer.kind === "agent"
                  ? `agent:${step.performer.passportId}`
                  : `person:${step.performer.employeeId}`
            return (
              <li key={step.id} className="rounded-md border p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {index + 1}. {step.name}
                  </span>
                  <KeyedSelect
                    value={value}
                    onChange={(next) => assign(step.id, next)}
                    disabled={!step.capabilityId && original.performer.kind === "person"}
                    options={[
                      ["keep", original.performer.kind === "agent" ? "Keep agent" : "Keep with person"],
                      ...(original.performer.kind === "agent" && process.ownerId
                        ? ([[`person:${process.ownerId}`, "Give back to process owner"]] as const)
                        : []),
                      ...agents
                        .filter((passport) => original.performer.kind !== "agent" || original.performer.passportId !== passport.id)
                        .map((passport) => [`agent:${passport.id}`, `→ ${passport.agent}`] as const),
                    ]}
                  />
                </div>
                {!step.capabilityId && original.performer.kind === "person" ? (
                  <p className="mt-1 text-xs text-muted-foreground">No governed action — agents can&apos;t take this step.</p>
                ) : step.capabilityId && !agents.length && original.performer.kind === "person" ? (
                  <p className="mt-1 text-xs text-muted-foreground">No active agent has “{capabilityName(step.capabilityId)}” in its passport.</p>
                ) : null}
                {result.decision ? (
                  <div className="mt-1.5 space-y-1">
                    <OutcomeBadge result={result} />
                    <p className="text-xs text-muted-foreground">{result.decision.reasons[result.decision.reasons.length - 1]}</p>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>

        <MetricStrip metrics={after} compare={before} />

        {editable ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {blocked
                ? "Some assigned steps would be blocked by governance."
                : changed
                  ? `${changed} step${changed === 1 ? "" : "s"} will change performer.`
                  : "No changes yet."}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={!changed} onClick={() => setPlan(process)}>
                Reset
              </Button>
              <Button size="sm" disabled={!changed || blocked} onClick={() => applyPlan(process.id, plan.steps)}>
                Apply plan
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function StepDialog({ process, step, onClose }: { process: Process; step?: ProcessStep; onClose: () => void }) {
  const { saveStep, policy } = useProcesses()
  const { employees } = useOrganization()
  const [form, setForm] = useState<Omit<ProcessStep, "id">>({
    name: step?.name ?? "",
    performer: step?.performer ?? { kind: "person", employeeId: process.ownerId },
    capabilityId: step?.capabilityId ?? "",
    durationMin: step?.durationMin ?? 15,
    waitHours: step?.waitHours ?? 1,
  })
  const [error, setError] = useState("")
  const agentOptions = policy.passports.filter((passport) => passport.status === "Active")

  function submit() {
    const result = saveStep(process.id, { ...form, id: step?.id })
    if (!result.ok) return setError(result.message)
    onClose()
  }

  const performerValue =
    form.performer.kind === "agent" ? `agent:${form.performer.passportId}` : `person:${form.performer.employeeId}`

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{step ? "Edit step" : "Add step"}</DialogTitle>
        </DialogHeader>
        <form
          id="step-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field label="Step" htmlFor="step-name">
            <Input id="step-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Approve purchase" />
          </Field>
          <Field label="Done by">
            <KeyedSelect
              className="w-full"
              value={performerValue}
              onChange={(value) =>
                setForm({
                  ...form,
                  performer: value.startsWith("agent:")
                    ? { kind: "agent", passportId: value.slice(6) }
                    : { kind: "person", employeeId: value.slice(7) },
                })
              }
              options={[
                ...employees.filter((e) => e.status === "Active").map((e) => [`person:${e.id}`, e.name] as const),
                ...agentOptions.map((p) => [`agent:${p.id}`, `🤖 ${p.agent}`] as const),
              ]}
            />
          </Field>
          <Field label="Governed action">
            <KeyedSelect
              className="w-full"
              value={form.capabilityId}
              onChange={(capabilityId) => setForm({ ...form, capabilityId })}
              options={[["", "None (people only)"], ...capabilities.map((c) => [c.id, `${c.category} · ${c.name}`] as const)]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Person work (min)" htmlFor="step-duration">
              <Input id="step-duration" type="number" min={1} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Waits before (h)" htmlFor="step-wait">
              <Input id="step-wait" type="number" min={0} step={0.5} value={form.waitHours} onChange={(e) => setForm({ ...form, waitHours: Number(e.target.value) || 0 })} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            “Person work” is how long the step takes a person, even when an agent does it — that&apos;s the time saved.
          </p>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="step-form">
            {step ? "Save" : "Add step"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
