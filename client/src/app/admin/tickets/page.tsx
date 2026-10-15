"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Ticket } from "lucide-react"

import { AdminHeader } from "@/components/admin/admin-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  adminApi,
  type SupportTicketRow,
  type TicketAssigneeOption,
} from "@/lib/auth-api"
import { useClientPagination } from "@/lib/use-client-pagination"

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const

function priorityVariant(priority: string): "destructive" | "secondary" | "outline" | "default" {
  if (priority === "critical" || priority === "high") return "destructive"
  if (priority === "medium") return "secondary"
  return "outline"
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ")
}

export default function AdminTicketsPage() {
  const [rows, setRows] = useState<SupportTicketRow[]>([])
  const [assignees, setAssignees] = useState<TicketAssigneeOption[]>([])
  const [statusFilter, setStatusFilter] = useState("open")
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SupportTicketRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [assignUserId, setAssignUserId] = useState("")
  const [editStatus, setEditStatus] = useState("open")
  const [editPriority, setEditPriority] = useState("medium")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [tickets, people] = await Promise.all([
        adminApi.tickets(statusFilter),
        adminApi.ticketAssignees(),
      ])
      setRows(tickets)
      setAssignees(people)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets.")
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((ticket) =>
      `${ticket.ticket_key} ${ticket.title} ${ticket.category} ${ticket.assigned_to_name ?? ""} ${ticket.classification_label}`
        .toLowerCase()
        .includes(q)
    )
  }, [rows, query])

  const pagination = useClientPagination(filtered, {
    pageSize: 10,
    resetKey: `${statusFilter}|${query}|${filtered.length}`,
  })

  function openTicket(ticket: SupportTicketRow) {
    setSelected(ticket)
    setAssignUserId(ticket.assigned_to_user_id ?? "")
    setEditStatus(ticket.status)
    setEditPriority(ticket.priority)
  }

  async function saveTicket() {
    if (!selected) return
    setSaving(true)
    setError("")
    try {
      const updated = await adminApi.updateTicket(selected.id, {
        status: editStatus,
        priority: editPriority,
        ...(assignUserId
          ? { assigned_to_user_id: assignUserId }
          : { clear_assignee: true }),
      })
      setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
      setSelected(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket.")
    } finally {
      setSaving(false)
    }
  }

  if (loading && !rows.length) {
    return (
      <>
        <AdminHeader title="Support tickets" />
        <PageLoadingState label="Loading support tickets…" variant="list" />
      </>
    )
  }

  return (
    <>
      <AdminHeader title="Support tickets" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Support tickets</h1>
            <p className="text-sm text-muted-foreground">
              AI-created from log alerts. Assign to employees and track resolution.
            </p>
          </div>
          <Input
            className="w-full max-w-xs"
            placeholder="Search tickets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              size="sm"
              variant={statusFilter === filter.value ? "default" : "outline"}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Label</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pageItems.length ? (
                pagination.pageItems.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer"
                    onClick={() => openTicket(ticket)}
                  >
                    <TableCell className="font-mono text-xs font-medium">
                      {ticket.ticket_key}
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <div className="font-medium">{ticket.title}</div>
                      {ticket.ai_summary ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {ticket.ai_summary}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {statusLabel(ticket.status)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ticket.assigned_to_name || ticket.assigned_to_email || "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{ticket.classification_label || ticket.category}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    <Ticket className="mx-auto mb-2 size-5 opacity-50" />
                    No tickets yet. Classify issue logs to create AI tickets.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

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
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    {selected.ticket_key}
                  </span>
                  <span>{selected.title}</span>
                </DialogTitle>
                <DialogDescription>
                  {selected.ai_summary || "AI-drafted support ticket from a classified log alert."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={priorityVariant(selected.priority)}>{selected.priority}</Badge>
                  <Badge variant="secondary" className="capitalize">
                    {statusLabel(selected.status)}
                  </Badge>
                  {selected.classification_label ? (
                    <Badge variant="outline">{selected.classification_label}</Badge>
                  ) : null}
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap">
                  {selected.description}
                </div>

                {selected.log_message ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Source log</p>
                    <pre className="overflow-x-auto rounded-md border bg-background p-2 font-mono text-xs">
                      [{selected.source}] {selected.log_message}
                    </pre>
                  </div>
                ) : null}

                {selected.ai_suggested_actions?.length ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Suggested actions
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {selected.ai_suggested_actions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Status</span>
                    <select
                      className="flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Priority</span>
                    <select
                      className="flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value)}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                  <label className="space-y-1 sm:col-span-1">
                    <span className="text-xs font-medium text-muted-foreground">Assign to</span>
                    <select
                      className="flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={assignUserId}
                      onChange={(e) => setAssignUserId(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.full_name || user.email}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
                <Button loading={saving} onClick={() => void saveTicket()}>
                  {saving ? "Saving…" : "Save assignment"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
