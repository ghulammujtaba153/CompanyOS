"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowUpRight,
  BriefcaseBusiness,
  ClipboardList,
  Download,
  TrendingUp,
  Users,
  UsersRound,
} from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { useClients } from "@/components/dashboard/clients-store"
import { useOrganization } from "@/components/dashboard/organization-store"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { StatCard } from "@/components/dashboard/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useHiringState } from "@/lib/hiring-store"
import { hiringStages } from "@/lib/hiring-pipeline"

const weekLabels = ["W1", "W2", "W3", "W4", "W5", "W6"]
const hiringTrend = [12, 18, 15, 22, 19, 27]
const deliveryTrend = [40, 48, 45, 58, 62, 71]

const activeEngagementStatuses = new Set(["Discovery", "In progress", "Ready to promote", "Promoted"])

export default function AnalyticsOverviewPage() {
  const { employees, departments } = useOrganization()
  const { clients, engagements } = useClients()
  const { projects, issues } = useProjectWorkspace()
  const { jobs, candidates } = useHiringState()
  const [from, setFrom] = useState("2026-09-01")
  const [to, setTo] = useState("2026-10-07")

  const activePeople = employees.filter((e) => e.status === "Active").length
  const openJobs = jobs.filter((j) => j.status === "Open").length
  const activeCandidates = candidates.filter((c) => c.stage !== "Rejected" && c.stage !== "Hired").length
  const hired = candidates.filter((c) => c.stage === "Hired").length
  const openTickets = issues.filter((t) => t.status !== "Done").length
  const doneTickets = issues.filter((t) => t.status === "Done").length
  const activeEngagements = engagements.filter((e) => activeEngagementStatuses.has(e.status)).length

  const funnel = hiringStages.map((stage) => ({
    stage,
    count: candidates.filter((c) => c.stage === stage).length,
  }))
  const funnelMax = Math.max(1, ...funnel.map((item) => item.count))

  const deptLoad = departments.map((dept) => {
    const people = employees.filter((e) => e.departmentId === dept.id && e.status === "Active").length
    return { name: dept.name, people }
  })
  const deptMax = Math.max(1, ...deptLoad.map((d) => d.people), 1)

  function exportCsv() {
    const rows = [
      ["metric", "value", "range"],
      ["active_people", String(activePeople), `${from}..${to}`],
      ["active_candidates", String(activeCandidates), `${from}..${to}`],
      ["hired", String(hired), `${from}..${to}`],
      ["open_jobs", String(openJobs), `${from}..${to}`],
      ["clients", String(clients.length), `${from}..${to}`],
      ["active_engagements", String(activeEngagements), `${from}..${to}`],
      ["projects", String(projects.length), `${from}..${to}`],
      ["open_issues", String(openTickets), `${from}..${to}`],
      ["done_issues", String(doneTickets), `${from}..${to}`],
      ...funnel.map((item) => [`funnel_${item.stage}`, String(item.count), `${from}..${to}`]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `companyos-analytics-${from}_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <DashboardHeader title="Analytics" parent="Analytics" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight">Analytics overview</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Agency health across hiring, delivery, clients, and headcount — so leadership can see where work
              and talent are moving.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" render={<Link href="/dashboard/analytics/hiring" />}>
              Hiring funnel
            </Button>
            <Button size="sm" variant="outline" render={<Link href="/dashboard/analytics/delivery" />}>
              Delivery
            </Button>
            <Button size="sm" variant="outline" render={<Link href="/dashboard/analytics/utilization" />}>
              Utilization
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-3 sm:p-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="from">
              From
            </label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="to">
              To
            </label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download data-icon="inline-start" />
            Export CSV
          </Button>
          <p className="text-xs text-muted-foreground sm:ml-auto">
            Range filters charts later — export uses live counts for {from} → {to}.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Active people"
            value={String(activePeople)}
            description={`${departments.length} departments`}
            icon={Users}
          />
          <StatCard
            title="Hiring pipeline"
            value={String(activeCandidates)}
            description={`${openJobs} open roles · ${hired} hired`}
            icon={UsersRound}
          />
          <StatCard
            title="Client book"
            value={String(clients.length)}
            description={`${activeEngagements} active engagements`}
            icon={BriefcaseBusiness}
          />
          <StatCard
            title="Delivery load"
            value={String(openTickets)}
            description={`${projects.length} projects · ${doneTickets} done`}
            icon={ClipboardList}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Applications trend</h2>
                <p className="text-sm text-muted-foreground">Inbound interest over the last 6 weeks</p>
              </div>
              <Badge variant="outline" className="gap-1">
                <TrendingUp className="size-3" />
                +18%
              </Badge>
            </div>
            <div className="mt-6 flex h-48 items-end gap-2.5">
              {hiringTrend.map((value, index) => (
                <div key={weekLabels[index]} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] tabular-nums text-muted-foreground">{value}</span>
                  <div
                    className="w-full rounded-t-md bg-sky-500/80"
                    style={{ height: `${(value / Math.max(...hiringTrend)) * 100}%` }}
                  />
                  <span className="text-[11px] text-muted-foreground">{weekLabels[index]}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Delivery throughput</h2>
                <p className="text-sm text-muted-foreground">Issues closed per week</p>
              </div>
              <Badge variant="outline" className="gap-1">
                <TrendingUp className="size-3" />
                +9%
              </Badge>
            </div>
            <div className="mt-6 flex h-48 items-end gap-2.5">
              {deliveryTrend.map((value, index) => (
                <div key={weekLabels[index]} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] tabular-nums text-muted-foreground">{value}</span>
                  <div
                    className="w-full rounded-t-md bg-emerald-500/80"
                    style={{ height: `${(value / Math.max(...deliveryTrend)) * 100}%` }}
                  />
                  <span className="text-[11px] text-muted-foreground">{weekLabels[index]}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Hiring funnel snapshot</h2>
                <p className="text-sm text-muted-foreground">Candidates by ATS stage right now</p>
              </div>
              <Button size="sm" variant="ghost" render={<Link href="/dashboard/analytics/hiring" />}>
                Details
                <ArrowUpRight data-icon="inline-end" />
              </Button>
            </div>
            <ul className="mt-5 space-y-3">
              {funnel.map((item) => (
                <li key={item.stage} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{item.stage}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground/80"
                      style={{ width: `${(item.count / funnelMax) * 100}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums font-medium">{item.count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <h2 className="font-semibold">Headcount by department</h2>
            <p className="text-sm text-muted-foreground">Active people only</p>
            <ul className="mt-5 space-y-3">
              {deptLoad.map((item) => (
                <li key={item.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{item.name}</span>
                    <span className="tabular-nums text-muted-foreground">{item.people}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-violet-500/80"
                      style={{ width: `${(item.people / deptMax) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
