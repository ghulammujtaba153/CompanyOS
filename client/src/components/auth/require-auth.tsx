"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardBootSkeleton } from "@/components/dashboard/page-skeletons"

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated) {
      const next = pathname && pathname.startsWith("/") ? pathname : "/dashboard"
      router.replace(`/login?next=${encodeURIComponent(next)}`)
    }
  }, [loading, isAuthenticated, router, pathname])

  if (loading) {
    return <DashboardBootSkeleton />
  }

  if (!isAuthenticated) {
    return <DashboardBootSkeleton />
  }

  return <>{children}</>
}
