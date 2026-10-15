"use client"

import Link from "next/link"
import { ArrowUpRight, CalendarDays, FileText, Plane } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { useOrganization } from "@/components/dashboard/organization-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { seedDocuments } from "@/lib/documents"
import { currentUser } from "@/lib/project-types"

export default function MyWorkspacePage() {
  const { me, getDepartment, getEmployee } = useOrganization()
  const person = me ?? {
    id: "emp-ghulam",
    name: currentUser.name,
    email: currentUser.email,
    title: "Founder",
    departmentId: "dep-leadership",
    managerId: "",
    accessRole: "Owner" as const,
    status: "Active" as const,
    since: "2024-01-01",
  }
  const dept = getDepartment(person.departmentId)
  const manager = person.managerId ? getEmployee(person.managerId) : undefined
  const myDocs = seedDocuments.filter(
    (doc) => doc.sharedWith === person.name || doc.sharedWith === "Everyone" || doc.category === "Personal"
  )

  return (
    <>
      <DashboardHeader title="My workspace" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {person.title}
              {dept ? ` · ${dept.name}` : ""} · self-service hub
            </p>
          </div>
          <Badge variant="outline">{person.accessRole}</Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Leave balance", value: "14 days", hint: "Annual remaining (demo)", href: "/dashboard/people-operations/leave" },
            { label: "My documents", value: String(myDocs.length), hint: "In the vault", href: "/dashboard/documents" },
            { label: "Open issues", value: "View", hint: "My work queue", href: "/dashboard/work-management/my-work" },
          ].map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-2xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
            </Link>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <h2 className="font-semibold">Profile</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{person.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">{person.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Manager</dt>
                <dd className="font-medium">{manager?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Since</dt>
                <dd className="font-medium">{person.since}</dd>
              </div>
            </dl>
            <Button size="sm" variant="outline" className="mt-4" render={<Link href={`/dashboard/organization/people/${person.id}`} />}>
              Full profile
              <ArrowUpRight data-icon="inline-end" />
            </Button>
          </section>

          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <h2 className="font-semibold">Quick links</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { href: "/dashboard/people-operations/leave", label: "Request leave", icon: Plane },
                { href: "/dashboard/documents", label: "Open document vault", icon: FileText },
                { href: "/dashboard/work-management/time", label: "Log time this week", icon: CalendarDays },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 rounded-xl border px-3 py-2.5 hover:bg-muted/40"
                  >
                    <item.icon className="size-4 text-muted-foreground" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">My documents</h2>
            <Button size="sm" variant="ghost" render={<Link href="/dashboard/documents" />}>
              All documents
            </Button>
          </div>
          <ul className="mt-3 divide-y">
            {myDocs.slice(0, 5).map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.category} · {doc.sizeLabel}
                  </p>
                </div>
                <Badge variant="outline">{doc.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
