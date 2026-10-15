"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Eye, Lock } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useOrganization } from "@/components/dashboard/organization-store"
import { Button } from "@/components/ui/button"

/** Blocks direct URL access to sections the user's department can't open. */
export function AccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const {
    canAccess,
    me,
    getDepartment,
    previewDepartmentId,
    setPreviewDepartmentId,
    loading,
  } = useOrganization()
  const preview = previewDepartmentId ? getDepartment(previewDepartmentId) : undefined

  if (loading) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DashboardHeader title="Loading" />
        <PageLoadingState label="Loading workspace…" variant="detail" />
      </div>
    )
  }

  const banner = preview ? (
    <div className="flex items-center justify-between gap-3 border-b bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <span className="flex items-center gap-2">
        <Eye className="size-4" />
        Previewing the sidebar as <strong>{preview.name}</strong>
      </span>
      <Button size="sm" variant="outline" className="bg-background" onClick={() => setPreviewDepartmentId(null)}>
        Exit preview
      </Button>
    </div>
  ) : null

  if (canAccess(pathname)) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {banner}
        {children}
      </div>
    )
  }

  return (
    <>
      {banner}
      <DashboardHeader title="No access" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Lock className="size-6 text-muted-foreground" />
        <p className="font-medium">You don&apos;t have access to this section.</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {preview
            ? `${preview.name} isn't granted this area.`
            : me
              ? `${getDepartment(me.departmentId)?.name ?? "Your department"} isn't granted this area.`
              : ""}{" "}
          Ask an Owner or Admin to update department access.
        </p>
        <Button variant="outline" render={<Link href="/dashboard" />}>
          Back to overview
        </Button>
      </div>
    </>
  )
}
