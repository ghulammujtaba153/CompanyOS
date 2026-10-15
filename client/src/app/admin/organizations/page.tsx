"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { AdminHeader } from "@/components/admin/admin-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
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
import { adminApi, type AdminOrgRow } from "@/lib/auth-api"
import { useClientPagination } from "@/lib/use-client-pagination"
import { formatDate } from "@/lib/work-utils"

export default function AdminOrganizationsPage() {
  const [rows, setRows] = useState<AdminOrgRow[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const pagination = useClientPagination(rows, { pageSize: 10, resetKey: rows.length })

  useEffect(() => {
    let cancelled = false
    void adminApi
      .organizations()
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load organizations.")
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
        <AdminHeader title="Organizations" />
        <PageLoadingState label="Loading organizations…" variant="list" />
      </>
    )
  }

  return (
    <>
      <AdminHeader title="Organizations" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">All societies</h1>
          <p className="text-sm text-muted-foreground">{rows.length} organizations on the platform.</p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pageItems.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{org.plan_id || "—"}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{org.member_count}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {org.created_at ? formatDate(org.created_at.slice(0, 10)) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" render={<Link href={`/admin/organizations/${org.id}`} />}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!pagination.pageItems.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No organizations yet.
                  </TableCell>
                </TableRow>
              ) : null}
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
        </div>
      </div>
    </>
  )
}
