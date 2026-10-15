"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Download, ExternalLink } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { useAgency } from "@/components/dashboard/agency-store"
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
import { billingApi, type ApiBillingInvoice, type ApiSubscription } from "@/lib/auth-api"
import { formatUsd, seedSubscription, type Invoice } from "@/lib/subscription"
import { useClientPagination } from "@/lib/use-client-pagination"
import { cn } from "@/lib/utils"
import { TablePageSkeleton } from "@/components/dashboard/page-skeletons"

function mapSeed(invoices: Invoice[]): ApiBillingInvoice[] {
  return invoices.map((invoice) => ({
    id: invoice.id,
    date: invoice.date,
    amount: invoice.amount,
    status: invoice.status,
    description: invoice.description,
    hostedInvoiceUrl: "",
    pdfUrl: "",
  }))
}

export default function SubscriptionBillingPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const { agency } = useAgency()
  const [sub, setSub] = useState<ApiSubscription | null>(null)
  const [invoices, setInvoices] = useState<ApiBillingInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const pagination = useClientPagination(invoices, { pageSize: 10, resetKey: invoices.length })

  const load = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setSub({
        organization_id: "local",
        planId: seedSubscription.planId,
        status: seedSubscription.status,
        renewsOn: seedSubscription.renewsOn,
        billingEmail: seedSubscription.billingEmail,
        paymentMethod: seedSubscription.paymentMethod,
        stripeConfigured: false,
        hasCustomer: false,
      })
      setInvoices(mapSeed(seedSubscription.invoices))
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [subscription, rows] = await Promise.all([
        billingApi.getSubscription(activeOrgId),
        billingApi.listInvoices(activeOrgId).catch(() => [] as ApiBillingInvoice[]),
      ])
      setSub(subscription)
      setInvoices(rows)
      if (!subscription.stripeConfigured) {
        setNotice("Stripe is not configured — showing empty invoice history until STRIPE_SECRET_KEY is set.")
      }
    } catch {
      setNotice("Could not load billing history.")
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void load()
  }, [load])

  async function openPortal() {
    if (!activeOrgId) return
    try {
      const { url } = await billingApi.portal(activeOrgId)
      window.location.href = url
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not open Stripe portal.")
    }
  }

  return (
    <>
      <DashboardHeader title="Billing history" parent="Subscription" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href="/dashboard/subscription"
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Plan & usage
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">Billing history</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Stripe invoices for {agency.name}. Open receipts in Stripe when available.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sub?.hasCustomer ? (
              <Button size="sm" variant="outline" onClick={() => void openPortal()}>
                <ExternalLink data-icon="inline-start" />
                Stripe portal
              </Button>
            ) : null}
            <div className="rounded-xl border bg-card px-4 py-3 text-sm">
              <p className="text-xs text-muted-foreground">Billing email</p>
              <p className="font-medium">{sub?.billingEmail || agency.contactEmail || "—"}</p>
            </div>
          </div>
        </div>

        {notice ? (
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-2.5 text-sm">{notice}</div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Paid",
              value: formatUsd(invoices.filter((i) => i.status === "Paid").reduce((sum, i) => sum + i.amount, 0)),
            },
            {
              label: "Open balance",
              value: formatUsd(invoices.filter((i) => i.status === "Open").reduce((sum, i) => sum + i.amount, 0)),
            },
            {
              label: "Invoices",
              value: String(invoices.length),
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3 sm:px-5">
            <h2 className="font-semibold">Invoices</h2>
            <p className="text-sm text-muted-foreground">Newest first</p>
          </div>
          {loading ? (
            <TablePageSkeleton rows={5} columns={4} />
          ) : invoices.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium tabular-nums">{invoice.id}</TableCell>
                      <TableCell className="text-muted-foreground">{invoice.date}</TableCell>
                      <TableCell>{invoice.description}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            invoice.status === "Paid" &&
                              "border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
                            invoice.status === "Failed" && "border-destructive/30 text-destructive",
                            invoice.status === "Open" &&
                              "border-amber-500/30 text-amber-700 dark:text-amber-400"
                          )}
                        >
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatUsd(invoice.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!invoice.pdfUrl && !invoice.hostedInvoiceUrl}
                          onClick={() =>
                            window.open(
                              invoice.pdfUrl || invoice.hostedInvoiceUrl,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                        >
                          <Download data-icon="inline-start" />
                          PDF
                        </Button>
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
            <p className="p-10 text-center text-sm text-muted-foreground">
              No Stripe invoices yet. Subscribe to a plan to generate billing history.
            </p>
          )}
        </section>

        <section className="rounded-2xl border bg-muted/20 p-4 sm:p-5">
          <h2 className="font-semibold">Billing details</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Legal name</dt>
              <dd className="font-medium">{agency.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Payment method</dt>
              <dd className="font-medium">
                {sub?.paymentMethod.brand && sub.paymentMethod.last4
                  ? `${sub.paymentMethod.brand} ···· ${sub.paymentMethod.last4}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Next renewal</dt>
              <dd className="font-medium">{sub?.renewsOn || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Plan status</dt>
              <dd className="font-medium">{sub?.status || "Inactive"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  )
}
