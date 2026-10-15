"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { AlertTriangle, CircleCheck, X } from "lucide-react"

import { useApprovals, type ActionStatus, type AgentAction } from "@/components/dashboard/approvals-store"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, KeyedSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useOrganization } from "@/components/dashboard/organization-store"
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
import { cn } from "cn"
import { capabilityName, type Risk } from "@/lib/governance"
import { useClientPagination } from "@/lib/use-client-pagination"

type View = "mine" | "pending" | "history"

const OVERDUE_MS = 24 * 60 * 60_000

const riskVariant: Record<Risk, "secondary" | "outline" | "destructive"> = {
  Low: "secondary",
  Medium: "outline",
  High: "destructive",
  Critical: "destructive",
}

const statusVariant: Record<ActionStatus, "secondary" | "outline" | "destructive" | "default"> = {
  Pending: "outline",
  Approved: "default",
  Declined: "destructive",
  "Auto-executed": "secondary",
  Blocked: "destructive",
  Drafted: "outline",
}

function age(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}m`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export default function ApprovalsPage() {
  const { loading, mine, pending } = useApprovals()
  const [view, setView] = useState<View>(mine.length ? "mine" : "pending")
  const [reviewing, setReviewing] = useState<AgentAction | null>(null)
  const [notice, setNotice] = useState("")

  if (loading) {
    return (
      <>
        <DashboardHeader title="Approvals" />
        <PageLoadingState label="Loading approvals…" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="Approvals" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agent actions the{" "}
            <Link href="/dashboard/governance/firewall" className="underline underline-offset-2">
              decision firewall
            </Link>{" "}
            held for a person to approve.
          </p>
        </div>

        {notice ? (
          <div role="status" className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
            {notice}
            <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setNotice("")}>
              <X />
            </Button>
          </div>
        ) : null}

        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList variant="line">
            <TabsTrigger value="mine">Needs my decision ({mine.length})</TabsTrigger>
            <TabsTrigger value="pending">All pending ({pending.length})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>

        {view === "history" ? (
          <History />
        ) : (
          <PendingList items={view === "mine" ? mine : pending} onReview={setReviewing} emptyMine={view === "mine"} />
        )}
      </div>

      {reviewing ? (
        <ReviewDialog
          action={reviewing}
          onClose={(message) => {
            setReviewing(null)
            if (message) setNotice(message)
          }}
        />
      ) : null}
    </>
  )
}

function PendingList({
  items,
  onReview,
  emptyMine,
}: {
  items: AgentAction[]
  onReview: (action: AgentAction) => void
  emptyMine: boolean
}) {
  const { canDecide, approversFor } = useApprovals()
  // Snapshot "now" once per mount so render stays pure.
  const [now] = useState(() => Date.now())
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [items]
  )
  const pagination = useClientPagination(sorted, {
    resetKey: `${emptyMine ? "mine" : "pending"}|${sorted.length}`,
  })

  if (!sorted.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border py-16 text-center">
        <CircleCheck className="mb-3 size-8 text-muted-foreground" />
        <p className="font-medium">{emptyMine ? "Nothing needs your decision" : "No pending approvals"}</p>
        <p className="mt-1 text-sm text-muted-foreground">Agents are working within policy.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Action</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Path</TableHead>
            <TableHead>Waiting</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagination.pageItems.map((action) => {
            const overdue = now - Date.parse(action.createdAt) > OVERDUE_MS
            const approvers = approversFor(action)
            return (
              <TableRow key={action.id}>
                <TableCell>
                  <p className="font-medium">{action.title}</p>
                  <p className="max-w-md truncate text-xs text-muted-foreground">{action.detail}</p>
                </TableCell>
                <TableCell>{action.agent}</TableCell>
                <TableCell>
                  <Badge variant={riskVariant[action.risk]}>{action.risk}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <p>{action.requiredPath ?? "—"}</p>
                  <p className="max-w-48 truncate text-xs">
                    {approvers.length
                      ? approvers.map((person) => person.name).join(", ")
                      : "No eligible approver"}
                  </p>
                </TableCell>
                <TableCell>
                  <span className={cn("tabular-nums", overdue && "font-medium text-destructive")}>
                    {age(action.createdAt)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {canDecide(action) ? (
                    <Button size="sm" onClick={() => onReview(action)}>
                      Review
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
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

function ReviewDialog({ action, onClose }: { action: AgentAction; onClose: (message?: string) => void }) {
  const { decide, recheck } = useApprovals()
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const current = recheck(action)
  const nowBlocked = !current || current.outcome === "Blocked"
  const nowAuto = current?.outcome === "Auto-execute"

  function submit(decision: "Approved" | "Declined") {
    const result = decide(action.id, decision, note)
    if (!result.ok) return setError(result.message)
    onClose(result.message ?? `“${action.title}” declined.`)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{action.title}</DialogTitle>
          <DialogDescription>
            {action.agent} · requested {when(action.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Action</dt>
          <dd>{capabilityName(action.capabilityId)}</dd>
          <dt className="text-muted-foreground">Details</dt>
          <dd>{action.detail}</dd>
          {action.context.amount ? (
            <>
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="tabular-nums">${action.context.amount.toLocaleString()}</dd>
            </>
          ) : null}
          {action.context.records ? (
            <>
              <dt className="text-muted-foreground">Records</dt>
              <dd className="tabular-nums">{action.context.records.toLocaleString()}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Risk</dt>
          <dd>
            <Badge variant={riskVariant[action.risk]}>{action.risk}</Badge>
          </dd>
          <dt className="text-muted-foreground">Approval</dt>
          <dd>{action.requiredPath}</dd>
        </dl>

        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <p className="mb-1 font-medium">Why this needs approval</p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {action.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>

        {nowBlocked ? (
          <p className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Policy changed since this request: {current?.reasons[0] ?? "the agent's passport was revoked"}. It can only be
            declined.
          </p>
        ) : nowAuto ? (
          <p className="text-xs text-muted-foreground">
            Note: under current policy this action would no longer need approval.
          </p>
        ) : null}

        <Field label="Note" htmlFor="approval-note">
          <Textarea
            id="approval-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Required when declining"
            className="min-h-16"
          />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => submit("Declined")}>
            Decline
          </Button>
          <Button onClick={() => submit("Approved")} disabled={nowBlocked}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const historyStatuses: ActionStatus[] = ["Approved", "Declined", "Auto-executed", "Blocked", "Drafted"]

function History() {
  const { actions } = useApprovals()
  const { getEmployee } = useOrganization()
  const [status, setStatus] = useState("all")
  const rows = useMemo(
    () =>
      actions
        .filter((action) => action.status !== "Pending" && (status === "all" || action.status === status))
        .sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt)),
    [actions, status]
  )
  const pagination = useClientPagination(rows, { resetKey: `${status}|${rows.length}` })

  return (
    <div className="space-y-3">
      <KeyedSelect
        value={status}
        onChange={setStatus}
        options={[["all", "All outcomes"], ...historyStatuses.map((item) => [item, item] as const)]}
      />
      <div className="overflow-hidden rounded-lg border">
        {rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Decided by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((action) => (
                  <TableRow key={action.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {when(action.decidedAt ?? action.createdAt)}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{action.title}</p>
                      <p className="max-w-md truncate text-xs text-muted-foreground">
                        {action.note ? `“${action.note}”` : action.reasons[0]}
                      </p>
                    </TableCell>
                    <TableCell>{action.agent}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[action.status]}>{action.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {action.decidedBy ? getEmployee(action.decidedBy)?.name ?? "Former member" : "Policy"}
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
          <p className="p-10 text-center text-sm text-muted-foreground">No history for this filter.</p>
        )}
      </div>
    </div>
  )
}
