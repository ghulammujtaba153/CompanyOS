"use client"

import Link from "next/link"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { useGovernance } from "@/components/dashboard/governance-store"
import { useOrganization } from "@/components/dashboard/organization-store"
import { Badge } from "@/components/ui/badge"
import { cn } from "cn"
import { autonomyLevels } from "@/lib/governance"

function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function GovernanceAutonomyPage() {
  const { defaultAutonomy, setDefaultAutonomy, passports, canEdit, changes } = useGovernance()
  const { getEmployee } = useOrganization()

  return (
    <>
      <DashboardHeader title="Autonomy ladder" parent="Governance" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Autonomy ladder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The company default applies to every agent without its own level in{" "}
            <Link href="/dashboard/governance/passports" className="underline underline-offset-2">
              Permission passports
            </Link>
            .{canEdit ? "" : " Only Owners and Admins can change it."}
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
          <ol role="radiogroup" aria-label="Company default autonomy" className="divide-y rounded-lg border">
            {autonomyLevels.map((level) => {
              const selected = level.level === defaultAutonomy
              const agents = passports.filter((p) => (p.autonomy ?? defaultAutonomy) === level.level)
              return (
                <li key={level.level}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!canEdit}
                    onClick={() => setDefaultAutonomy(level.level)}
                    className={cn(
                      "flex w-full items-start gap-4 px-4 py-3 text-left transition-colors enabled:hover:bg-muted/40",
                      selected && "bg-primary/5"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                        selected && "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      L{level.level}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{level.name}</span>
                        {selected ? <Badge>Company default</Badge> : null}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{level.description}</span>
                      {agents.length ? (
                        <span className="mt-2 flex flex-wrap gap-1">
                          {agents.map((agent) => (
                            <Badge key={agent.id} variant="outline" className={cn(agent.status === "Paused" && "opacity-50")}>
                              {agent.agent}
                              {agent.autonomy === null ? " · default" : ""}
                            </Badge>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{level.effect}</span>
                  </button>
                </li>
              )
            })}
          </ol>

          <section className="h-fit rounded-lg border">
            <h2 className="border-b px-4 py-2.5 text-sm font-medium">Policy changes</h2>
            <ol className="max-h-[28rem] divide-y overflow-y-auto">
              {changes.map((change) => (
                <li key={change.id} className="px-4 py-2.5 text-sm">
                  <p>{change.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {getEmployee(change.actorId)?.name ?? "System"} · {relativeTime(change.at)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  )
}
