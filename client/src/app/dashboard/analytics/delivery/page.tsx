"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { useClients } from "@/components/dashboard/clients-store"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const activeEngagementStatuses = new Set(["Discovery", "In progress", "Ready to promote", "Promoted"])

export default function AnalyticsDeliveryPage() {
  const { projects, issues } = useProjectWorkspace()
  const { engagements, clients } = useClients()

  const byStatus = ["Backlog", "To do", "In progress", "In review", "Blocked", "Done"].map((status) => ({
    status,
    count: issues.filter((issue) => issue.status === status).length,
  }))
  const max = Math.max(1, ...byStatus.map((item) => item.count))

  const projectRows = projects.slice(0, 8).map((project) => {
    const related = issues.filter((issue) => issue.projectId === project.id)
    const done = related.filter((issue) => issue.status === "Done").length
    const total = related.length || 1
    return {
      project,
      open: related.filter((issue) => issue.status !== "Done").length,
      done,
      progress: Math.round((done / total) * 100),
    }
  })

  return (
    <>
      <DashboardHeader title="Delivery" parent="Analytics" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href="/dashboard/analytics"
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Analytics overview
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">Delivery analytics</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Project and issue health across work management and client engagements.
            </p>
          </div>
          <Button size="sm" render={<Link href="/dashboard/work-management/projects" />}>
            Open projects
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Projects", value: projects.length },
            { label: "Open issues", value: issues.filter((t) => t.status !== "Done").length },
            { label: "Clients", value: clients.length },
            {
              label: "Active engagements",
              value: engagements.filter((e) => activeEngagementStatuses.has(e.status)).length,
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">Issue status mix</h2>
          <p className="text-sm text-muted-foreground">Current work distribution</p>
          <ul className="mt-5 space-y-3">
            {byStatus.map((item) => (
              <li key={item.status} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="text-muted-foreground">{item.status}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      item.status === "Done"
                        ? "bg-emerald-500"
                        : item.status === "In review"
                          ? "bg-amber-500"
                          : item.status === "In progress"
                            ? "bg-sky-500"
                            : item.status === "Blocked"
                              ? "bg-rose-500"
                              : "bg-foreground/50"
                    )}
                    style={{ width: `${(item.count / max) * 100}%` }}
                  />
                </div>
                <span className="text-right tabular-nums font-medium">{item.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">Project completion</h2>
          <p className="text-sm text-muted-foreground">Done issues vs total on each project</p>
          <ul className="mt-4 divide-y">
            {projectRows.map(({ project, open, done, progress }) => (
              <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {open} open · {done} done
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-muted sm:w-40">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                  </div>
                  <Badge variant="outline" className="tabular-nums">
                    {progress}%
                  </Badge>
                </div>
              </li>
            ))}
            {!projectRows.length ? (
              <li className="py-8 text-center text-sm text-muted-foreground">No projects yet.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </>
  )
}
