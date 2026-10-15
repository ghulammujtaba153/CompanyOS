"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Plus } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { ProcessDialog } from "@/components/dashboard/process-dialog"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useOrganization } from "@/components/dashboard/organization-store"
import { useProcesses } from "@/components/dashboard/processes-store"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { bestCasePlan, formatHours, processMetrics } from "@/lib/processes"
import { useClientPagination } from "@/lib/use-client-pagination"

export default function ProcessesPage() {
  const router = useRouter()
  const { loading, processes, policy, canCreate } = useProcesses()
  const { getEmployee, getDepartment } = useOrganization()
  const [creating, setCreating] = useState(false)

  const rows = useMemo(
    () =>
      processes.map((process) => {
        const current = processMetrics(process, policy)
        const best = processMetrics(bestCasePlan(process, policy), policy)
        return {
          process,
          current,
          savings: Math.max(0, current.humanHoursPerWeek - best.humanHoursPerWeek),
        }
      }),
    [processes, policy]
  )
  const pagination = useClientPagination(rows, { resetKey: rows.length })
  const totalHours = rows.reduce((sum, row) => sum + row.current.humanHoursPerWeek, 0)
  const totalSavings = rows.reduce((sum, row) => sum + row.savings, 0)

  if (loading) {
    return (
      <>
        <DashboardHeader title="Processes" />
        <PageLoadingState label="Loading processes…" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="Processes" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Processes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Map how work flows, simulate agent handoffs, and kick off live runs that pause for
              approvals.
            </p>
          </div>
          {canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Plus data-icon="inline-start" />
              New process
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
          {[
            ["Processes mapped", String(processes.length)],
            ["Person time / week", formatHours(totalHours)],
            ["Could move to agents", formatHours(totalSavings)],
          ].map(([label, value]) => (
            <div key={label} className="bg-card p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border">
          {rows.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Process</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Runs / wk</TableHead>
                    <TableHead>Steps</TableHead>
                    <TableHead className="text-right">Cycle time</TableHead>
                    <TableHead className="text-right">Person time / wk</TableHead>
                    <TableHead className="text-right">Could save</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map(({ process, current, savings }) => (
                    <TableRow
                      key={process.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/processes/${process.id}`)}
                    >
                      <TableCell>
                        <Link
                          href={`/dashboard/processes/${process.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-medium hover:underline"
                        >
                          {process.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {getDepartment(process.departmentId)?.name ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell>{getEmployee(process.ownerId)?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{process.runsPerWeek}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {process.steps.length - current.agentSteps} people · {current.agentSteps} agents
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatHours(current.cycleHours)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatHours(current.humanHoursPerWeek)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                        {savings >= 0.05 ? (
                          `${formatHours(savings)}/wk`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
            <p className="p-10 text-center text-sm text-muted-foreground">No processes mapped yet.</p>
          )}
        </div>
      </div>

      {creating ? (
        <ProcessDialog
          onClose={(id) => {
            setCreating(false)
            if (id) router.push(`/dashboard/processes/${id}`)
          }}
        />
      ) : null}
    </>
  )
}
