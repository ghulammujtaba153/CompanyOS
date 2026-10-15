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
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { ApiError } from "@/lib/api"
import {
  clientsApi,
  type ApiClient,
  type ApiContract,
  type ApiEngagement,
} from "@/lib/auth-api"
import {
  defaultPhases,
  seedClients,
  seedEngagements,
  suggestProjectKey,
  type Client,
  type ClientEngagement,
  type ClientFile,
  type ClientStatus,
  type EngagementPhase,
  type EngagementStatus,
} from "@/lib/clients"
import {
  seedContracts,
  type ClientContract,
  type ContractModel,
  type ContractStatus,
} from "@/lib/contracts"
import { canManagePeople } from "@/lib/organization"

type Result = { ok: true; message?: string; id?: string } | { ok: false; message: string }

type ClientInput = Omit<Client, "id" | "createdAt" | "ownerId"> & { ownerId?: string }

type EngagementInput = {
  clientId: string
  title: string
  description: string
  price: number
  status?: EngagementStatus
  startDate: string
  dueDate: string
  ownerId?: string
}

type ContractInput = {
  clientId: string
  engagementId: string
  title: string
  model: ContractModel
  value: number
  currency?: string
  startDate: string
  renewalDate: string
  status: ContractStatus
  notes: string
}

type ClientsValue = {
  canManage: boolean
  loading: boolean
  clients: Client[]
  engagements: ClientEngagement[]
  contracts: ClientContract[]
  getClient: (id: string) => Client | undefined
  getEngagement: (id: string) => ClientEngagement | undefined
  getContract: (id: string) => ClientContract | undefined
  engagementsForClient: (clientId: string) => ClientEngagement[]
  contractsForEngagement: (engagementId: string) => ClientContract[]
  activePipeline: () => ClientEngagement[]
  saveClient: (input: ClientInput & { id?: string }) => Promise<Result>
  removeClient: (id: string) => Promise<Result>
  saveEngagement: (input: EngagementInput & { id?: string }) => Promise<Result>
  updateEngagementStatus: (id: string, status: EngagementStatus) => Promise<Result>
  saveContract: (input: ContractInput & { id?: string }) => Promise<Result>
  removeContract: (id: string) => Promise<Result>
  addFile: (
    engagementId: string,
    input: Omit<ClientFile, "id" | "uploadedAt">
  ) => Promise<Result>
  removeFile: (engagementId: string, fileId: string) => Promise<Result>
  addPhase: (
    engagementId: string,
    input: Omit<EngagementPhase, "id">
  ) => Promise<Result>
  updatePhase: (
    engagementId: string,
    phaseId: string,
    input: Partial<Omit<EngagementPhase, "id">>
  ) => Promise<Result>
  removePhase: (engagementId: string, phaseId: string) => Promise<Result>
  promoteToWorkManagement: (engagementId: string, projectKey?: string) => Promise<
    Result & { projectId?: string }
  >
  refreshClients: () => Promise<void>
}

const ClientsContext = createContext<ClientsValue | null>(null)

function todayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.detail || fallback
  if (err instanceof Error && err.message) return err.message
  return fallback
}

function mapClientStatus(status: string): ClientStatus {
  if (status === "active") return "Active"
  if (status === "paused") return "Paused"
  if (status === "churned") return "Churned"
  if (status === "Active" || status === "Paused" || status === "Churned" || status === "Prospect") {
    return status
  }
  return "Prospect"
}

function toApiClientStatus(status: ClientStatus) {
  return status.toLowerCase()
}

function mapApiClient(row: ApiClient): Client {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    website: row.website,
    industry: row.industry,
    status: mapClientStatus(row.status),
    ownerId: row.internal_owner_member_id ?? "",
    notes: row.notes,
    createdAt: row.created_at.slice(0, 10),
  }
}

