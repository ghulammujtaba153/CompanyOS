"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Ban, CheckCircle2, FileEdit, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, KeyedSelect, OptionSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useApprovals } from "@/components/dashboard/approvals-store"
import { useGovernance } from "@/components/dashboard/governance-store"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "cn"
import {
  approvalPaths,
  capabilities,
  capabilityName,
  conditionLabel,
  conditions,
  evaluate,
  riskLevels,
  type Decision,
  type FirewallRule,
  type Risk,
} from "@/lib/governance"
import { useClientPagination } from "@/lib/use-client-pagination"

const riskVariant: Record<Risk, "secondary" | "outline" | "destructive"> = {
  Low: "secondary",
  Medium: "outline",
  High: "destructive",
  Critical: "destructive",
}

export default function GovernanceFirewallPage() {
  const { loading, rules, canEdit, toggleRule, deleteRule } = useGovernance()
  const [editing, setEditing] = useState<FirewallRule | "new" | null>(null)
  const sorted = useMemo(
    () =>
      [...rules].sort(
        (a, b) =>
          capabilityName(a.capabilityId).localeCompare(capabilityName(b.capabilityId)) ||
          a.threshold - b.threshold
      ),
    [rules]
  )
  const pagination = useClientPagination(sorted, { resetKey: rules.length })

  if (loading) {
    return (
      <>
        <DashboardHeader title="Firewall" parent="Governance" />
        <PageLoadingState label="Loading firewall rules…" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="Decision firewall" parent="Governance" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Decision firewall</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Rules checked before an agent acts. When several match, the strictest path wins.
            </p>
          </div>
          {canEdit ? (
            <Button onClick={() => setEditing("new")}>
              <Plus data-icon="inline-start" />
              New rule
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
          <div className="h-fit overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">On</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Required path</TableHead>
                  {canEdit ? <TableHead className="w-20" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((rule) => (
                  <TableRow key={rule.id} className={cn(!rule.enabled && "text-muted-foreground")}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={rule.enabled}
                        disabled={!canEdit}
                        onChange={() => toggleRule(rule.id)}
                        aria-label={`${rule.enabled ? "Disable" : "Enable"} rule`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{capabilityName(rule.capabilityId)}</TableCell>
                    <TableCell>{conditionLabel(rule)}</TableCell>
                    <TableCell>
                      <Badge variant={riskVariant[rule.risk]}>{rule.risk}</Badge>
                    </TableCell>
                    <TableCell className={cn(rule.path === "Block" && "font-medium text-destructive")}>
                      {rule.path}
                    </TableCell>
                    {canEdit ? (
                      <TableCell>
                        <div className="flex justify-end">
                          <Button size="icon-sm" variant="ghost" aria-label="Edit rule" onClick={() => setEditing(rule)}>
                            <Pencil />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Delete rule"
                            onClick={() => {
                              if (window.confirm("Delete this rule?")) deleteRule(rule.id)
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!rules.length ? (
              <p className="p-10 text-center text-sm text-muted-foreground">No rules — agents rely on autonomy alone.</p>
            ) : (
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
            )}
          </div>

          <ActionTester />
        </div>
      </div>

      {editing ? (
        <RuleDialog
          key={editing === "new" ? "new" : editing.id}
          rule={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}

const outcomeStyle: Record<Decision["outcome"], { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  "Auto-execute": { icon: CheckCircle2, tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  "Needs approval": { icon: ShieldAlert, tone: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  "Draft only": { icon: FileEdit, tone: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300" },
  Blocked: { icon: Ban, tone: "border-destructive/30 bg-destructive/10 text-destructive" },
}

/** Runs the real decision engine so admins can check policy before agents hit it. */
function ActionTester() {
  const { passports, rules, defaultAutonomy, canEdit } = useGovernance()
  const { submit } = useApprovals()
  const [submitted, setSubmitted] = useState("")
  const [passportId, setPassportId] = useState(passports[0]?.id ?? "")
  const passport = passports.find((item) => item.id === passportId) ?? passports[0]
  const [capabilityId, setCapabilityId] = useState(passport?.capabilityIds[0] ?? capabilities[0].id)
  const [amount, setAmount] = useState(0)
  const [records, setRecords] = useState(0)
  const [external, setExternal] = useState(false)

  if (!passport) {
    return <p className="rounded-lg border p-6 text-sm text-muted-foreground">Create a passport to test actions.</p>
  }

  const decision = evaluate(passport, capabilityId, { amount, records, external }, rules, defaultAutonomy)
  const style = outcomeStyle[decision.outcome]
  const Icon = style.icon

  return (
    <section className="h-fit space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Test an action</h2>
      <Field label="Agent">
        <KeyedSelect
          className="w-full"
          value={passport.id}
          onChange={setPassportId}
          options={passports.map((item) => [item.id, item.agent] as const)}
        />
      </Field>
      <Field label="Action">
        <KeyedSelect
          className="w-full"
          value={capabilityId}
          onChange={setCapabilityId}
          options={capabilities.map(
            (item) => [item.id, `${item.name}${passport.capabilityIds.includes(item.id) ? "" : " (not in passport)"}`] as const
          )}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount ($)" htmlFor="test-amount">
          <Input id="test-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Records" htmlFor="test-records">
          <Input id="test-records" type="number" min={0} value={records} onChange={(e) => setRecords(Number(e.target.value) || 0)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-primary" checked={external} onChange={(e) => setExternal(e.target.checked)} />
        Involves an external party
      </label>

      <div className={cn("rounded-md border p-3", style.tone)} aria-live="polite">
        <p className="flex items-center gap-2 font-semibold">
          <Icon className="size-4" />
          {decision.outcome}
          {decision.approver ? <span className="font-normal">· {decision.approver}</span> : null}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {decision.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      {canEdit ? (
        <div className="space-y-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              const action = submit({
                passportId: passport.id,
                capabilityId,
                title: `Test: ${capabilityName(capabilityId)}`,
                detail: `Submitted from the firewall tester${amount ? ` · ${amount.toLocaleString()}` : ""}`,
                context: { amount, records, external },
              })
              setSubmitted(action ? `Logged as ${action.status}.` : "")
            }}
          >
            Submit as agent request
          </Button>
          {submitted ? (
            <p className="text-xs text-muted-foreground">
              {submitted}{" "}
              <Link href="/dashboard/approvals" className="underline underline-offset-2">
                Open approvals
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function RuleDialog({ rule, onClose }: { rule?: FirewallRule; onClose: () => void }) {
  const { saveRule } = useGovernance()
  const [form, setForm] = useState<Omit<FirewallRule, "id">>({
    capabilityId: rule?.capabilityId ?? capabilities[0].id,
    condition: rule?.condition ?? "Always",
    threshold: rule?.threshold ?? 0,
    risk: rule?.risk ?? "Medium",
    path: rule?.path ?? "Accountable owner",
    enabled: rule?.enabled ?? true,
  })
  const [error, setError] = useState("")
  const needsThreshold = form.condition === "Amount over" || form.condition === "Records over"

  function submit() {
    const result = saveRule({ ...form, threshold: needsThreshold ? form.threshold : 0, id: rule?.id })
    if (!result.ok) return setError(result.message)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "New firewall rule"}</DialogTitle>
        </DialogHeader>
        <form
          id="rule-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field label="Action">
            <KeyedSelect
              className="w-full"
              value={form.capabilityId}
              onChange={(capabilityId) => setForm({ ...form, capabilityId })}
              options={capabilities.map((item) => [item.id, `${item.category} · ${item.name}`] as const)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="When">
              <OptionSelect value={form.condition} options={conditions} onChange={(condition) => setForm({ ...form, condition })} />
            </Field>
            {needsThreshold ? (
              <Field label={form.condition === "Amount over" ? "Amount ($)" : "Records"} htmlFor="rule-threshold">
                <Input
                  id="rule-threshold"
                  type="number"
                  min={1}
                  value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) || 0 })}
                />
              </Field>
            ) : null}
            <Field label="Risk">
              <OptionSelect value={form.risk} options={riskLevels} onChange={(risk) => setForm({ ...form, risk })} />
            </Field>
            <Field label="Required path">
              <OptionSelect value={form.path} options={approvalPaths} onChange={(path) => setForm({ ...form, path })} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            L4 agents need approval whenever a rule with a path other than Auto-execute matches. L5 agents only stop
            for High or Critical rules. Block always stops the action.
          </p>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rule-form">
            {rule ? "Save" : "Add rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
