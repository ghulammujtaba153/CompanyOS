"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Download, Plus } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { useClients } from "@/components/dashboard/clients-store"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
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
import { Field, KeyedSelect, OptionSelect } from "@/components/dashboard/form-controls"
import { financeApi, type ApiClientInvoice } from "@/lib/auth-api"
import {
  formatInvoiceMoney,
  seedClientInvoices,
  type ClientInvoice,
  type ClientInvoiceStatus,
} from "@/lib/finance-invoices"
import { useClientPagination } from "@/lib/use-client-pagination"
import { cn } from "@/lib/utils"
import { TablePageSkeleton } from "@/components/dashboard/page-skeletons"

const statuses: ClientInvoiceStatus[] = ["Draft", "Sent", "Paid", "Overdue", "Void"]

function mapInvoice(row: ApiClientInvoice): ClientInvoice {
  return {
    id: row.id,
    number: row.number,
    clientId: row.clientId,
    clientName: row.clientName,
    engagementId: row.engagementId,
    engagementTitle: row.engagementTitle,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    amount: row.amount,
    currency: row.currency,
    status: row.status as ClientInvoiceStatus,
    lineItems: (row.lineItems || []).map((item) => ({
      description: String(item.description ?? ""),
      amount: Number(item.amount ?? 0),
    })),
  }
}

export default function FinanceInvoicesPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const { clients, engagements } = useClients()
  const [invoices, setInvoices] = useState<ClientInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setInvoices(seedClientInvoices)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await financeApi.listInvoices(activeOrgId)
      setInvoices(rows.map(mapInvoice))
    } catch {
      setInvoices([])
      setNotice("Could not load invoices.")
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void load()
  }, [load])

  const paid = invoices.filter((i) => i.status === "Paid").reduce((sum, i) => sum + i.amount, 0)
  const open = invoices
    .filter((i) => i.status === "Sent" || i.status === "Overdue")
    .reduce((sum, i) => sum + i.amount, 0)
  const pagination = useClientPagination(invoices, { pageSize: 10, resetKey: invoices.length })

  async function setStatus(id: string, status: ClientInvoiceStatus) {
    setInvoices((current) => current.map((item) => (item.id === id ? { ...item, status } : item)))
    if (useApi) {
      try {
        const row = await financeApi.updateInvoice(id, { status })
        setInvoices((current) => current.map((item) => (item.id === id ? mapInvoice(row) : item)))
      } catch {
        setNotice("Could not update invoice.")
        void load()
      }
    }
  }

  return (
    <>
      <DashboardHeader title="Invoices" parent="Finance" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Client invoices</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Bill engagements and track payment status.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" />
            New invoice
          </Button>
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm">
            {notice}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatInvoiceMoney(paid)}</p>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Open / overdue</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatInvoiceMoney(open)}</p>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Invoices</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{invoices.length}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <TablePageSkeleton rows={6} columns={5} />
          ) : invoices.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/finance/invoices/${invoice.id}`}
                          className="font-medium tabular-nums hover:underline"
                        >
                          {invoice.number}
                        </Link>
                        <p className="text-xs text-muted-foreground">Issued {invoice.issueDate}</p>
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/clients/${invoice.clientId}`} className="hover:underline">
                          {invoice.clientName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{invoice.engagementTitle || "—"}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{invoice.dueDate}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            invoice.status === "Paid" &&
                              "border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
                            invoice.status === "Overdue" && "border-destructive/30 text-destructive",
                            invoice.status === "Sent" &&
                              "border-sky-500/30 text-sky-700 dark:text-sky-400"
                          )}
                        >
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatInvoiceMoney(invoice.amount, invoice.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {invoice.status === "Draft" ? (
                            <Button size="sm" variant="outline" onClick={() => void setStatus(invoice.id, "Sent")}>
                              Send
                            </Button>
                          ) : null}
                          {invoice.status === "Sent" || invoice.status === "Overdue" ? (
                            <Button size="sm" onClick={() => void setStatus(invoice.id, "Paid")}>
                              Mark paid
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.print()}
                          >
                            <Download data-icon="inline-start" />
                            PDF
                          </Button>
                        </div>
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
            <p className="p-10 text-center text-sm text-muted-foreground">No client invoices yet.</p>
          )}
        </div>
      </div>

      {creating ? (
        <CreateInvoiceDialog
          clients={clients}
          engagements={engagements}
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            if (useApi && activeOrgId) {
              try {
                const row = await financeApi.createInvoice(activeOrgId, input)
                setInvoices((current) => [mapInvoice(row), ...current])
                setNotice("Invoice created.")
                setCreating(false)
                return { ok: true as const }
              } catch (err) {
                return {
                  ok: false as const,
                  message: err instanceof Error ? err.message : "Could not create invoice.",
                }
              }
            }
            const id = `cinv-${Date.now()}`
            setInvoices((current) => [
              {
                id,
                number: input.number || `INV-${Date.now().toString().slice(-4)}`,
                clientId: String(input.clientId),
                clientName: String(input.clientName),
                engagementId: String(input.engagementId || ""),
                engagementTitle: String(input.engagementTitle || ""),
                issueDate: String(input.issueDate),
                dueDate: String(input.dueDate),
                amount: Number(input.amount || 0),
                currency: "USD",
                status: (input.status as ClientInvoiceStatus) || "Draft",
                lineItems: (input.lineItems as ClientInvoice["lineItems"]) || [],
              },
              ...current,
            ])
            setCreating(false)
            return { ok: true as const }
          }}
        />
      ) : null}
    </>
  )
}

function CreateInvoiceDialog({
  clients,
  engagements,
  onClose,
  onCreate,
}: {
  clients: { id: string; company: string }[]
  engagements: { id: string; clientId: string; title: string }[]
  onClose: () => void
  onCreate: (input: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; message: string }>
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "")
  const clientEngagements = engagements.filter((item) => item.clientId === clientId)
  const [engagementId, setEngagementId] = useState(clientEngagements[0]?.id ?? "")
  const [amount, setAmount] = useState("5000")
  const [status, setStatus] = useState<ClientInvoiceStatus>("Draft")
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    const client = clients.find((item) => item.id === clientId)
    if (!client) return setError("Choose a client.")
    const engagement = clientEngagements.find((item) => item.id === engagementId)
    setSaving(true)
    const result = await onCreate({
      clientId,
      clientName: client.company,
      engagementId: engagement?.id || "",
      engagementTitle: engagement?.title || "",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate,
      amount: Number(amount) || 0,
      status,
      lineItems: [{ description: engagement?.title || "Professional services", amount: Number(amount) || 0 }],
    })
    setSaving(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New client invoice</DialogTitle>
        </DialogHeader>
        <form
          id="invoice-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label="Client">
            <KeyedSelect
              className="w-full"
              value={clientId}
              onChange={(value) => {
                setClientId(value)
                const next = engagements.filter((item) => item.clientId === value)
                setEngagementId(next[0]?.id ?? "")
              }}
              options={clients.map((item) => [item.id, item.company] as const)}
            />
          </Field>
          <Field label="Engagement">
            <KeyedSelect
              className="w-full"
              value={engagementId}
              onChange={setEngagementId}
              options={[
                ["", "No engagement"],
                ...clientEngagements.map((item) => [item.id, item.title] as const),
              ]}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" htmlFor="inv-amount">
              <Input id="inv-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Due" htmlFor="inv-due">
              <Input id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Status">
            <OptionSelect value={status} options={statuses} onChange={setStatus} />
          </Field>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invoice-form" loading={saving} disabled={!clients.length}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
