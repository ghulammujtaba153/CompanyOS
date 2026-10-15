"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, X } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, OptionSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useOrganization } from "@/components/dashboard/organization-store"
import { usePeopleOps } from "@/components/dashboard/people-ops-store"
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
import { TablePagination } from "@/components/dashboard/table-pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  addDays,
  leaveAllowance,
  leaveTypes,
  todayIso,
  workingDays,
  type LeaveRequest,
  type LeaveType,
} from "@/lib/people-ops"
import { useClientPagination } from "@/lib/use-client-pagination"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/work-utils"

type AdminView = "approvals" | "all" | "mine"
type EmployeeView = "mine" | "approvals"

const statusVariant: Record<LeaveRequest["status"], "secondary" | "outline" | "destructive"> = {
  Pending: "outline",
  Approved: "secondary",
  Declined: "destructive",
  Cancelled: "outline",
}

function dateRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`
}

export default function PeopleLeavePage() {
  const { loading, leave, isLeaveAdmin, canDecide, balance } = usePeopleOps()
  const { me } = useOrganization()
  const [requesting, setRequesting] = useState(false)
  const [deciding, setDeciding] = useState<{ request: LeaveRequest; decision: "Approved" | "Declined" } | null>(
    null
  )
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)

  if (loading) {
    return (
      <>
        <DashboardHeader title="Leave" parent="People Operations" />
        <PageLoadingState label="Loading leave…" />
      </>
    )
  }

  const approvals = leave.filter(canDecide)
  const myRequests = leave.filter((item) => item.employeeId === me?.id)
  const canApprove = isLeaveAdmin || approvals.length > 0 || me?.accessRole === "Manager"

  if (isLeaveAdmin) {
    return (
      <AdminLeavePage
        leave={leave}
        approvals={approvals}
        myRequests={myRequests}
        meId={me?.id}
        balance={balance}
        onRequest={() => setRequesting(true)}
        onDecide={(request, decision) => setDeciding({ request, decision })}
        notice={notice}
        setNotice={setNotice}
        requesting={requesting}
        setRequesting={setRequesting}
        deciding={deciding}
        setDeciding={setDeciding}
      />
    )
  }

  return (
    <EmployeeLeavePage
      leave={leave}
      approvals={approvals}
      myRequests={myRequests}
      me={me}
      canApprove={canApprove}
      balance={balance}
      onRequest={() => setRequesting(true)}
      onDecide={(request, decision) => setDeciding({ request, decision })}
      notice={notice}
      setNotice={setNotice}
      requesting={requesting}
      setRequesting={setRequesting}
      deciding={deciding}
      setDeciding={setDeciding}
    />
  )
}

function AdminLeavePage({
  leave,
  approvals,
  myRequests,
  meId,
  balance,
  onRequest,
  onDecide,
  notice,
  setNotice,
  requesting,
  setRequesting,
  deciding,
  setDeciding,
}: {
  leave: LeaveRequest[]
  approvals: LeaveRequest[]
  myRequests: LeaveRequest[]
  meId?: string
  balance: ReturnType<typeof usePeopleOps>["balance"]
  onRequest: () => void
  onDecide: (request: LeaveRequest, decision: "Approved" | "Declined") => void
  notice: { ok: boolean; message: string } | null
  setNotice: (notice: { ok: boolean; message: string } | null) => void
  requesting: boolean
  setRequesting: (open: boolean) => void
  deciding: { request: LeaveRequest; decision: "Approved" | "Declined" } | null
  setDeciding: (value: { request: LeaveRequest; decision: "Approved" | "Declined" } | null) => void
}) {
  const [view, setView] = useState<AdminView>("approvals")
  const pendingCount = leave.filter((item) => item.status === "Pending").length
  const approvedSoon = leave.filter(
    (item) => item.status === "Approved" && item.start >= todayIso() && item.start <= addDays(todayIso(), 14)
  ).length

  const rows = useMemo(() => {
    const filtered =
      view === "approvals"
        ? leave.filter((item) => item.status === "Pending")
        : view === "mine"
          ? leave.filter((item) => item.employeeId === meId)
          : leave
    return [...filtered].sort((a, b) => b.start.localeCompare(a.start))
  }, [leave, view, meId])

  return (
    <>
      <DashboardHeader title="Leave & requests" parent="People Operations" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Leave & requests</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Organization-wide time off — review, approve, and track coverage.
            </p>
          </div>
          <Button onClick={onRequest} disabled={!meId}>
            <Plus data-icon="inline-start" />
            Request time off
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Pending approvals</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{pendingCount}</p>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Out in next 14 days</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{approvedSoon}</p>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Total requests</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{leave.length}</p>
          </div>
        </div>

        {meId ? (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            {leaveTypes.map((type) => {
              const { allowance, used, pending } = balance(meId, type)
              return (
                <div key={type} className="bg-card p-4">
                  <p className="text-xs text-muted-foreground">My {type.toLowerCase()}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {allowance === null ? used : allowance - used}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {allowance === null ? "days used" : `of ${allowance} left`}
                    </span>
                  </p>
                  {pending ? <p className="text-xs text-muted-foreground">{pending} pending</p> : null}
                </div>
              )
            })}
          </div>
        ) : null}

        <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

        <Tabs value={view} onValueChange={(value) => setView(value as AdminView)}>
          <TabsList variant="line">
            <TabsTrigger value="approvals">Pending ({pendingCount})</TabsTrigger>
            <TabsTrigger value="all">All requests</TabsTrigger>
            <TabsTrigger value="mine">My requests ({myRequests.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        <LeaveTable
          rows={rows}
          showEmployee={view !== "mine"}
          onDecide={onDecide}
          onNotice={setNotice}
          emptyMessage={
            view === "approvals"
              ? "No pending requests across the organization."
              : view === "mine"
                ? "You haven't requested any time off."
                : "No leave requests yet."
          }
        />
      </div>

      {requesting ? (
        <RequestDialog
          onClose={(message) => {
            setRequesting(false)
            if (message) setNotice({ ok: true, message })
          }}
        />
      ) : null}
      {deciding ? (
        <DecisionDialog
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
        />
      ) : null}
    </>
  )
}

function EmployeeLeavePage({
  leave,
  approvals,
  myRequests,
  me,
  canApprove,
  balance,
  onRequest,
  onDecide,
  notice,
  setNotice,
  requesting,
  setRequesting,
  deciding,
  setDeciding,
}: {
  leave: LeaveRequest[]
  approvals: LeaveRequest[]
  myRequests: LeaveRequest[]
  me: ReturnType<typeof useOrganization>["me"]
  canApprove: boolean
  balance: ReturnType<typeof usePeopleOps>["balance"]
  onRequest: () => void
  onDecide: (request: LeaveRequest, decision: "Approved" | "Declined") => void
  notice: { ok: boolean; message: string } | null
  setNotice: (notice: { ok: boolean; message: string } | null) => void
  requesting: boolean
  setRequesting: (open: boolean) => void
  deciding: { request: LeaveRequest; decision: "Approved" | "Declined" } | null
  setDeciding: (value: { request: LeaveRequest; decision: "Approved" | "Declined" } | null) => void
}) {
  const [view, setView] = useState<EmployeeView>("mine")

  useEffect(() => {
    if (!canApprove && view === "approvals") setView("mine")
  }, [canApprove, view])

  const rows = useMemo(() => {
    const filtered =
      view === "approvals" ? leave.filter((item) => approvals.some((a) => a.id === item.id)) : myRequests
    return [...filtered].sort((a, b) => b.start.localeCompare(a.start))
  }, [leave, approvals, myRequests, view])

  return (
    <>
      <DashboardHeader title="Leave & requests" parent="People Operations" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">My leave</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your balance, request time off, and track approval status.
            </p>
          </div>
          <Button onClick={onRequest} disabled={!me}>
            <Plus data-icon="inline-start" />
            Request time off
          </Button>
        </div>

        {me ? (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            {leaveTypes.map((type) => {
              const { allowance, used, pending } = balance(me.id, type)
              return (
                <div key={type} className="bg-card p-4">
                  <p className="text-xs text-muted-foreground">{type}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {allowance === null ? used : allowance - used}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {allowance === null ? "days used" : `of ${allowance} left`}
                    </span>
                  </p>
                  {pending ? <p className="text-xs text-muted-foreground">{pending} pending</p> : null}
                </div>
              )
            })}
          </div>
        ) : null}

        <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

        {canApprove ? (
          <Tabs value={view} onValueChange={(value) => setView(value as EmployeeView)}>
            <TabsList variant="line">
              <TabsTrigger value="mine">My requests</TabsTrigger>
              <TabsTrigger value="approvals">To approve ({approvals.length})</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <h2 className="text-sm font-medium text-muted-foreground">Your requests</h2>
        )}

        <LeaveTable
          rows={rows}
          showEmployee={view === "approvals"}
          onDecide={onDecide}
          onNotice={setNotice}
          emptyMessage={
            view === "approvals"
              ? "Nothing waiting for your approval."
              : "You haven't requested any time off yet."
          }
        />
      </div>

      {requesting ? (
        <RequestDialog
          onClose={(message) => {
            setRequesting(false)
            if (message) setNotice({ ok: true, message })
          }}
        />
      ) : null}
      {deciding ? (
        <DecisionDialog
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
        />
      ) : null}
    </>
  )
}

function NoticeBanner({
  notice,
  onDismiss,
}: {
  notice: { ok: boolean; message: string } | null
  onDismiss: () => void
}) {
  if (!notice) return null
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm",
        notice.ok ? "bg-muted/40" : "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      {notice.message}
      <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
        <X />
      </Button>
    </div>
  )
}

function LeaveTable({
  rows,
  showEmployee,
  onDecide,
  onNotice,
  emptyMessage,
}: {
  rows: LeaveRequest[]
  showEmployee: boolean
  onDecide: (request: LeaveRequest, decision: "Approved" | "Declined") => void
  onNotice: (notice: { ok: boolean; message: string }) => void
  emptyMessage: string
}) {
  const { canDecide, cancelLeave } = usePeopleOps()
  const { me, getEmployee } = useOrganization()
  const pagination = useClientPagination(rows, { pageSize: 10, resetKey: `${rows.length}-${showEmployee}` })

  if (!rows.length) {
    return <p className="rounded-lg border p-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">ID</TableHead>
            {showEmployee ? <TableHead>Employee</TableHead> : null}
            <TableHead>Type</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead className="text-right">Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Approver</TableHead>
            <TableHead className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagination.pageItems.map((item) => {
            const mine = item.employeeId === me?.id
            const cancellable =
              mine && (item.status === "Pending" || (item.status === "Approved" && item.start > todayIso()))
            return (
              <TableRow key={item.id} className={cn(item.status === "Cancelled" && "text-muted-foreground")}>
                <TableCell className="font-mono text-xs">{item.id.slice(0, 8)}</TableCell>
                {showEmployee ? (
                  <TableCell className="font-medium">{getEmployee(item.employeeId)?.name ?? "—"}</TableCell>
                ) : null}
                <TableCell>
                  {item.type}
                  {item.reason ? <p className="max-w-56 truncate text-xs text-muted-foreground">{item.reason}</p> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{dateRange(item.start, item.end)}</TableCell>
                <TableCell className="text-right tabular-nums">{workingDays(item.start, item.end)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[item.status]}>{item.status}</Badge>
                  {item.decisionNote ? (
                    <p className="mt-1 max-w-48 text-xs text-muted-foreground">“{item.decisionNote}”</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{getEmployee(item.approverId)?.name ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {canDecide(item) ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => onDecide(item, "Declined")}>
                        Decline
                      </Button>
                      <Button size="sm" onClick={() => onDecide(item, "Approved")}>
                        Approve
                      </Button>
                    </div>
                  ) : cancellable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void Promise.resolve(cancelLeave(item.id)).then((result) => {
                          onNotice(result.ok ? { ok: true, message: `${item.id.slice(0, 8)} cancelled.` } : result)
                        })
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
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
    </div>
  )
}

function RequestDialog({ onClose }: { onClose: (message?: string) => void }) {
  const { requestLeave, approverFor, balance } = usePeopleOps()
  const { me, getEmployee } = useOrganization()
  const [type, setType] = useState<LeaveType>("Annual leave")
  const [start, setStart] = useState(addDays(todayIso(), 7))
  const [end, setEnd] = useState(addDays(todayIso(), 7))
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  if (!me) return null
  const days = workingDays(start, end)
  const { allowance, used, pending } = balance(me.id, type)
  const remaining = allowance === null ? null : allowance - used - pending
  const approver = getEmployee(approverFor(me))

  async function submit() {
    setSaving(true)
    setError("")
    const result = await Promise.resolve(requestLeave({ type, start, end, reason }))
    setSaving(false)
    if (!result.ok) return setError(result.message)
    onClose(result.message)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request time off</DialogTitle>
          <DialogDescription>Goes to {approver?.name ?? "an administrator"} for approval.</DialogDescription>
        </DialogHeader>
        <form
          id="leave-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label="Type">
            <OptionSelect value={type} options={leaveTypes} onChange={setType} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" htmlFor="leave-start">
              <Input
                id="leave-start"
                type="date"
                value={start}
                onChange={(event) => {
                  setStart(event.target.value)
                  if (event.target.value > end) setEnd(event.target.value)
                }}
              />
            </Field>
            <Field label="To" htmlFor="leave-end">
              <Input id="leave-end" type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} />
            </Field>
          </div>
          <p className={cn("text-sm", remaining !== null && days > remaining ? "text-destructive" : "text-muted-foreground")}>
            {days} working {days === 1 ? "day" : "days"}
            {remaining !== null ? ` · ${remaining} of ${leaveAllowance[type]} available` : ""}
          </p>
          <Field label="Reason (optional)" htmlFor="leave-reason">
            <Textarea id="leave-reason" value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-16" />
          </Field>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button type="submit" form="leave-form" loading={saving} disabled={!days}>
            {saving ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DecisionDialog({
  request,
  decision,
  onClose,
}: {
  request: LeaveRequest
  decision: "Approved" | "Declined"
  onClose: () => void
}) {
  const { decideLeave, balance } = usePeopleOps()
  const { getEmployee } = useOrganization()
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const person = getEmployee(request.employeeId)
  const { allowance, used } = balance(request.employeeId, request.type)
  const days = workingDays(request.start, request.end)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {decision === "Approved" ? "Approve" : "Decline"} {request.id.slice(0, 8)}
          </DialogTitle>
          <DialogDescription>
            {person?.name} · {request.type} · {dateRange(request.start, request.end)} ({days}{" "}
            {days === 1 ? "day" : "days"})
            {allowance !== null ? ` · ${allowance - used} of ${allowance} days left before this request` : ""}
          </DialogDescription>
        </DialogHeader>
        {request.reason ? <p className="rounded-md bg-muted/50 p-3 text-sm">“{request.reason}”</p> : null}
        <Field label={decision === "Declined" ? "Reason (required)" : "Note (optional)"} htmlFor="decision-note">
          <Textarea id="decision-note" autoFocus value={note} onChange={(event) => setNote(event.target.value)} className="min-h-16" />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decision === "Declined" ? "destructive" : "default"}
            loading={saving}
            onClick={() => {
              setSaving(true)
              void Promise.resolve(decideLeave(request.id, decision, note)).then((result) => {
                setSaving(false)
                if (!result.ok) return setError(result.message)
                onClose()
              })
            }}
          >
            {saving ? "Saving…" : decision === "Approved" ? "Approve" : "Decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