function mapApiEngagement(row: ApiEngagement): ClientEngagement {
  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    description: row.description,
    price: Number(row.price) || 0,
    currency: "USD",
    status: (row.status as EngagementStatus) || "Draft",
    startDate: row.start_date || "",
    dueDate: row.due_date || "",
    ownerId: row.owner_member_id ?? "",
    files: (row.files as ClientFile[]) || [],
    phases: (row.phases as EngagementPhase[]) || [],
    workProjectId: row.work_project_id || undefined,
    workProjectKey: row.work_project_key || undefined,
    createdAt: row.created_at.slice(0, 10),
    updatedAt: row.updated_at.slice(0, 10),
  }
}

function mapApiContract(row: ApiContract): ClientContract {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    clientId: row.client_id,
    clientName: row.client_name,
    title: row.title,
    model: (row.model as ContractModel) || "Fixed fee",
    value: Number(row.value) || 0,
    currency: row.currency || "USD",
    startDate: row.start_date || "",
    renewalDate: row.renewal_date || "",
    status: (row.status as ContractStatus) || "Draft",
    notes: row.notes || "",
  }
}

export function ClientsProvider({ children }: { children: ReactNode }) {
  const { me } = useOrganization()
  const { isAuthenticated, activeOrgId } = useAuth()
  const { createProject, createIssue } = useProjectWorkspace()
  const [clients, setClients] = useState<Client[]>([])
  const [engagements, setEngagements] = useState<ClientEngagement[]>([])
  const [contracts, setContracts] = useState<ClientContract[]>([])
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [loading, setLoading] = useState(useApi)

  const refreshClients = useCallback(async () => {
    if (!isAuthenticated || !activeOrgId) return
    setLoading(true)
    try {
      const [clientRows, engagementRows, contractRows] = await Promise.all([
        clientsApi.list(activeOrgId),
        clientsApi.listEngagements(activeOrgId),
        clientsApi.listContracts(activeOrgId),
      ])
      setClients(clientRows.map(mapApiClient))
      setEngagements(engagementRows.map(mapApiEngagement))
      setContracts(contractRows.map(mapApiContract))
    } catch {
      /* keep current */
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, activeOrgId])

  useEffect(() => {
    if (!useApi) {
      setClients(seedClients)
      setEngagements(seedEngagements)
      setContracts(seedContracts)
      return
    }
    void refreshClients()
  }, [useApi, refreshClients])

  const value = useMemo<ClientsValue>(() => {
    const canManage = canManagePeople(me?.accessRole)
    const denied = {
      ok: false as const,
      message: "Only Owners and Admins can manage clients and engagements.",
    }

    const getClient = (id: string) => clients.find((item) => item.id === id)
    const getEngagement = (id: string) => engagements.find((item) => item.id === id)
    const getContract = (id: string) => contracts.find((item) => item.id === id)
    const engagementsForClient = (clientId: string) =>
      engagements
        .filter((item) => item.clientId === clientId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const contractsForEngagement = (engagementId: string) =>
      contracts.filter((item) => item.engagementId === engagementId)
    const activePipeline = () =>
      engagements
        .filter((item) =>
          ["Draft", "Discovery", "In progress", "Ready to promote", "On hold"].includes(
            item.status
          )
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    async function persistEngagement(
      engagementId: string,
      patch: Parameters<typeof clientsApi.updateEngagement>[1]
    ): Promise<Result> {
      if (useApi) {
        try {
          const row = await clientsApi.updateEngagement(engagementId, patch)
          const mapped = mapApiEngagement(row)
          setEngagements((current) =>
            current.map((item) => (item.id === engagementId ? mapped : item))
          )
          return { ok: true, id: engagementId }
        } catch (err) {
          return { ok: false, message: errorMessage(err, "Could not update engagement.") }
        }
      }
      return { ok: true, id: engagementId }
    }

    return {
      canManage,
      loading,
      clients: [...clients].sort((a, b) => a.company.localeCompare(b.company)),
      engagements,
      contracts: [...contracts].sort((a, b) => a.title.localeCompare(b.title)),
      getClient,
      getEngagement,
      getContract,
      engagementsForClient,
      contractsForEngagement,
      activePipeline,
      refreshClients,

      async saveClient(input) {
        if (!canManage) return denied
        const name = input.name.trim()
        const company = input.company.trim()
        const email = input.email.trim().toLowerCase()
        if (!name || !company) return { ok: false, message: "Name and company are required." }
        if (!email.includes("@")) return { ok: false, message: "Enter a valid email." }

        if (useApi && activeOrgId) {
          try {
            if (input.id) {
              const row = await clientsApi.update(input.id, {
                name,
                company,
                email,
                phone: input.phone.trim(),
                website: input.website.trim(),
                industry: input.industry.trim(),
                status: toApiClientStatus(input.status),
                notes: input.notes.trim(),
                internal_owner_member_id: input.ownerId || null,
              })
              const mapped = mapApiClient(row)
              setClients((current) =>
                current.map((item) => (item.id === input.id ? mapped : item))
              )
              return { ok: true, message: "Client updated.", id: mapped.id }
            }
            const row = await clientsApi.create(activeOrgId, {
              name,
              company,
              email,
              phone: input.phone.trim(),
              website: input.website.trim(),
              industry: input.industry.trim(),
              status: toApiClientStatus(input.status),
              notes: input.notes.trim(),
              internal_owner_member_id: input.ownerId || me?.id || null,
            })
            const mapped = mapApiClient(row)
            setClients((current) => [mapped, ...current])
            return { ok: true, message: "Client added.", id: mapped.id }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not save client.") }
          }
        }

        if (input.id) {
          setClients((current) =>
            current.map((item) =>
              item.id === input.id
                ? {
                    ...item,
                    name,
                    company,
                    email,
                    phone: input.phone.trim(),
                    website: input.website.trim(),
                    industry: input.industry.trim(),
                    status: input.status,
                    notes: input.notes.trim(),
                    ownerId: input.ownerId || item.ownerId,
                  }
                : item
            )
          )
          return { ok: true, message: "Client updated.", id: input.id }
        }

        const id = `client-${Date.now()}`
        setClients((current) => [
          {
            id,
            name,
            company,
            email,
            phone: input.phone.trim(),
            website: input.website.trim(),
            industry: input.industry.trim(),
            status: input.status,
            notes: input.notes.trim(),
            ownerId: input.ownerId || me?.id || "emp-ghulam",
            createdAt: todayIso(),
          },
          ...current,
        ])
        return { ok: true, message: "Client added.", id }
      },

      async removeClient(id) {
        if (!canManage) return denied
        if (engagements.some((item) => item.clientId === id && item.status !== "Promoted" && item.status !== "Completed")) {
          return {
            ok: false,
            message: "Close or promote open engagements before removing this client.",
          }
        }
        if (useApi) {
          try {
            await clientsApi.remove(id)
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not remove client.") }
          }
        }
        setClients((current) => current.filter((item) => item.id !== id))
        return { ok: true, message: "Client removed." }
      },

      async saveEngagement(input) {
        if (!canManage) return denied
        if (!getClient(input.clientId)) return { ok: false, message: "Client not found." }
        const title = input.title.trim()
        if (!title) return { ok: false, message: "Engagement title is required." }
        if (Number.isNaN(input.price) || input.price < 0) {
          return { ok: false, message: "Enter a valid price." }
        }

        if (useApi) {
          try {
            if (input.id) {
              const existing = getEngagement(input.id)
              if (!existing) return { ok: false, message: "Engagement not found." }
              if (existing.status === "Promoted") {
                return { ok: false, message: "Promoted engagements can’t be edited here." }
              }
              const row = await clientsApi.updateEngagement(input.id, {
                title,
                description: input.description.trim(),
                price: input.price,
                status: input.status ?? existing.status,
                start_date: input.startDate,
                due_date: input.dueDate,
                owner_member_id: input.ownerId || null,
              })
              const mapped = mapApiEngagement(row)
              setEngagements((current) =>
                current.map((item) => (item.id === input.id ? mapped : item))
              )
              return { ok: true, message: "Engagement updated.", id: mapped.id }
            }
            const row = await clientsApi.createEngagement(input.clientId, {
              title,
              description: input.description.trim(),
              price: input.price,
              status: input.status ?? "Draft",
              start_date: input.startDate || todayIso(),
              due_date: input.dueDate,
              owner_member_id: input.ownerId || me?.id || null,
              phases: defaultPhases() as unknown as Array<Record<string, unknown>>,
            })
            const mapped = mapApiEngagement(row)
            setEngagements((current) => [mapped, ...current])
            return { ok: true, message: "Engagement created.", id: mapped.id }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not save engagement.") }
          }
        }

        if (input.id) {
          const existing = getEngagement(input.id)
          if (!existing) return { ok: false, message: "Engagement not found." }
          if (existing.status === "Promoted") {
            return { ok: false, message: "Promoted engagements can’t be edited here." }
          }
          setEngagements((current) =>
            current.map((item) =>
              item.id === input.id
                ? {
                    ...item,
                    title,
                    description: input.description.trim(),
                    price: input.price,
                    status: input.status ?? item.status,
                    startDate: input.startDate,
                    dueDate: input.dueDate,
                    ownerId: input.ownerId || item.ownerId,
                    updatedAt: todayIso(),
                  }
                : item
            )
          )
          return { ok: true, message: "Engagement updated.", id: input.id }
        }

        const id = `eng-${Date.now()}`
        setEngagements((current) => [
          {
            id,
            clientId: input.clientId,
            title,
            description: input.description.trim(),
            price: input.price,
            currency: "USD",
            status: input.status ?? "Draft",
            startDate: input.startDate || todayIso(),
            dueDate: input.dueDate,
            ownerId: input.ownerId || me?.id || "emp-ghulam",
            files: [],
            phases: defaultPhases(),
            createdAt: todayIso(),
            updatedAt: todayIso(),
          },
          ...current,
        ])
        return { ok: true, message: "Engagement created.", id }
      },

      async updateEngagementStatus(id, status) {
        if (!canManage) return denied
        const engagement = getEngagement(id)
        if (!engagement) return { ok: false, message: "Engagement not found." }
        if (engagement.status === "Promoted" && status !== "Promoted") {
          return { ok: false, message: "Promoted engagements stay linked to Work Management." }
        }
        const result = await persistEngagement(id, { status })
        if (!result.ok) return result
        if (!useApi) {
          setEngagements((current) =>
            current.map((item) =>
              item.id === id ? { ...item, status, updatedAt: todayIso() } : item
            )
          )
        }
        return { ok: true, message: `Status set to ${status}.` }
      },

      async addFile(engagementId, input) {
        if (!canManage) return denied
        const engagement = getEngagement(engagementId)
        if (!engagement) return { ok: false, message: "Engagement not found." }
        if (engagement.status === "Promoted") {
          return { ok: false, message: "Add delivery files in Work Management after promote." }
        }
        const name = input.name.trim()
        if (!name) return { ok: false, message: "File name is required." }
        const file: ClientFile = {
          id: `file-${Date.now()}`,
          name,
          sizeLabel: input.sizeLabel.trim() || "—",
          kind: input.kind,
          sharedBy: input.sharedBy,
          uploadedAt: todayIso(),
          note: input.note.trim(),
        }
        const files = [file, ...engagement.files]
        const result = await persistEngagement(engagementId, {
          files: files as unknown as Array<Record<string, unknown>>,
        })
        if (!result.ok) return result
        if (!useApi) {
          setEngagements((current) =>
            current.map((item) =>
              item.id === engagementId
                ? { ...item, files, updatedAt: todayIso() }
                : item
            )
          )
        }
        return { ok: true, message: "File recorded." }
      },

      async removeFile(engagementId, fileId) {
        if (!canManage) return denied
        const engagement = getEngagement(engagementId)
        if (!engagement) return { ok: false, message: "Engagement not found." }
        const files = engagement.files.filter((file) => file.id !== fileId)
        const result = await persistEngagement(engagementId, {
          files: files as unknown as Array<Record<string, unknown>>,
        })
        if (!result.ok) return result
        if (!useApi) {
          setEngagements((current) =>
            current.map((item) =>
              item.id === engagementId
                ? { ...item, files, updatedAt: todayIso() }
                : item
            )
          )
        }
        return { ok: true, message: "File removed." }
      },

      async addPhase(engagementId, input) {
        if (!canManage) return denied
        const engagement = getEngagement(engagementId)
        if (!engagement) return { ok: false, message: "Engagement not found." }
        const name = input.name.trim()
        if (!name) return { ok: false, message: "Phase name is required." }
        const phase: EngagementPhase = {
          id: `phase-${Date.now()}`,
          name,
          status: input.status,
          dueDate: input.dueDate,
          notes: input.notes.trim(),
        }
        const phases = [...engagement.phases, phase]
        const result = await persistEngagement(engagementId, {
          phases: phases as unknown as Array<Record<string, unknown>>,
        })
        if (!result.ok) return result
        if (!useApi) {
          setEngagements((current) =>
            current.map((item) =>
              item.id === engagementId
                ? { ...item, phases, updatedAt: todayIso() }
                : item
            )
          )
        }
        return { ok: true, message: "Phase added." }
      },

      async updatePhase(engagementId, phaseId, input) {
        if (!canManage) return denied
        const engagement = getEngagement(engagementId)
        if (!engagement) return { ok: false, message: "Engagement not found." }
        const phases = engagement.phases.map((phase) =>
          phase.id === phaseId
            ? {
                ...phase,
                ...input,
                name: input.name?.trim() || phase.name,
                notes: input.notes?.trim() ?? phase.notes,
              }
            : phase
        )
        const result = await persistEngagement(engagementId, {
          phases: phases as unknown as Array<Record<string, unknown>>,
        })
        if (!result.ok) return result
        if (!useApi) {
          setEngagements((current) =>
            current.map((item) =>
              item.id === engagementId
                ? { ...item, phases, updatedAt: todayIso() }
                : item
            )
          )
        }
        return { ok: true, message: "Phase updated." }
      },

      async removePhase(engagementId, phaseId) {
        if (!canManage) return denied
        const engagement = getEngagement(engagementId)
        if (!engagement) return { ok: false, message: "Engagement not found." }
        const phases = engagement.phases.filter((phase) => phase.id !== phaseId)
        const result = await persistEngagement(engagementId, {
          phases: phases as unknown as Array<Record<string, unknown>>,
        })
        if (!result.ok) return result
        if (!useApi) {
          setEngagements((current) =>
            current.map((item) =>
              item.id === engagementId
                ? { ...item, phases, updatedAt: todayIso() }
                : item
            )
          )
        }
        return { ok: true, message: "Phase removed." }
      },

      async saveContract(input) {
        if (!canManage) return denied
        const title = input.title.trim()
        if (!title) return { ok: false, message: "Contract title is required." }
        if (!getClient(input.clientId)) return { ok: false, message: "Client not found." }
        const engagement = getEngagement(input.engagementId)
        if (!engagement) return { ok: false, message: "Engagement not found." }
        if (engagement.clientId !== input.clientId) {
          return { ok: false, message: "Engagement does not belong to this client." }
        }
        if (Number.isNaN(input.value) || input.value < 0) {
          return { ok: false, message: "Enter a valid contract value." }
        }

        const clientName = getClient(input.clientId)?.company ?? ""

        if (useApi && activeOrgId) {
          try {
            if (input.id) {
              const row = await clientsApi.updateContract(input.id, {
                title,
                model: input.model,
                value: input.value,
                currency: input.currency || "USD",
                start_date: input.startDate,
                renewal_date: input.renewalDate,
                status: input.status,
                notes: input.notes.trim(),
                client_id: input.clientId,
                engagement_id: input.engagementId,
              })
              const mapped = mapApiContract(row)
              setContracts((current) =>
                current.map((item) => (item.id === input.id ? mapped : item))
              )
              return { ok: true, message: "Contract updated.", id: mapped.id }
            }
            const row = await clientsApi.createContract(activeOrgId, {
              client_id: input.clientId,
              engagement_id: input.engagementId,
              title,
              model: input.model,
              value: input.value,
              currency: input.currency || "USD",
              start_date: input.startDate,
              renewal_date: input.renewalDate,
              status: input.status,
              notes: input.notes.trim(),
            })
            const mapped = mapApiContract(row)
            setContracts((current) => [mapped, ...current])
            return { ok: true, message: "Contract added.", id: mapped.id }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not save contract.") }
          }
        }

        if (input.id) {
          setContracts((current) =>
            current.map((item) =>
              item.id === input.id
                ? {
                    ...item,
                    ...input,
                    title,
                    notes: input.notes.trim(),
                    clientName,
                    currency: input.currency || "USD",
                  }
                : item
            )
          )
          return { ok: true, message: "Contract updated.", id: input.id }
        }

        const id = `ctr-${Date.now()}`
        setContracts((current) => [
          {
            id,
            clientId: input.clientId,
            engagementId: input.engagementId,
            clientName,
            title,
            model: input.model,
            value: input.value,
            currency: input.currency || "USD",
            startDate: input.startDate,
            renewalDate: input.renewalDate,
            status: input.status,
            notes: input.notes.trim(),
          },
          ...current,
        ])
        return { ok: true, message: "Contract added.", id }
      },

      async removeContract(id) {
        if (!canManage) return denied
        if (useApi) {
          try {
            await clientsApi.removeContract(id)
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not remove contract.") }
          }
        }
        setContracts((current) => current.filter((item) => item.id !== id))
        return { ok: true, message: "Contract removed." }
      },

      async promoteToWorkManagement(engagementId, projectKey) {
        if (!canManage) return denied
        const engagement = getEngagement(engagementId)
        if (!engagement) return { ok: false, message: "Engagement not found." }
        if (engagement.status === "Promoted" && engagement.workProjectId) {
          return {
            ok: false,
            message: "Already promoted.",
            projectId: engagement.workProjectId,
          }
        }
        const client = getClient(engagement.clientId)
        if (!client) return { ok: false, message: "Client not found." }

        const key = (projectKey || suggestProjectKey(engagement.title || client.company))
          .trim()
          .toUpperCase()
          .slice(0, 5)

        const created = await createProject({
          name: engagement.title,
          key,
          team: client.company,
          description: [
            engagement.description,
            "",
            `Client: ${client.company} (${client.name})`,
            `Engagement value: $${engagement.price.toLocaleString()}`,
            `Promoted from Clients pipeline (${engagement.id}).`,
          ]
            .filter(Boolean)
            .join("\n"),
          due: engagement.dueDate,
          visibility: "Private",
          clientId: client.id,
          clientEngagementId: engagement.id,
        })

        if (!created.ok) return { ok: false, message: created.message }

        const project = created.project

        await createIssue(project.id, {
          title: `Kickoff: ${engagement.title}`,
          description: `Delivery kickoff for ${client.company}. Review client files and confirmed phases before assigning the team.`,
          priority: "High",
          type: "Story",
          status: "To do",
          labels: ["client", "kickoff"],
        })

        for (const phase of engagement.phases) {
          if (phase.status === "Done") continue
          await createIssue(project.id, {
            title: phase.name,
            description: [
              phase.notes,
              phase.dueDate ? `Phase due: ${phase.dueDate}` : "",
              `Source engagement phase (${phase.id}).`,
            ]
              .filter(Boolean)
              .join("\n"),
            priority: phase.status === "Blocked" ? "Critical" : "Medium",
            type: "Task",
            status: phase.status === "In progress" ? "In progress" : "To do",
            dueDate: phase.dueDate,
            labels: ["client-phase"],
          })
        }

        const result = await persistEngagement(engagementId, {
          status: "Promoted",
          work_project_id: project.id,
          work_project_key: project.key,
        })
        if (!result.ok) return result
        if (!useApi) {
          setEngagements((current) =>
            current.map((item) =>
              item.id === engagementId
                ? {
                    ...item,
                    status: "Promoted",
                    workProjectId: project.id,
                    workProjectKey: project.key,
                    updatedAt: todayIso(),
                  }
                : item
            )
          )
        }

        return {
          ok: true,
          message: `Promoted to Work Management as ${project.key}.`,
          id: engagementId,
          projectId: project.id,
        }
      },
    }
  }, [
    clients,
    engagements,
    contracts,
    me,
    createProject,
    createIssue,
    useApi,
    activeOrgId,
    loading,
    refreshClients,
  ])

  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>
}

export function useClients() {
  const context = useContext(ClientsContext)
  if (!context) throw new Error("useClients must be used within ClientsProvider")
  return context
}
