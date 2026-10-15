"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowUpRight, Check, CreditCard } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useAgency } from "@/components/dashboard/agency-store"
import { useOrganization } from "@/components/dashboard/organization-store"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { billingApi, type ApiSubscription } from "@/lib/auth-api"
import { useHiringState } from "@/lib/hiring-store"
import {
  formatUsd,
  seedSubscription,
  subscriptionPlans,
  usageMeters,
  type PlanId,
} from "@/lib/subscription"
import { cn } from "@/lib/utils"

export default function SubscriptionPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const searchParams = useSearchParams()
  const { agency } = useAgency()
  const { employees } = useOrganization()
  const { projects } = useProjectWorkspace()
  const { jobs, candidates } = useHiringState()
  const [sub, setSub] = useState<ApiSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const row = await billingApi.getSubscription(activeOrgId)
      setSub(row)
    } catch {
      setSub(null)
      setNotice("Could not load subscription.")
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const checkout = searchParams.get("checkout")
    if (checkout === "success") {
      setNotice("Checkout completed. Stripe will confirm your plan shortly — refresh if status lags.")
      void load()
    } else if (checkout === "cancel") {
      setNotice("Checkout cancelled.")
    }
  }, [searchParams, load])

  const planId = (sub?.planId || seedSubscription.planId) as PlanId
  const current = subscriptionPlans.find((plan) => plan.id === planId) ?? subscriptionPlans[1]
  const seatsUsed = employees.filter((e) => e.status === "Active").length
  const meters = useMemo(
    () =>
      usageMeters({
        seatsUsed,
        openJobs: jobs.filter((j) => j.status === "Open").length,
        activeCandidates: candidates.filter((c) => c.stage !== "Rejected" && c.stage !== "Hired").length,
        projects: projects.length,
      }).map((meter) => (meter.label === "Seats" ? { ...meter, limit: current.seats } : meter)),
    [seatsUsed, jobs, candidates, projects.length, current.seats]
  )

  async function selectPlan(id: PlanId) {
    if (!useApi || !activeOrgId) {
      setNotice("Sign in to subscribe with Stripe.")
      return
    }
    if (!sub?.stripeConfigured) {
      setNotice("Add STRIPE_SECRET_KEY to server/.env, then restart the API.")
      return
    }
    setBusyPlan(id)
    setNotice(null)
    try {
      const { url } = await billingApi.checkout(activeOrgId, id)
      window.location.href = url
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not start Stripe Checkout.")
      setBusyPlan(null)
    }
  }

  async function openPortal() {
    if (!useApi || !activeOrgId) return
    try {
      const { url } = await billingApi.portal(activeOrgId)
      window.location.href = url
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not open billing portal.")
    }
  }

  const status = sub?.status || "Inactive"
  const renewsOn = sub?.renewsOn || "—"
  const payment = sub?.paymentMethod

  if (loading) {
    return (
      <>
        <DashboardHeader title="Subscription" parent="Subscription" />
        <PageLoadingState label="Loading subscription…" variant="cards" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="Subscription" parent="Subscription" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight">Plan & usage</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Manage {agency.name}&apos;s CompanyOS plan via Stripe. Billing history and payment methods open
              in the Stripe Customer Portal.
            </p>
          </div>
          <Button size="sm" variant="outline" render={<Link href="/dashboard/subscription/billing" />}>
            Billing history
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm">
            {notice}
          </div>
        ) : null}

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{current.name} plan</h2>
                <Badge variant="outline">{loading ? "…" : status || "Inactive"}</Badge>
                {sub && !sub.stripeConfigured ? (
                  <Badge variant="outline" className="border-amber-500/30 text-amber-700">
                    Stripe not configured
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-semibold tabular-nums">{formatUsd(current.priceMonthly)}</p>
              <p className="text-xs text-muted-foreground">per month · renews {renewsOn}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {meters.map((meter) => {
              const pct = Math.min(100, Math.round((meter.used / meter.limit) * 100))
              const hot = pct >= 85
              return (
                <div key={meter.label} className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{meter.label}</span>
                    <span className={cn("tabular-nums font-medium", hot && "text-amber-700 dark:text-amber-400")}>
                      {meter.used}/{meter.limit}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", hot ? "bg-amber-500" : "bg-foreground/70")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{meter.unit}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="font-semibold">Compare plans</h2>
          <p className="text-sm text-muted-foreground">
            Choosing a plan opens Stripe Checkout. Existing subscribers can change plans in the portal.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {subscriptionPlans.map((plan) => {
              const selected = plan.id === planId && Boolean(sub?.status && sub.status !== "Canceled" && sub.status !== "Inactive")
              return (
                <article
                  key={plan.id}
                  className={cn(
                    "flex flex-col rounded-2xl border bg-card p-4 sm:p-5",
                    selected && "border-foreground ring-1 ring-foreground/10"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{plan.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                    </div>
                    {selected ? <Badge>Current</Badge> : null}
                  </div>
                  <p className="mt-4 text-2xl font-semibold tabular-nums">
                    {formatUsd(plan.priceMonthly)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm">
                    {plan.highlights.map((item) => (
                      <li key={item} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-5 w-full"
                    variant={selected ? "outline" : "default"}
                    disabled={selected || busyPlan === plan.id}
                    onClick={() => void selectPlan(plan.id)}
                  >
                    {busyPlan === plan.id
                      ? "Redirecting…"
                      : selected
                        ? "Current plan"
                        : `Subscribe to ${plan.name}`}
                  </Button>
                </article>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                <CreditCard className="size-4 text-muted-foreground" />
              </div>
              <div>
                <h2 className="font-semibold">Payment method</h2>
                <p className="text-sm text-muted-foreground">
                  {payment?.brand && payment?.last4
                    ? `${payment.brand} ending in ${payment.last4}`
                    : "No card on file yet"}
                  {payment?.expires ? ` · expires ${payment.expires}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Invoices go to {sub?.billingEmail || agency.contactEmail || "your billing email"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {sub?.hasCustomer ? (
                <Button size="sm" variant="outline" onClick={() => void openPortal()}>
                  Manage in Stripe
                </Button>
              ) : null}
              <Button size="sm" variant="outline" render={<Link href="/dashboard/subscription/billing" />}>
                View invoices
              </Button>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
