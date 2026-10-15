"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Download } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { financeApi, type ApiClientInvoice } from "@/lib/auth-api"
import {
import { DetailPageSkeleton } from "@/components/dashboard/page-skeletons"
  formatInvoiceMoney,
  seedClientInvoices,
  type ClientInvoice,
  type ClientInvoiceStatus,
} from "@/lib/finance-invoices"

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

export default function InvoiceDetailPage() {
  const params = useParams<{ invoiceId: string }>()
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [invoice, setInvoice] = useState<ClientInvoice | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!params.invoiceId) return
    if (!useApi) {
      setInvoice(seedClientInvoices.find((item) => item.id === params.invoiceId) ?? null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const row = await financeApi.getInvoice(params.invoiceId)
      setInvoice(mapInvoice(row))
    } catch {
      setInvoice(null)
    } finally {
      setLoading(false)
    }
  }, [useApi, params.invoiceId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <>
        <DashboardHeader title="Invoice" parent="Finance" />
        <DetailPageSkeleton />
      </>
    )
  }

  if (!invoice) {
    return (
      <>
        <DashboardHeader title="Invoice not found" parent="Finance" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="text-sm text-muted-foreground">This invoice does not exist.</p>
          <Button render={<Link href="/dashboard/finance/invoices" />}>Back to invoices</Button>
        </div>
      </>
    )
  }

  return (
    <>
      <DashboardHeader title={invoice.number} parent="Finance" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div>
          <Link
            href="/dashboard/finance/invoices"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            All invoices
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{invoice.number}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {invoice.clientName} · {invoice.engagementTitle}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{invoice.status}</Badge>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Download data-icon="inline-start" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card px-4 py-3 text-sm">
            <p className="text-xs text-muted-foreground">Issue date</p>
            <p className="mt-1 font-medium">{invoice.issueDate}</p>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-3 text-sm">
            <p className="text-xs text-muted-foreground">Due date</p>
            <p className="mt-1 font-medium">{invoice.dueDate}</p>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-3 text-sm">
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatInvoiceMoney(invoice.amount, invoice.currency)}
            </p>
          </div>
        </div>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">Line items</h2>
          <ul className="mt-3 divide-y text-sm">
            {invoice.lineItems.map((item, index) => (
              <li key={`${item.description}-${index}`} className="flex items-center justify-between gap-3 py-3">
                <span>{item.description}</span>
                <span className="tabular-nums font-medium">
                  {formatInvoiceMoney(item.amount, invoice.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
