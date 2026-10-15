"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useHiringState } from "@/lib/hiring-store"
import { hiringStages } from "@/lib/hiring-pipeline"

export default function AnalyticsHiringPage() {
  const { jobs, candidates } = useHiringState()
  const openJobs = jobs.filter((job) => job.status === "Open")

  const totals = hiringStages.map((stage) => ({
    stage,
    count: candidates.filter((c) => c.stage === stage).length,
  }))
  const rejected = candidates.filter((c) => c.stage === "Rejected").length
  const applied = candidates.length
  const shortlisted = candidates.filter((c) =>
    ["Shortlisted", "AI Interview", "Technical Interview", "Offer", "Hired"].includes(c.stage)
  ).length
  const conversion = applied ? Math.round((shortlisted / applied) * 100) : 0

  return (
    <>
      <DashboardHeader title="Hiring funnel" parent="Analytics" />
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
            <h1 className="text-2xl font-semibold tracking-tight">Hiring funnel</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Stage-by-stage view of ATS volume, conversion, and open roles.
            </p>
          </div>
          <Button size="sm" render={<Link href="/dashboard/people-operations/hiring" />}>
            Open hiring ATS
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Total candidates", value: applied },
            { label: "Shortlisted+", value: shortlisted },
            { label: "Conversion", value: `${conversion}%` },
            { label: "Rejected", value: rejected },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">Pipeline stages</h2>
          <p className="text-sm text-muted-foreground">Live counts across all jobs</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {totals.map((item, index) => (
              <div key={item.stage} className="rounded-xl border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {index + 1}. {item.stage}
                  </p>
                  <span className="text-lg font-semibold tabular-nums">{item.count}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{
                      width: `${Math.max(6, (item.count / Math.max(1, ...totals.map((t) => t.count))) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">By open role</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Where candidates sit for each job</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  {hiringStages.map((stage) => (
                    <th key={stage} className="px-2 py-2 font-medium">
                      {stage.split(" ")[0]}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {openJobs.map((job) => {
                  const forJob = candidates.filter((c) => c.jobId === job.id)
                  return (
                    <tr key={job.id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium">{job.title}</p>
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {job.status}
                        </Badge>
                      </td>
                      {hiringStages.map((stage) => (
                        <td key={stage} className="px-2 py-3 tabular-nums text-muted-foreground">
                          {forJob.filter((c) => c.stage === stage).length}
                        </td>
                      ))}
                      <td className="px-2 py-3 font-medium tabular-nums">{forJob.length}</td>
                    </tr>
                  )
                })}
                {!openJobs.length ? (
                  <tr>
                    <td colSpan={hiringStages.length + 2} className="py-8 text-center text-muted-foreground">
                      No open jobs yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}
