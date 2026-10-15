"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { agencyInitials, seedAgency } from "@/lib/agency"
import { engagementProgress, seedClients, seedEngagements } from "@/lib/clients"

export default function ClientPortalPage() {
  const params = useParams<{ clientId: string }>()
  const client = seedClients.find((item) => item.id === params.clientId)
  const engagements = seedEngagements.filter((item) => item.clientId === params.clientId)
  const agency = seedAgency

  if (!client) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Client portal not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-gradient-to-b from-muted/40 to-background">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
              {agencyInitials(agency.name)}
            </div>
            <div>
              <p className="text-sm font-semibold">{agency.name}</p>
              <p className="text-xs text-muted-foreground">Client portal · preview</p>
            </div>
          </div>
          <Badge variant="outline">Read-only demo</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{client.company}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome, {client.name}. Track milestones and shared files for your engagements.
          </p>
        </div>

        {engagements.map((engagement) => {
          const progress = engagementProgress(engagement)
          return (
            <section key={engagement.id} className="rounded-2xl border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{engagement.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{engagement.description}</p>
                </div>
                <Badge variant="outline">{engagement.status}</Badge>
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Phase progress</span>
                  <span className="tabular-nums">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {engagement.phases.map((phase) => (
                  <li
                    key={phase.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
                  >
                    <span>{phase.name}</span>
                    <Badge variant="outline">{phase.status}</Badge>
                  </li>
                ))}
              </ul>
              {engagement.files.length ? (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Shared files
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {engagement.files.map((file) => (
                      <li key={file.id} className="flex justify-between gap-2 text-muted-foreground">
                        <span>{file.name}</span>
                        <span className="text-xs">{file.sizeLabel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          )
        })}

        {!engagements.length ? (
          <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            No engagements shared yet.
          </p>
        ) : null}

        <p className="text-center text-xs text-muted-foreground">
          Internal staff view:{" "}
          <Link href={`/dashboard/clients/${client.id}`} className="underline underline-offset-2">
            open in CompanyOS
          </Link>
        </p>
        <div className="flex justify-center">
          <Button size="sm" variant="outline" render={<Link href="/dashboard/clients/list" />}>
            Back to clients
          </Button>
        </div>
      </main>
    </div>
  )
}
