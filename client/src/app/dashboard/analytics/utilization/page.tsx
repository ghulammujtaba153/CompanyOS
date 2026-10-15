"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Button } from "@/components/ui/button"
import { analyticsApi, type ApiUtilizationRow } from "@/lib/auth-api"
import { seedUtilization, type UtilizationRow } from "@/lib/time-tracking"
import { cn } from "@/lib/utils"
import { CardsPageSkeleton } from "@/components/dashboard/page-skeletons"

function mapRow(row: ApiUtilizationRow): UtilizationRow {
  return {
    employeeId: row.employeeId,
    name: row.name,
    department: row.department,
    billablePct: row.billablePct,
    capacityHours: row.capacityHours,
    loggedHours: row.loggedHours,
  }
}

export default function UtilizationAnalyticsPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [rows, setRows] = useState<UtilizationRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setRows(seedUtilization)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await analyticsApi.utilization(activeOrgId)
      setRows(data.map(mapRow))
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void load()
  }, [load])

  const avg =
    rows.length > 0
      ? Math.round(rows.reduce((sum, row) => sum + row.billablePct, 0) / rows.length)
      : 0
  const hours = rows.reduce((sum, row) => sum + row.loggedHours, 0)

  return (
    <>
      <DashboardHeader title="Utilization" parent="Analytics" />
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
            <h1 className="text-2xl font-semibold tracking-tight">Utilization</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Billable capacity by person this week from timesheets.
            </p>
          </div>
          <Button size="sm" variant="outline" render={<Link href="/dashboard/work-management/time" />}>
            Open timesheets
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Avg billable %", value: `${avg}%` },
            { label: "Hours logged", value: hours },
            { label: "People", value: rows.length },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">By person</h2>
          {loading ? (
            <CardsPageSkeleton count={4} className="mt-4" />
          ) : rows.length ? (
            <ul className="mt-4 space-y-4">
              {rows.map((row) => (
                <li key={row.employeeId}>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.department} · {row.loggedHours}h / {row.capacityHours}h capacity
                      </p>
                    </div>
                    <span
                      className={cn(
                        "tabular-nums font-semibold",
                        row.billablePct < 40 && "text-amber-700 dark:text-amber-400",
                        row.billablePct >= 70 && "text-emerald-700 dark:text-emerald-400"
                      )}
                    >
                      {row.billablePct}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        row.billablePct < 40 ? "bg-amber-500" : "bg-foreground/70"
                      )}
                      style={{ width: `${Math.min(100, row.billablePct)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No timesheet data for this week yet.
            </p>
          )}
        </section>
      </div>
    </>
  )
}
