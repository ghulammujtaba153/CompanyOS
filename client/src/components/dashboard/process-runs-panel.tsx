"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Play, SkipForward, XCircle } from "lucide-react"
import Link from "next/link"

import { useAuth } from "@/components/auth/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { governanceApi } from "@/lib/auth-api"
import { cn } from "@/lib/utils"
import type { ProcessRun, ProcessRunStepResult } from "@/lib/processes"

function mapRun(row: Record<string, unknown>): ProcessRun {
  return {
    id: String(row.id),
    processId: String(row.processId ?? ""),
    processName: String(row.processName ?? ""),
    status: String(row.status ?? "Running") as ProcessRun["status"],
    currentStepIndex: Number(row.currentStepIndex ?? 0),
    context: (row.context as ProcessRun["context"]) || { amount: 0, external: false, records: 0 },
    steps: Array.isArray(row.steps) ? (row.steps as ProcessRun["steps"]) : [],
    stepResults: Array.isArray(row.stepResults) ? (row.stepResults as ProcessRunStepResult[]) : [],
    startedBy: String(row.startedBy ?? ""),
    note: String(row.note ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  }
}

const statusVariant: Record<ProcessRun["status"], "default" | "secondary" | "outline" | "destructive"> = {
  Running: "default",
  WaitingApproval: "outline",
  WaitingPerson: "outline",
  Completed: "secondary",
  Failed: "destructive",
  Cancelled: "destructive",
}

export function ProcessRunsPanel({ processId }: { processId: string }) {
  const { isAuthenticated, activeOrgId } = useAuth()
  const [runs, setRuns] = useState<ProcessRun[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !activeOrgId) {
      setRuns([])
      return
    }
    setLoading(true)
    setError("")
    try {
      const rows = await governanceApi.listProcessRuns(activeOrgId, processId)
      setRuns(rows.map(mapRun))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load runs")
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, activeOrgId, processId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function kickoff() {
    if (!activeOrgId) return
    setBusyId("kickoff")
    setError("")
    try {
      await governanceApi.kickoffProcessRun(activeOrgId, processId, { autoAdvance: true })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kickoff failed")
    } finally {
      setBusyId(null)
    }
  }

  async function advance(runId: string) {
    if (!activeOrgId) return
    setBusyId(runId)
    setError("")
    try {
      await governanceApi.advanceProcessRun(activeOrgId, runId, { forcePerson: true })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Advance failed")
    } finally {
      setBusyId(null)
    }
  }

  async function cancel(runId: string) {
    if (!activeOrgId) return
    setBusyId(runId)
    setError("")
    try {
      await governanceApi.cancelProcessRun(activeOrgId, runId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed")
    } finally {
      setBusyId(null)
    }
  }

  if (!isAuthenticated || !activeOrgId) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Sign in to kick off live process runs for this organization.
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Live runs</h2>
          <p className="text-xs text-muted-foreground">
            Kick off a real run. Agent steps go through governance; approvals pause the run until decided.
          </p>
        </div>
        <Button size="sm" loading={busyId === "kickoff"} onClick={() => void kickoff()}>
          {busyId === "kickoff" ? null : <Play className="size-3.5" />}
          Start run
        </Button>
      </div>

      {error ? <p className="border-b px-4 py-2 text-xs text-destructive">{error}</p> : null}

      {loading && !runs.length ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading runs…
        </div>
      ) : !runs.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No runs yet. Start one to execute this process.</p>
      ) : (
        <ul className="divide-y">
          {runs.map((run) => {
            const step = run.steps[run.currentStepIndex]
            const open = !["Completed", "Failed", "Cancelled"].includes(run.status)
            return (
              <li key={run.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{run.id}</span>
                      <Badge variant={statusVariant[run.status] ?? "outline"}>{run.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm">
                      {open && step
                        ? `Step ${run.currentStepIndex + 1}/${run.steps.length}: ${step.name}`
                        : run.status === "Completed"
                          ? `Finished ${run.steps.length} steps`
                          : run.status}
                    </p>
                    {run.stepResults.length ? (
                      <ol className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {run.stepResults.slice(-4).map((result) => (
                          <li key={`${result.stepId}-${result.at}`} className="flex flex-wrap gap-1.5">
                            <span className={cn(result.status === "Failed" && "text-destructive")}>
                              {result.name || result.stepId}: {result.status}
                            </span>
                            {result.decision ? <span>· {result.decision}</span> : null}
                            {result.actionId ? (
                              <Link href="/dashboard/approvals" className="text-primary hover:underline">
                                approval
                              </Link>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                  {open ? (
                    <div className="flex gap-1.5">
                      {run.status === "WaitingPerson" || run.status === "WaitingApproval" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busyId === run.id}
                          onClick={() => void advance(run.id)}
                          title={
                            run.status === "WaitingApproval"
                              ? "Resume after approval (decide in Approvals first)"
                              : "Mark person step complete and continue"
                          }
                        >
                          {busyId === run.id ? null : <SkipForward className="size-3.5" />}
                          {run.status === "WaitingPerson" ? "Complete step" : "Resume"}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busyId === run.id}
                        onClick={() => void cancel(run.id)}
                        aria-label="Cancel run"
                      >
                        {busyId === run.id ? null : <XCircle className="size-3.5" />}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
