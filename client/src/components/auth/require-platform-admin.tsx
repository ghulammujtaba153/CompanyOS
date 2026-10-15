"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardBootSkeleton } from "@/components/dashboard/page-skeletons"
import { homePathForMe } from "@/lib/home-path"

/** Only platform admins may view /admin routes. */
export function RequirePlatformAdmin({ children }: { children: React.ReactNode }) {
  const { me, loading, isAuthenticated } = useAuth()
  const router = useRouter()
  const isAdmin =
    me?.primary_role === "platform_admin" || me?.account_type === "platform_admin"

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent("/admin")}`)
      return
    }
    if (!isAdmin) {
      router.replace(homePathForMe(me))
    }
  }, [loading, isAuthenticated, isAdmin, me, router])

  if (loading || !isAuthenticated || !isAdmin) {
    return <DashboardBootSkeleton />
  }

  return <>{children}</>
}
