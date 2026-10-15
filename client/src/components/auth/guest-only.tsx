"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { useAuth } from "@/components/auth/auth-provider"
import { AuthPageSkeleton } from "@/components/dashboard/page-skeletons"
import { homePathForMe } from "@/lib/home-path"

/** If already signed in, skip login/register and go to the app. */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, me } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (loading || !isAuthenticated) return
    const next = searchParams.get("next")
    const home = homePathForMe(me)
    router.replace(next?.startsWith("/") && next !== "/dashboard" ? next : home)
  }, [loading, isAuthenticated, me, router, searchParams])

  if (loading || isAuthenticated) {
    return <AuthPageSkeleton />
  }

  return <>{children}</>
}
