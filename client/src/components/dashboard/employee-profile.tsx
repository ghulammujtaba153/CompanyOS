"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import {
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  Mail,
  MapPin,
  Phone,
  TrendingUp,
  Users,
} from "lucide-react"

import { useOrganization } from "@/components/dashboard/organization-store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  formatMoney,
  getCompensation,
  getDirectReports,
  getEmployeeIssues,
  getEmployeeLeave,
  getEmployeeProjects,
  getOnboarding,
  leaveDaysUsed,
  profileStats,
} from "@/lib/employee-hr"
import { leaveAllowance, workingDays } from "@/lib/people-ops"
import { canManagePeople, type Employee } from "@/lib/organization"
import { issueHref, projectHref, formatDate, initials } from "@/lib/work-utils"

export function EmployeeProfile({ employee }: { employee: Employee }) {
  const { me, getEmployee, getDepartment, employees } = useOrganization()
  const canViewComp = canManagePeople(me?.accessRole)

  const department = getDepartment(employee.departmentId)
  const manager = getEmployee(employee.managerId)
  const reports = getDirectReports(employee.id, employees)
  const compensation = getCompensation(employee.id)
  const projects = getEmployeeProjects(employee)
  const issues = getEmployeeIssues(employee)
  const leave = getEmployeeLeave(employee.id)
  const onboarding = getOnboarding(employee.id)
  const stats = profileStats(employee)
  const lastPaid = compensation?.payments.find((payment) => payment.status === "Paid")

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar size="lg">
            <AvatarFallback className="text-sm">{initials(employee.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{employee.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {employee.title || "No title"} · {department?.name ?? "No department"}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline">{employee.accessRole}</Badge>
              <Badge
                variant={
                  employee.status === "Suspended"
                    ? "destructive"
                    : employee.status === "Invited"
                      ? "outline"
                      : "secondary"
                }
              >
                {employee.status}
              </Badge>
              {compensation ? (
                <Badge variant="secondary">{compensation.employmentType}</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Projects" value={String(stats.projectCount)} />
          <Stat label="Open tickets" value={String(stats.openIssues)} />
          <Stat label="Leave requests" value={String(stats.leaveCount)} />
          <Stat
            label="Last paid"
            value={stats.lastPaidOn ? formatDate(stats.lastPaidOn) : "—"}
          />
        </div>
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <div className="overflow-x-auto">
          <TabsList className="h-auto w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {canViewComp ? (
              <TabsTrigger value="compensation">Compensation</TabsTrigger>
            ) : null}
            <TabsTrigger value="work">Work</TabsTrigger>
            <TabsTrigger value="leave">Leave</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Contact">
              <DetailRow Icon={Mail} label="Email" value={employee.email} />
              <DetailRow Icon={Phone} label="Phone" value={compensation?.phone ?? "—"} />
              <DetailRow
                Icon={MapPin}
                label="Location"
                value={compensation?.location ?? "—"}
              />
            </Panel>

            <Panel title="Employment">
              <DetailRow
                Icon={Building2}
                label="Department"
                value={department?.name ?? "—"}
              />
              <DetailRow
                Icon={Users}
                label="Manager"
                value={
                  manager ? (
                    <Link
                      href={`/dashboard/organization/people/${manager.id}`}
                      className="hover:underline"
                    >
                      {manager.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <DetailRow
                Icon={CalendarDays}
                label="Joined"
                value={formatDate(employee.since)}
              />
              <DetailRow
                Icon={Briefcase}
                label="Employment"
                value={compensation?.employmentType ?? "—"}
              />
            </Panel>
          </div>

          {reports.length ? (
            <Panel title="Direct reports">
              <ul className="grid gap-2 sm:grid-cols-2">
                {reports.map((report) => (
                  <li key={report.id}>
                    <Link
                      href={`/dashboard/organization/people/${report.id}`}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 transition hover:bg-muted/40"
                    >
                      <span className="font-medium">{report.name}</span>
                      <span className="text-xs text-muted-foreground">{report.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {onboarding ? (
            <Panel title="Onboarding">
              <p className="text-sm text-muted-foreground">
                Start {formatDate(onboarding.startDate)} ·{" "}
                {onboarding.tasks.filter((task) => task.done).length}/
                {onboarding.tasks.length} tasks complete
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-foreground"
                  style={{
                    width: `${Math.round(
                      (onboarding.tasks.filter((task) => task.done).length /
                        onboarding.tasks.length) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </Panel>
          ) : null}

          {canViewComp && compensation ? (
            <Panel title="Compensation snapshot">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <MiniCard
                  label="Monthly salary"
                  value={formatMoney(compensation.baseSalary)}
                />
                <MiniCard
                  label="Next payday"
                  value={formatDate(compensation.nextPayDate)}
                />
                <MiniCard
                  label="Last delivery"
                  value={lastPaid ? formatDate(lastPaid.paidOn) : "—"}
                />
                <MiniCard
                  label="Bank account"
                  value={`•••• ${compensation.bankLast4}`}
                />
              </div>
            </Panel>
          ) : null}
        </TabsContent>

        {canViewComp && compensation ? (
          <TabsContent value="compensation" className="mt-0 space-y-5">
            <Panel title="Current package">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <MiniCard
                  label="Base (monthly)"
                  value={formatMoney(compensation.baseSalary)}
                />
                <MiniCard label="Pay cycle" value={compensation.payFrequency} />
                <MiniCard
                  label="Annualized"
                  value={formatMoney(compensation.baseSalary * 12)}
                />
                <MiniCard label="Tax ID" value={compensation.taxIdMasked} />
              </div>
            </Panel>

            <Panel title="Salary increments">
              {compensation.increments.length ? (
                <ul className="space-y-2">
                  {[...compensation.increments]
                    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
                    .map((increment) => {
                      const delta = increment.newAmount - increment.previousAmount
                      const approver = getEmployee(increment.approvedById)
                      return (
                        <li key={increment.id} className="rounded-lg border px-3 py-3 sm:px-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="flex items-center gap-1.5 font-medium">
                                <TrendingUp className="size-3.5 text-emerald-600" />
                                {formatMoney(increment.previousAmount)} →{" "}
                                {formatMoney(increment.newAmount)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {increment.reason}
                              </p>
                            </div>
                            <Badge variant="outline">+{formatMoney(delta)}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Effective {formatDate(increment.effectiveDate)} · Approved by{" "}
                            {approver?.name ?? "—"}
                          </p>
                        </li>
                      )
                    })}
                </ul>
              ) : (
                <Empty>No increments on record yet.</Empty>
              )}
            </Panel>

            <Panel title="Salary deliveries">
              {compensation.payments.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Period</th>
                        <th className="px-3 py-2 font-medium">Paid on</th>
                        <th className="px-3 py-2 font-medium">Amount</th>
                        <th className="px-3 py-2 font-medium">Method</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compensation.payments.map((payment) => (
                        <tr key={payment.id} className="border-t">
                          <td className="px-3 py-2">
                            <p className="font-medium">{payment.periodLabel}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {payment.reference}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {formatDate(payment.paidOn)}
                          </td>
                          <td className="px-3 py-2">{formatMoney(payment.amount)}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {payment.method}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                payment.status === "Failed"
                                  ? "destructive"
                                  : payment.status === "Processing"
                                    ? "outline"
                                    : "secondary"
                              }
                            >
                              {payment.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>
                  No salary deliveries yet
                  {employee.status === "Invited" ? " — invite pending." : "."}
                </Empty>
              )}
            </Panel>
          </TabsContent>
        ) : null}

        <TabsContent value="work" className="mt-0 space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Projects">
              {projects.length ? (
                <ul className="space-y-2">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <Link
                        href={projectHref(project.id)}
                        className="flex items-center justify-between rounded-lg border px-3 py-2.5 transition hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">
                            <span className="text-muted-foreground">{project.key}</span>{" "}
                            {project.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Role: {project.role} · {project.team}
                          </p>
                        </div>
                        <Badge variant="outline">{project.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Not on any projects yet.</Empty>
              )}
            </Panel>

            <Panel title="Tickets & issues">
              {issues.length ? (
                <ul className="space-y-2">
                  {issues.map((issue) => (
                    <li key={issue.id}>
                      <Link
                        href={issueHref(issue)}
                        className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 transition hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">
                            <span className="text-muted-foreground">{issue.id}</span>{" "}
                            {issue.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {issue.assignee === employee.name ? "Assignee" : "Reporter"} ·{" "}
                            {issue.type} · {issue.priority}
                          </p>
                        </div>
                        <Badge variant="outline">{issue.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No tickets assigned or reported.</Empty>
              )}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="leave" className="mt-0 space-y-5">
          <Panel title="Balances (approved YTD)">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {(["Annual leave", "Sick leave"] as const).map((type) => {
                const used = leaveDaysUsed(employee.id, type)
                const allowance = leaveAllowance[type]
                return (
                  <MiniCard
                    key={type}
                    label={type}
                    value={
                      allowance == null
                        ? `${used} days used`
                        : `${used} / ${allowance} days`
                    }
                  />
                )
              })}
            </div>
          </Panel>

          <Panel title="Leave history">
            {leave.length ? (
              <ul className="space-y-2">
                {leave.map((item) => {
                  const approver = getEmployee(item.approverId)
                  const days = workingDays(item.start, item.end)
                  return (
                    <li key={item.id} className="rounded-lg border px-3 py-3 sm:px-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {item.type}{" "}
                            <span className="text-muted-foreground">({item.id})</span>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(item.start)}
                            {item.end !== item.start ? ` – ${formatDate(item.end)}` : ""} ·{" "}
                            {days} working day{days === 1 ? "" : "s"}
                          </p>
                          {item.reason ? (
                            <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                          ) : null}
                        </div>
                        <Badge
                          variant={
                            item.status === "Declined"
                              ? "destructive"
                              : item.status === "Approved"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {item.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Approver: {approver?.name ?? "—"}
                      </p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty>No leave requests on file.</Empty>
            )}
          </Panel>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ClipboardList className="size-3.5" />
            Leave policy and requests also live under People Operations.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border p-4 sm:p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

function DetailRow({
  Icon,
  label,
  value,
}: {
  Icon: typeof Mail
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/70 py-2.5 last:border-0">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  )
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
