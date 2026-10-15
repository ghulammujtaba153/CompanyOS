"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useClients } from "@/components/dashboard/clients-store"
import { Badge } from "@/components/ui/badge"
import {
  engagementProgress,
  formatEngagementMoney,
} from "@/lib/clients"
import { formatDate } from "@/lib/work-utils"

export default function ClientsPipelinePage() {
  const router = useRouter()
  const { loading, activePipeline, getClient } = useClients()
  const items = activePipeline()

  if (loading) {
    return (
      <>
        <DashboardHeader title="Active pipeline" parent="Clients" />
        <PageLoadingState label="Loading pipeline…" variant="list" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="Active pipeline" parent="Clients" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Active pipeline</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Client engagements still in the commercial pipeline—not yet (or not only)
            delivery work in Work Management.
          </p>
        </div>

        {items.length ? (
          <ul className="grid gap-3">
            {items.map((engagement) => {
              const client = getClient(engagement.clientId)
              return (
                <li key={engagement.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                    onClick={() =>
                      router.push(`/dashboard/clients/engagements/${engagement.id}`)
                    }
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">
                        {client?.company ?? "Unknown client"}
                      </p>
                      <p className="mt-1 font-medium">{engagement.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatEngagementMoney(engagement.price)} · Due{" "}
                        {formatDate(engagement.dueDate)} · {engagement.phases.length}{" "}
                        phases · {engagement.files.length} files
                      </p>
                      <div className="mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-foreground"
                          style={{ width: `${engagementProgress(engagement)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <Badge variant="outline">{engagement.status}</Badge>
                      <Link
                        href={`/dashboard/clients/${engagement.clientId}`}
                        className="text-xs font-medium underline-offset-2 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        View client
                      </Link>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
            No open engagements in the pipeline.{" "}
            <Link href="/dashboard/clients/list" className="underline underline-offset-2">
              Browse clients
            </Link>{" "}
            to start one.
          </p>
        )}
      </div>
    </>
  )
}
