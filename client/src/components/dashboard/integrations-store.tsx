"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import { useGovernance } from "@/components/dashboard/governance-store"
import { useOrganization } from "@/components/dashboard/organization-store"
import type { Passport } from "@/lib/governance"
import { seedIntegrations, type Integration } from "@/lib/integrations"
import { canManagePeople } from "@/lib/organization"

type Result = { ok: true; message: string } | { ok: false; message: string }

type IntegrationsValue = {
  integrations: Integration[]
  canManage: boolean
  /** Active agents whose passports use actions this integration powers. */
  agentsUsing: (integration: Integration, scopeIds?: string[]) => Passport[]
  connect: (id: string, scopeIds: string[]) => Result
  updateScopes: (id: string, scopeIds: string[]) => Result
  syncNow: (id: string) => Result
  reauthorize: (id: string) => Result
  disconnect: (id: string) => Result
}

const IntegrationsContext = createContext<IntegrationsValue | null>(null)

export function IntegrationsProvider({ children }: { children: ReactNode }) {
  const { me } = useOrganization()
  const { passports } = useGovernance()
  const [integrations, setIntegrations] = useState(seedIntegrations)

  const value = useMemo<IntegrationsValue>(() => {
    const canManage = canManagePeople(me?.accessRole)
    const now = () => new Date().toISOString()
    const find = (id: string) => integrations.find((item) => item.id === id)
    const update = (id: string, fn: (item: Integration) => Integration) =>
      setIntegrations((current) => current.map((item) => (item.id === id ? fn(item) : item)))
    const denied = { ok: false as const, message: "Only Owners and Admins can manage integrations." }

    function agentsUsing(integration: Integration, scopeIds = integration.grantedScopeIds) {
      const capabilities = integration.scopes
        .filter((scope) => scopeIds.includes(scope.id))
        .flatMap((scope) => scope.capabilityIds)
      return passports.filter(
        (passport) => passport.status === "Active" && passport.capabilityIds.some((id) => capabilities.includes(id))
      )
    }

    return {
      integrations,
      canManage,
      agentsUsing,

      connect(id, scopeIds) {
        if (!canManage) return denied
        const integration = find(id)
        if (!integration) return { ok: false, message: "Integration not found." }
        if (!scopeIds.length) return { ok: false, message: "Grant at least one permission." }
        const at = now()
        update(id, (item) => ({
          ...item,
          status: "Connected",
          grantedScopeIds: scopeIds,
          connectedBy: me?.id,
          lastSyncAt: at,
          error: undefined,
          log: [{ at, ok: true, message: "Connected and completed initial sync" }, ...item.log],
        }))
        return { ok: true, message: `${integration.name} connected.` }
      },

      updateScopes(id, scopeIds) {
        if (!canManage) return denied
        const integration = find(id)
        if (!integration) return { ok: false, message: "Integration not found." }
        if (!scopeIds.length) return { ok: false, message: "Keep at least one permission, or disconnect instead." }
        const removed = integration.grantedScopeIds.filter((scope) => !scopeIds.includes(scope))
        update(id, (item) => ({
          ...item,
          grantedScopeIds: scopeIds,
          log: [
            {
              at: now(),
              ok: true,
              message: removed.length ? `Permissions reduced (${removed.length} revoked)` : "Permissions updated",
            },
            ...item.log,
          ],
        }))
        return { ok: true, message: "Permissions updated." }
      },

      syncNow(id) {
        const integration = find(id)
        if (!integration || integration.status === "Available") return { ok: false, message: "Not connected." }
        if (integration.status === "Error") {
          // A failing connection can't sync until it is re-authorized.
          update(id, (item) => ({
            ...item,
            log: [{ at: now(), ok: false, message: item.error ?? "Sync failed" }, ...item.log],
          }))
          return { ok: false, message: `${integration.name}: ${integration.error ?? "sync failed"}` }
        }
        const at = now()
        update(id, (item) => ({ ...item, lastSyncAt: at, log: [{ at, ok: true, message: "Manual sync completed" }, ...item.log] }))
        return { ok: true, message: `${integration.name} synced.` }
      },

      reauthorize(id) {
        if (!canManage) return denied
        const integration = find(id)
        if (!integration) return { ok: false, message: "Integration not found." }
        const at = now()
        update(id, (item) => ({
          ...item,
          status: "Connected",
          error: undefined,
          lastSyncAt: at,
          log: [{ at, ok: true, message: "Re-authorized and synced" }, ...item.log],
        }))
        return { ok: true, message: `${integration.name} re-authorized.` }
      },

      disconnect(id) {
        if (!canManage) return denied
        const integration = find(id)
        if (!integration) return { ok: false, message: "Integration not found." }
        update(id, (item) => ({
          ...item,
          status: "Available",
          grantedScopeIds: [],
          connectedBy: undefined,
          lastSyncAt: undefined,
          error: undefined,
          log: [{ at: now(), ok: true, message: "Disconnected; tokens revoked" }, ...item.log],
        }))
        return { ok: true, message: `${integration.name} disconnected.` }
      },
    }
  }, [me, passports, integrations])

  return <IntegrationsContext.Provider value={value}>{children}</IntegrationsContext.Provider>
}

export function useIntegrations() {
  const context = useContext(IntegrationsContext)
  if (!context) throw new Error("useIntegrations must be used within IntegrationsProvider")
  return context
}

