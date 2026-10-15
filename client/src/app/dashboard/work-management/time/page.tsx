"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { useAuth } from "@/components/auth/auth-provider"
import { KeyedSelect } from "@/components/dashboard/form-controls"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { timeApi, type ApiTimeEntry } from "@/lib/auth-api"
import {
  billableTotal,
  seedTimesheet,
  weekTotal,
  type TimeEntry,
} from "@/lib/time-tracking"
import { useClientPagination } from "@/lib/use-client-pagination"
import { cn } from "@/lib/utils"
import { TablePageSkeleton } from "@/components/dashboard/page-skeletons"

function mondayOf(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  const offset = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offset).toISOString().slice(0, 10)
}

function mapEntry(row: ApiTimeEntry): TimeEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    projectKey: row.project_key,
    hours: Number(row.hours) || 0,
    billable: Boolean(row.billable),
    note: row.note || "",
  }
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof Error) return err.message || fallback
  return fallback
}

export default function TimeTrackingPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const { projects } = useProjectWorkspace()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const weekStart = useMemo(() => mondayOf(), [])

  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [status, setStatus] = useState<"draft" | "submitted" | string>("draft")
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [addProjectId, setAddProjectId] = useState("")
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)

  const locked = status === "submitted"
  const total = useMemo(() => weekTotal(entries), [entries])
  const billable = useMemo(() => billableTotal(entries), [entries])
  const pagination = useClientPagination(entries, { pageSize: 10, resetKey: entries.length })

  const availableProjects = useMemo(() => {
    const used = new Set(entries.map((entry) => entry.projectId))
    return projects.filter((project) => !used.has(project.id))
  }, [projects, entries])

  const load = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setEntries(seedTimesheet.entries)
      setStatus("draft")
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const sheet = await timeApi.getTimesheet(activeOrgId, weekStart)
      setEntries(sheet.entries.map(mapEntry))
      setStatus(sheet.status)
    } catch (err) {
      setNotice({ ok: false, message: errorMessage(err, "Could not load timesheet.") })
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId, weekStart])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!availableProjects.length) {
      setAddProjectId("")
      return
    }
    if (!availableProjects.some((project) => project.id === addProjectId)) {
      setAddProjectId(availableProjects[0].id)
    }
  }, [availableProjects, addProjectId])

  async function persist(id: string, patch: Partial<Pick<TimeEntry, "hours" | "billable" | "note">>) {
    if (!useApi || locked) return
    setSavingId(id)
    try {
      const row = await timeApi.updateEntry(id, {
        hours: patch.hours,
        billable: patch.billable,
        note: patch.note,
      })
      const mapped = mapEntry(row)
      setEntries((current) => current.map((entry) => (entry.id === id ? mapped : entry)))
    } catch (err) {
      setNotice({ ok: false, message: errorMessage(err, "Could not save time entry.") })
      await load()
    } finally {
      setSavingId(null)
    }
  }

  function updateHours(id: string, hours: number) {
    const next = Math.max(0, hours)
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, hours: next } : entry))
    )
  }

  function toggleBillable(id: string) {
    if (locked) return
    const entry = entries.find((item) => item.id === id)
    if (!entry) return
    const billableNext = !entry.billable
    setEntries((current) =>
      current.map((item) => (item.id === id ? { ...item, billable: billableNext } : item))
    )
    void persist(id, { billable: billableNext })
  }

  async function addProjectLine() {
    if (!useApi || !activeOrgId || !addProjectId || locked) return
    try {
      const row = await timeApi.createEntry(activeOrgId, {
        project_id: addProjectId,
        week_start: weekStart,
        hours: 0,
        billable: true,
        note: "",
      })
      setEntries((current) => [...current, mapEntry(row)])
      setNotice({ ok: true, message: "Project added to this week." })
    } catch (err) {
      setNotice({ ok: false, message: errorMessage(err, "Could not add project.") })
    }
  }

  async function submitWeek() {
    if (!useApi || !activeOrgId || locked) return
    setSubmitting(true)
    setNotice(null)
    try {
      // Flush any pending hour edits before submit.
      await Promise.all(
        entries.map((entry) =>
          timeApi.updateEntry(entry.id, {
            hours: entry.hours,
            billable: entry.billable,
            note: entry.note,
          })
        )
      )
      const sheet = await timeApi.submitWeek(activeOrgId, weekStart)
      setEntries(sheet.entries.map(mapEntry))
      setStatus(sheet.status)
      setNotice({ ok: true, message: "Timesheet submitted for this week." })
    } catch (err) {
      setNotice({ ok: false, message: errorMessage(err, "Could not submit timesheet.") })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DashboardHeader title="Time" parent="Work Management" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Time tracking</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Week of {weekStart} · log hours against your projects.
              {locked ? " · Submitted" : ""}
            </p>
          </div>
          <Button
            size="sm"
            loading={submitting}
            onClick={() => void submitWeek()}
            disabled={!useApi || locked || !entries.length}
          >
            {locked ? "Submitted" : submitting ? "Submitting…" : "Submit week"}
          </Button>
        </div>

        {notice ? (
          <div
            className={cn(
              "rounded-xl border px-4 py-2.5 text-sm",
              notice.ok
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-destructive/30 bg-destructive/5 text-destructive"
            )}
          >
            {notice.message}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Logged</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{total}h</p>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Billable</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{billable}h</p>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Utilization</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {total ? Math.round((billable / total) * 100) : 0}%
            </p>
          </div>
        </div>

        {!locked && availableProjects.length ? (
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault()
              void addProjectLine()
            }}
          >
            <KeyedSelect
              className="w-full min-w-0 sm:flex-1"
              value={addProjectId}
              onChange={setAddProjectId}
              options={availableProjects.map(
                (project) => [project.id, `${project.name} · ${project.key}`] as const
              )}
            />
            <Button type="submit" variant="outline" disabled={!addProjectId}>
              Add project
            </Button>
          </form>
        ) : null}

        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <TablePageSkeleton rows={6} columns={5} />
          ) : entries.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Billable</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <p className="font-medium">{entry.projectName}</p>
                        <p className="text-xs text-muted-foreground">{entry.projectKey}</p>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={entry.note}
                          disabled={locked || savingId === entry.id}
                          placeholder="What did you work on?"
                          onChange={(e) =>
                            setEntries((current) =>
                              current.map((item) =>
                                item.id === entry.id ? { ...item, note: e.target.value } : item
                              )
                            )
                          }
                          onBlur={(e) => void persist(entry.id, { note: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <button type="button" disabled={locked} onClick={() => toggleBillable(entry.id)}>
                          <Badge
                            variant="outline"
                            className={cn(
                              entry.billable
                                ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {entry.billable ? "Billable" : "Internal"}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          disabled={locked || savingId === entry.id}
                          className="ml-auto w-20 text-right tabular-nums"
                          value={entry.hours}
                          onChange={(e) => updateHours(entry.id, Number(e.target.value))}
                          onBlur={(e) => void persist(entry.id, { hours: Number(e.target.value) })}
                        />
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
            <p className="p-6 text-sm text-muted-foreground">
              No projects to log against yet. Join or create a project first.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
