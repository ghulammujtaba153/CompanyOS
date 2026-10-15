"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { AdminHeader } from "@/components/admin/admin-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
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
import { orgApi, type Member, type Organization } from "@/lib/auth-api"

export default function AdminOrganizationDetailPage() {
  const params = useParams<{ orgId: string }>()
  const orgId = params.orgId
  const [org, setOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void Promise.all([orgApi.get(orgId), orgApi.members(orgId)])
      .then(([organization, memberRows]) => {
        if (cancelled) return
        setOrg(organization)
        setMembers(memberRows)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load organization.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  if (loading) {
    return (
      <>
        <AdminHeader title="Organization" parent="Organizations" />
        <PageLoadingState label="Loading organization…" variant="detail" />
      </>
    )
  }

  return (
    <>
      <AdminHeader title={org?.name || "Organization"} parent="Organizations" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button size="sm" variant="ghost" render={<Link href="/admin/organizations" />}>
              <ArrowLeft data-icon="inline-start" />
              All organizations
            </Button>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">{org?.name ?? "Organization"}</h1>
            <p className="text-sm text-muted-foreground">
              {org?.slug} · {members.length} members
            </p>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Title</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{member.role}</Badge>
                  </TableCell>
                  <TableCell>{member.status}</TableCell>
                  <TableCell className="text-muted-foreground">{member.title || "—"}</TableCell>
                </TableRow>
              ))}
              {!members.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No members in this organization.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
