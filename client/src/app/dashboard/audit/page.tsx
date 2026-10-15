"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Sparkles } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
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
import { auditApi, type ApiAuditEvent } from "@/lib/auth-api"
import { seedAuditEvents, type AuditEvent } from "@/lib/audit"
import { useClientPagination } from "@/lib/use-client-pagination"
import { TablePageSkeleton } from "@/components/dashboard/page-skeletons"

const areas = ["All", "Hiring", "Organization", "Clients", "Work", "Access", "Finance", "Documents", "Billing"] as const

function mapEvent(row: ApiAuditEvent): AuditEvent {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    target: row.target,
    area: row.area as AuditEvent["area"],
  }
}

function csvEscape(value: string) {
  const raw = value.replace(/"/g, '""')
  return /[",\n]/.test(raw) ? `"${raw}"` : raw
}

export default function AuditLogPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [area, setArea] = useState<(typeof areas)[number]>("All")
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [reindexing, setReindexing] = useState(false)

  const load = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setEvents(seedAuditEvents)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await auditApi.list(activeOrgId)
      setEvents(rows.map(mapEvent))
    } catch {
      setEvents([])
      setNotice("Could not load audit events.")
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const list = [...events].sort((a, b) => b.at.localeCompare(a.at))
    return area === "All" ? list : list.filter((event) => event.area === area)
  }, [area, events])

  const pagination = useClientPagination(filtered, { pageSize: 10, resetKey: `${area}|${events.length}` })

  function formatAt(iso: string) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return iso
    }
  }

  async function indexToPinecone() {
    if (!useApi || !activeOrgId) return
    setReindexing(true)
    setNotice(null)
    try {
      const result = await auditApi.reindex(activeOrgId)
      setNotice(`Indexed ${result.indexed} of ${result.total} audit events into Pinecone.`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Pinecone reindex failed.")
    } finally {
      setReindexing(false)
    }
  }

  function downloadCsv() {
    const header = ["When", "Actor", "Action", "Target", "Area"]
    const lines = [
      header.join(","),
      ...filtered.map((event) =>
        [event.at, event.actor, event.action, event.target, event.area].map(csvEscape).join(",")
      ),
    ]
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `companyos-audit-${area.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setNotice(`Downloaded ${filtered.length} audit event(s) as CSV.`)
  }

  return (
    <>
      <DashboardHeader title="Audit log" parent="Documents" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Compliance trail of who changed what. Stored in Neon; optionally indexed to Pinecone
              for semantic search (separate from document vault RAG).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {useApi ? (
              <Button size="sm" variant="outline" disabled={reindexing} onClick={() => void indexToPinecone()}>
                <Sparkles data-icon="inline-start" />
                {reindexing ? "Indexing…" : "Index to Pinecone"}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" disabled={!filtered.length} onClick={downloadCsv}>
              <Download data-icon="inline-start" />
              Download CSV
            </Button>
          </div>
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm">
            {notice}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {areas.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={area === item ? "default" : "outline"}
              onClick={() => setArea(item)}
            >
              {item}
            </Button>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <TablePageSkeleton rows={6} columns={5} />
          ) : filtered.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Area</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatAt(event.at)}
                      </TableCell>
                      <TableCell className="font-medium">{event.actor}</TableCell>
                      <TableCell>{event.action}</TableCell>
                      <TableCell className="text-muted-foreground">{event.target}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.area}</Badge>
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
            <p className="p-10 text-center text-sm text-muted-foreground">No audit events yet.</p>
          )}
        </div>
      </div>
    </>
  )
}
