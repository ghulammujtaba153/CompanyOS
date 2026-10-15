"use client"

import { useEffect, useMemo, useState } from "react"

import { AdminHeader } from "@/components/admin/admin-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { adminApi, type AdminUserRow } from "@/lib/auth-api"
import { useClientPagination } from "@/lib/use-client-pagination"

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void adminApi
      .users()
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load users.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((user) =>
      `${user.full_name} ${user.email} ${user.account_type}`.toLowerCase().includes(q)
    )
  }, [rows, query])

  const pagination = useClientPagination(filtered, {
    pageSize: 10,
    resetKey: `${query}|${filtered.length}`,
  })

  if (loading) {
    return (
      <>
        <AdminHeader title="Users" />
        <PageLoadingState label="Loading users…" variant="list" />
      </>
    )
  }

  return (
    <>
      <AdminHeader title="Users" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">All users</h1>
            <p className="text-sm text-muted-foreground">{rows.length} accounts across the platform.</p>
          </div>
          <Input
            className="w-full max-w-xs"
            placeholder="Search users…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Organizations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pageItems.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.account_type === "platform_admin" ? "default" : "secondary"}>
                      {user.account_type}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.is_active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    {user.organizations.length
                      ? user.organizations
                          .map((org) => `${org.organization_name} (${org.role})`)
                          .join(", ")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!pagination.pageItems.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No users found.
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
