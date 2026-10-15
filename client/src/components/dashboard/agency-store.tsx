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

import { useAuth } from "@/components/auth/auth-provider"
import { useOrganization } from "@/components/dashboard/organization-store"
import { ApiError } from "@/lib/api"
import { seedAgency, type AgencyProfile } from "@/lib/agency"
import { orgApi, organizationToAgency } from "@/lib/auth-api"
import { canManagePeople } from "@/lib/organization"

const STORAGE_KEY = "companyos-agency-v1"

type Result = { ok: true; message?: string } | { ok: false; message: string }

type AgencyValue = {
  agency: AgencyProfile
  canEdit: boolean
  loading: boolean
  saveAgency: (input: AgencyProfile) => Promise<Result>
  uploadLogo: (file: File) => Promise<Result>
  removeLogo: () => Promise<Result>
  resetAgency: () => Promise<Result>
  refreshAgency: () => Promise<void>
}

const AgencyContext = createContext<AgencyValue | null>(null)

function loadLocalAgency(): AgencyProfile {
  if (typeof window === "undefined") return seedAgency
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedAgency
    const parsed = JSON.parse(raw) as Partial<AgencyProfile>
    return { ...seedAgency, ...parsed }
  } catch {
    return seedAgency
  }
}

function persistLocal(next: AgencyProfile) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
}

/** Sync read for places that only need the latest cached profile (sidebar, apply forms). */
export function useAgencyProfile() {
  const ctx = useContext(AgencyContext)
  const [local] = useState(loadLocalAgency)
  return ctx?.agency ?? local
}

export function AgencyProvider({ children }: { children: ReactNode }) {
  const { me } = useOrganization()
  const { isAuthenticated, activeOrgId } = useAuth()
  const [agency, setAgency] = useState<AgencyProfile>(seedAgency)
  const [loading, setLoading] = useState(false)

  const refreshAgency = useCallback(async () => {
    if (!isAuthenticated || !activeOrgId) {
      const local = loadLocalAgency()
      setAgency(local)
      return
    }
    setLoading(true)
    try {
      const org = await orgApi.get(activeOrgId)
      const mapped = organizationToAgency(org)
      setAgency(mapped)
      persistLocal(mapped)
    } catch {
      setAgency(loadLocalAgency())
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, activeOrgId])

  useEffect(() => {
    void refreshAgency()
  }, [refreshAgency])

  const value = useMemo<AgencyValue>(() => {
    const canEdit = canManagePeople(me?.accessRole)

    return {
      agency,
      canEdit,
      loading,
      refreshAgency,
      async saveAgency(input) {
        if (!canEdit) return { ok: false, message: "Only Owners and Admins can edit agency details." }
        const name = input.name.trim()
        if (!name) return { ok: false, message: "Organization name is required." }
        if (input.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail.trim())) {
          return { ok: false, message: "Enter a valid contact email." }
        }

        const next: AgencyProfile = {
          ...input,
          name,
          legalName: input.legalName.trim(),
          tagline: input.tagline.trim(),
          website: input.website.trim(),
          industry: input.industry.trim() || seedAgency.industry,
          companySize: input.companySize.trim() || seedAgency.companySize,
          headquarters: input.headquarters.trim(),
          about: input.about.trim(),
          contactEmail: input.contactEmail.trim().toLowerCase(),
          contactPhone: input.contactPhone.trim(),
          workspaceLabel: input.workspaceLabel.trim() || input.industry.trim() || "Workspace",
          logoDataUrl: input.logoDataUrl,
        }

        if (isAuthenticated && activeOrgId) {
          try {
            const org = await orgApi.update(activeOrgId, {
              name: next.name,
              legal_name: next.legalName,
              tagline: next.tagline,
              website: next.website,
              industry: next.industry,
              company_size: next.companySize,
              headquarters: next.headquarters,
              about: next.about,
              contact_email: next.contactEmail,
              contact_phone: next.contactPhone,
              workspace_label: next.workspaceLabel,
            })
            const mapped = organizationToAgency(org)
            // Keep preview logo if update response somehow omits it mid-upload.
            if (!mapped.logoDataUrl && next.logoDataUrl) mapped.logoDataUrl = next.logoDataUrl
            setAgency(mapped)
            persistLocal(mapped)
            return { ok: true, message: "Agency profile saved." }
          } catch (err) {
            return {
              ok: false,
              message: err instanceof ApiError ? err.detail : "Could not save agency profile.",
            }
          }
        }

        setAgency(next)
        persistLocal(next)
        return { ok: true, message: "Agency profile saved locally (sign in to sync)." }
      },
      async uploadLogo(file) {
        if (!canEdit) return { ok: false, message: "Only Owners and Admins can upload a logo." }
        if (!isAuthenticated) {
          return {
            ok: false,
            message: "You're in offline demo mode. Sign in at /login first (ghulam@acmelabs.io / demo1234).",
          }
        }
        if (!activeOrgId) {
          return {
            ok: false,
            message: "No active organization on your account. Sign in as an owner or create a society.",
          }
        }
        try {
          const result = await orgApi.uploadLogo(activeOrgId, file)
          const mapped = organizationToAgency(result.organization)
          setAgency(mapped)
          persistLocal(mapped)
          return { ok: true, message: "Logo uploaded to Cloudinary." }
        } catch (err) {
          return {
            ok: false,
            message: err instanceof ApiError ? err.detail : "Logo upload failed.",
          }
        }
      },
      async removeLogo() {
        if (!canEdit) return { ok: false, message: "Only Owners and Admins can remove the logo." }
        if (isAuthenticated && activeOrgId) {
          try {
            const org = await orgApi.deleteLogo(activeOrgId)
            const mapped = organizationToAgency(org)
            setAgency(mapped)
            persistLocal(mapped)
            return { ok: true, message: "Logo removed." }
          } catch (err) {
            return {
              ok: false,
              message: err instanceof ApiError ? err.detail : "Could not remove logo.",
            }
          }
        }
        const next = { ...agency, logoDataUrl: "" }
        setAgency(next)
        persistLocal(next)
        return { ok: true, message: "Logo removed locally." }
      },
      async resetAgency() {
        if (!canEdit) return { ok: false, message: "Only Owners and Admins can reset." }
        if (isAuthenticated && activeOrgId) {
          try {
            const org = await orgApi.update(activeOrgId, {
              name: seedAgency.name,
              legal_name: seedAgency.legalName,
              tagline: seedAgency.tagline,
              website: seedAgency.website,
              industry: seedAgency.industry,
              company_size: seedAgency.companySize,
              headquarters: seedAgency.headquarters,
              about: seedAgency.about,
              contact_email: seedAgency.contactEmail,
              contact_phone: seedAgency.contactPhone,
              workspace_label: seedAgency.workspaceLabel,
            })
            const mapped = organizationToAgency(org)
            setAgency(mapped)
            persistLocal(mapped)
            return { ok: true, message: "Reset to default agency profile." }
          } catch (err) {
            return {
              ok: false,
              message: err instanceof ApiError ? err.detail : "Could not reset profile.",
            }
          }
        }
        setAgency(seedAgency)
        persistLocal(seedAgency)
        return { ok: true, message: "Reset to default agency profile." }
      },
    }
  }, [agency, me?.accessRole, loading, isAuthenticated, activeOrgId, refreshAgency])

  return <AgencyContext.Provider value={value}>{children}</AgencyContext.Provider>
}

export function useAgency() {
  const context = useContext(AgencyContext)
  if (!context) throw new Error("useAgency must be used within AgencyProvider")
  return context
}
