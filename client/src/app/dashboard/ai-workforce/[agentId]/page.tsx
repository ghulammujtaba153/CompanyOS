"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Bot, Pause, Play } from "lucide-react"

import { useApprovals, type ActionStatus } from "@/components/dashboard/approvals-store"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { KeyedSelect } from "@/components/dashboard/form-controls"
import { useGovernance } from "@/components/dashboard/governance-store"
import { useOrganization } from "@/components/dashboard/organization-store"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { agentStats, WEEK_MS } from "@/lib/agent-metrics"
import { autonomyLevels, capabilityName, type AutonomyLevel } from "@/lib/governance"
import { useClientPagination } from "@/lib/use-client-pagination"
import { cn } from "@/lib/utils"

const statusVariant: Record<ActionStatus, "secondary" | "outline" | "destructive" | "default"> = {
  Pending: "outline",
  Approved: "default",
  Declined: "destructive",
  "Auto-executed": "secondary",
  Blocked: "destructive",
  Drafted: "outline",
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const { loading, passports, defaultAutonomy, canEdit, savePassport } = useGovernance()
  const { actions } = useApprovals()
  const { getEmployee, getDepartment } = useOrganization()
  const [now] = useState(() => Date.now())
  const passport = passports.find((item) => item.id === agentId)
  const history = actions
    .filter((action) => action.passportId === agentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const pagination = useClientPagination(history, { resetKey: `${agentId}|${history.length}` })

  if (loading) {
    return (
      <>
        <DashboardHeader title="Agent" parent="AI Workforce" />
        <PageLoadingState label="Loading agent…" variant="detail" />
      </>
    )
  }

  if (!passport) {
    return (
      <>
        <DashboardHeader title="Agent" parent="AI Workforce" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-medium">This agent doesn&apos;t exist or its passport was revoked.</p>
          <Button variant="outline" render={<Link href="/dashboard/ai-workforce" />}>
            All agents
          </Button>
        </div>
      </>
    )
  }

  const stats = agentStats(actions, now - WEEK_MS, passport.id)
  const level = passport.autonomy ?? defaultAutonomy

  return (
    <>
      <DashboardHeader title={passport.agent} parent="AI Workforce" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <Link
          href="/dashboard/ai-workforce"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          AI Workforce
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Bot className="size-5" />
            </span>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                {passport.agent}
                <Badge variant={passport.status === "Active" ? "secondary" : "outline"}>{passport.status}</Badge>
              </h1>
              <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
                {passport.description || "No purpose described."}
              </p>
            </div>
          </div>
          {canEdit ? (
            <div className="flex gap-2">
              <Button variant="outline" render={<Link href="/dashboard/governance/passports" />}>
                Edit permissions
              </Button>
              <Button
                variant={passport.status === "Active" ? "outline" : "default"}
                onClick={() => savePassport({ ...passport, status: passport.status === "Active" ? "Paused" : "Active" })}
              >
                {passport.status === "Active" ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                {passport.status === "Active" ? "Pause" : "Resume"}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <aside className="h-fit space-y-4 rounded-lg border p-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">Owner</dt>
              <dd>{getEmployee(passport.ownerId)?.name ?? "—"}</dd>
              <dt className="text-muted-foreground">Department</dt>
              <dd>{getDepartment(passport.departmentId ?? "")?.name ?? "—"}</dd>
              <dt className="self-center text-muted-foreground">Autonomy</dt>
              <dd>
                {canEdit ? (
                  <KeyedSelect
                    className="w-full"
                    value={passport.autonomy === null ? "default" : String(passport.autonomy)}
                    onChange={(value) =>
                      savePassport({ ...passport, autonomy: value === "default" ? null : (Number(value) as AutonomyLevel) })
                    }
                    options={[
                      ["default", `Default (L${defaultAutonomy})`],
                      ...autonomyLevels.map((item) => [String(item.level), `L${item.level} · ${item.name}`] as const),
                    ]}
                  />
                ) : (
                  `L${level} · ${autonomyLevels[level].name}`
                )}
              </dd>
            </dl>
            <p className="text-xs text-muted-foreground">{autonomyLevels[level].description}</p>
            <div>
              <p className="mb-1.5 font-medium">Allowed actions</p>
              {passport.capabilityIds.length ? (
                <div className="flex flex-wrap gap-1">
                  {passport.capabilityIds.map((id) => (
                    <Badge key={id} variant="secondary">
                      {capabilityName(id)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">None — every action will be blocked.</p>
              )}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-6">
              {[
                ["Actions (7d)", stats.total],
                ["Auto-executed", stats.autoExecuted],
                ["Approved", stats.approved],
                ["Declined", stats.declined],
                ["Waiting", stats.pending],
                ["Blocked", stats.blocked],
              ].map(([label, value]) => (
                <div key={label} className="bg-card p-3">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-lg font-semibold tabular-nums",
                      (label === "Blocked" || label === "Declined") && Number(value) > 0 && "text-destructive"
                    )}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <section className="overflow-hidden rounded-lg border">
              <h2 className="border-b px-4 py-2.5 text-sm font-medium">Activity</h2>
              {history.length ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Decided by</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagination.pageItems.map((action) => (
                        <TableRow key={action.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{when(action.createdAt)}</TableCell>
                          <TableCell>
                            <p className="font-medium">{action.title}</p>
                            <p className="max-w-md truncate text-xs text-muted-foreground">
                              {action.note ? `“${action.note}”` : action.reasons[0]}
                            </p>
                          </TableCell>
                          <TableCell>
                            {action.status === "Pending" ? (
                              <Link href="/dashboard/approvals">
                                <Badge variant={statusVariant.Pending}>Pending · review</Badge>
                              </Link>
                            ) : (
                              <Badge variant={statusVariant[action.status]}>{action.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {action.decidedBy ? getEmployee(action.decidedBy)?.name ?? "Former member" : "Policy"}
                          </TableCell>
                        </TableRow>
                      ))}
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
                <p className="p-8 text-center text-sm text-muted-foreground">No activity yet.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  )
}
