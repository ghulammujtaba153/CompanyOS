"use client"

import Link from "next/link"
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  MessagesSquare,
  UsersRound,
} from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { useClients } from "@/components/dashboard/clients-store"
import { useOrganization } from "@/components/dashboard/organization-store"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const areas = [
  {
    title: "Organization",
    description: "People directory, departments, and access.",
    href: "/dashboard/organization/people",
    icon: Building2,
  },
  {
    title: "Clients",
    description: "Accounts, engagements, and pipeline.",
    href: "/dashboard/clients/list",
    icon: BriefcaseBusiness,
  },
  {
    title: "Work Management",
    description: "Projects, issues, and personal work.",
    href: "/dashboard/work-management/my-work",
    icon: ClipboardList,
  },
  {
    title: "Communications",
    description: "Channels and inbox for the team.",
    href: "/dashboard/communications/channels",
    icon: MessagesSquare,
  },
  {
    title: "People Operations",
    description: "Hiring ATS, onboarding, and leave.",
    href: "/dashboard/people-operations/hiring",
    icon: UsersRound,
  },
] as const

export default function DashboardPage() {
  const { employees } = useOrganization()
  const { clients, engagements } = useClients()
  const { projects, issues } = useProjectWorkspace()

  const activePeople = employees.filter((person) => person.status === "Active").length
  const openTickets = issues.filter((ticket) => ticket.status !== "Done").length

  return (
    <>
      <DashboardHeader title="Overview" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good morning</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Jump into organization, clients, work, communications, or people ops.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Active people", value: activePeople },
            { label: "Clients", value: clients.length },
            { label: "Projects", value: projects.length },
            { label: "Open tickets", value: openTickets },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {areas.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="group flex flex-col rounded-2xl border bg-card p-5 transition hover:bg-muted/30"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
                <area.icon className="size-4" />
              </span>
              <p className="mt-4 text-base font-semibold tracking-tight">{area.title}</p>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{area.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground group-hover:text-foreground">
                Open
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl border p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Quick snapshot</p>
              <p className="text-sm text-muted-foreground">
                {engagements.length} client engagements · {projects.length} projects · {openTickets} open
                tickets
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{engagements.length} engagements</Badge>
              <Button size="sm" variant="outline" render={<Link href="/dashboard/people-operations/hiring" />}>
                Hiring ATS
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
