"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Bot, Plus } from "lucide-react"

import { useApprovals } from "@/components/dashboard/approvals-store"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, KeyedSelect } from "@/components/dashboard/form-controls"
import { useGovernance } from "@/components/dashboard/governance-store"
import { useOrganization } from "@/components/dashboard/organization-store"
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "cn"
import { agentStats, needsAttention, WEEK_MS } from "@/lib/agent-metrics"
import { agentTemplates, autonomyLevels, capabilityName, type AutonomyLevel } from "@/lib/governance"

export default function AIWorkforcePage() {
  const { passports, defaultAutonomy, canEdit } = useGovernance()
  const { actions, pending } = useApprovals()
  const { getEmployee, getDepartment } = useOrganization()
  const [now] = useState(() => Date.now())
  const [creating, setCreating] = useState(false)

  const week = agentStats(actions, now - WEEK_MS)
  const active = passports.filter((passport) => passport.status === "Active").length

  const summary = [
    { label: "Active agents", value: `${active}`, hint: `of ${passports.length}` },
    { label: "Actions this week", value: `${week.total}`, hint: `${week.blocked} blocked` },
    {
      label: "Ran without a person",
      value: week.autonomyRate === null ? "—" : `${week.autonomyRate}%`,
      hint: "of completed actions",
    },
    { label: "Waiting for approval", value: `${pending.length}`, hint: "", href: "/dashboard/approvals" },
  ]

  return (
    <>
      <DashboardHeader title="AI Workforce" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">AI Workforce</h1>
          {canEdit ? (
            <Button onClick={() => setCreating(true)}>
              <Plus data-icon="inline-start" />
              New agent
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
          {summary.map((item) => {
            const body = (
              <>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {item.value}
                  {item.hint ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{item.hint}</span> : null}
                </p>
              </>
            )
            return item.href ? (
              <Link key={item.label} href={item.href} className="bg-card p-4 hover:bg-muted/40">
                {body}
              </Link>
            ) : (
              <div key={item.label} className="bg-card p-4">
                {body}
              </div>
            )
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {passports.map((passport) => {
            const stats = agentStats(actions, now - WEEK_MS, passport.id)
            const level = passport.autonomy ?? defaultAutonomy
            const attention = passport.status === "Active" && needsAttention(actions, passport.id, now)
            return (
              <Link
                key={passport.id}
                href={`/dashboard/ai-workforce/${passport.id}`}
                className={cn(
                  "flex flex-col rounded-lg border p-4 transition-colors hover:bg-muted/30",
                  passport.status === "Paused" && "opacity-70"
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Bot className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{passport.agent}</p>
                    <p className="text-xs text-muted-foreground">
                      {getDepartment(passport.departmentId ?? "")?.name ?? "No department"} · Owner{" "}
                      {getEmployee(passport.ownerId)?.name ?? "—"}
                    </p>
                  </div>
                  {passport.status === "Paused" ? (
                    <Badge variant="outline">Paused</Badge>
                  ) : attention ? (
                    <Badge variant="destructive">Needs attention</Badge>
                  ) : (
                    <Badge variant="secondary">Active</Badge>
                  )}
                </div>
                {passport.description ? (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{passport.description}</p>
                ) : null}
                <div className="mt-auto pt-4">
                  <p className="text-xs text-muted-foreground">
                    L{level} · {autonomyLevels[level].name}
                    {passport.autonomy === null ? " (default)" : ""}
                  </p>
                  <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
                    {[
                      ["Actions", stats.total],
                      ["Auto", stats.autoExecuted],
                      ["Waiting", stats.pending],
                      ["Blocked", stats.blocked],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md bg-muted/50 py-1.5">
                        <dd className={cn("text-sm font-semibold tabular-nums", label === "Blocked" && Number(value) > 0 && "text-destructive")}>
                          {value}
                        </dd>
                        <dt className="text-[10px] text-muted-foreground uppercase">{label}</dt>
                      </div>
                    ))}
                  </dl>
                </div>
              </Link>
            )
          })}
        </div>
        {!passports.length ? (
          <p className="rounded-lg border p-10 text-center text-sm text-muted-foreground">No agents yet.</p>
        ) : null}
      </div>

      {creating ? <NewAgentDialog onClose={() => setCreating(false)} /> : null}
    </>
  )
}

function NewAgentDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { savePassport } = useGovernance()
  const { employees, departments } = useOrganization()
  const [templateId, setTemplateId] = useState(agentTemplates[0].id)
  const template = agentTemplates.find((item) => item.id === templateId)!
  const [form, setForm] = useState({
    agent: template.id === "custom" ? "" : template.name,
    description: template.description,
    departmentId: template.departmentId,
    ownerId: "",
    autonomy: template.autonomy as AutonomyLevel,
  })
  const [error, setError] = useState("")

  function pick(id: string) {
    const next = agentTemplates.find((item) => item.id === id)!
    setTemplateId(id)
    setForm((current) => ({
      ...current,
      agent: next.id === "custom" ? "" : next.name,
      description: next.description,
      departmentId: next.departmentId,
      autonomy: next.autonomy,
    }))
  }

  function submit() {
    const result = savePassport({
      agent: form.agent,
      description: form.description.trim(),
      departmentId: form.departmentId,
      ownerId: form.ownerId,
      autonomy: form.autonomy,
      capabilityIds: template.capabilityIds,
      status: "Active",
    })
    if (!result.ok) return setError(result.message)
    onClose()
    if (result.id) router.push(`/dashboard/ai-workforce/${result.id}`)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New agent</DialogTitle>
          <DialogDescription>Start from a template. You can fine-tune its permissions afterwards.</DialogDescription>
        </DialogHeader>
        <form
          id="agent-form"
          className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div role="radiogroup" aria-label="Template" className="grid gap-2 sm:grid-cols-2">
            {agentTemplates.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={item.id === templateId}
                onClick={() => pick(item.id)}
                className={cn(
                  "rounded-md border p-2.5 text-left text-sm transition-colors",
                  item.id === templateId ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                )}
              >
                <p className="font-medium">{item.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.capabilityIds.length
                    ? item.capabilityIds.map(capabilityName).join(", ")
                    : "No permissions — add them in Passports"}
                </p>
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="agent-name">
              <Input id="agent-name" value={form.agent} onChange={(e) => setForm({ ...form, agent: e.target.value })} />
            </Field>
            <Field label="Accountable owner">
              <KeyedSelect
                className="w-full"
                value={form.ownerId}
                onChange={(ownerId) => setForm({ ...form, ownerId })}
                options={[["", "Choose a person…"], ...employees.filter((e) => e.status === "Active").map((e) => [e.id, e.name] as const)]}
              />
            </Field>
            <Field label="Department">
              <KeyedSelect
                className="w-full"
                value={form.departmentId}
                onChange={(departmentId) => setForm({ ...form, departmentId })}
                options={[["", "None"], ...departments.map((d) => [d.id, d.name] as const)]}
              />
            </Field>
            <Field label="Autonomy">
              <KeyedSelect
                className="w-full"
                value={String(form.autonomy)}
                onChange={(value) => setForm({ ...form, autonomy: Number(value) as AutonomyLevel })}
                options={autonomyLevels.map((level) => [String(level.level), `L${level.level} · ${level.name}`] as const)}
              />
            </Field>
          </div>
          <Field label="Purpose" htmlFor="agent-description">
            <Textarea
              id="agent-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this agent is responsible for"
              className="min-h-16"
            />
          </Field>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="agent-form">
            Create agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
