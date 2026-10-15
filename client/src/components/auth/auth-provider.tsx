"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { getAccessToken, setAccessToken } from "@/lib/api"
import { authApi, type Me, type PrimaryRole } from "@/lib/auth-api"

type AuthValue = {
  me: Me | null
  loading: boolean
  primaryRole: PrimaryRole | null
  activeOrgId: string | null
  setActiveOrgId: (id: string | null) => void
  /** Apply profile from login/register without an extra /me request. */
  applySession: (profile: Me) => void
  refresh: () => Promise<Me | null>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthValue | null>(null)
const ORG_KEY = "companyos_active_org"

function pickActiveOrg(profile: Me): string | null {
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(ORG_KEY) : null
  const membershipIds = profile.memberships.map((m) => m.organization_id)
  if (stored && membershipIds.includes(stored)) return stored
  return membershipIds[0] ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null)

  const setActiveOrgId = useCallback((id: string | null) => {
    setActiveOrgIdState(id)
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(ORG_KEY, id)
      else window.localStorage.removeItem(ORG_KEY)
    }
  }, [])

  const applySession = useCallback(
    (profile: Me) => {
      setMe(profile)
      setActiveOrgId(pickActiveOrg(profile))
      setLoading(false)
    },
    [setActiveOrgId]
  )

  const refresh = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      setMe(null)
      setActiveOrgIdState(null)
      setLoading(false)
      return null
    }
    try {
      const profile = await authApi.me()
      setMe(profile)
      setActiveOrgId(pickActiveOrg(profile))
      return profile
    } catch {
      setAccessToken(null)
      setMe(null)
      setActiveOrgIdState(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [setActiveOrgId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const logout = useCallback(() => {
    authApi.logout()
    setMe(null)
    setActiveOrgId(null)
  }, [setActiveOrgId])

  const value = useMemo<AuthValue>(
    () => ({
      me,
      loading,
      primaryRole: me?.primary_role ?? null,
      activeOrgId,
      setActiveOrgId,
      applySession,
      refresh,
      logout,
      isAuthenticated: Boolean(me),
    }),
    [me, loading, activeOrgId, setActiveOrgId, applySession, refresh, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
