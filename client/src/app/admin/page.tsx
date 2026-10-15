"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Building2, ScrollText, Shield, Ticket, Users } from "lucide-react"

import { AdminHeader } from "@/components/admin/admin-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { Button } from "@/components/ui/button"
import { adminApi, type AdminOverview } from "@/lib/auth-api"

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void adminApi
      .overview()
      .then((data) => {
        if (!cancelled) setOverview(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load overview.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <>
        <AdminHeader title="Overview" />
        <PageLoadingState label="Loading admin overview…" />
      </>
    )
  }

  const cards = [
    { label: "Organizations", value: overview?.organizations ?? 0, href: "/admin/organizations", icon: Building2 },
    { label: "Users", value: overview?.users ?? 0, href: "/admin/users", icon: Users },
    { label: "Open tickets", value: overview?.open_tickets ?? 0, href: "/admin/tickets", icon: Ticket },
    { label: "Platform admins", value: overview?.platform_admins ?? 0, href: "/admin/users", icon: Shield },
  ]

  return (
    <>
      <AdminHeader title="Overview" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Platform overview</h1>
            <p className="text-sm text-muted-foreground">
              Cross-society visibility for CompanyOS operators.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" render={<Link href="/admin/tickets" />}>
              <Ticket data-icon="inline-start" />
              Support tickets
            </Button>
            <Button variant="outline" render={<Link href="/admin/log-classification" />}>
              <ScrollText data-icon="inline-start" />
              Log classification
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <card.icon className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{card.value}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
