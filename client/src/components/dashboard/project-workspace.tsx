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
import { ApiError } from "@/lib/api"
import {
  workApi,
  type ApiWorkIssue,
  type ApiWorkProject,
} from "@/lib/auth-api"
import {
  currentUser,
  seedIssues,
  seedProjects,
  type IssueComment,
  type Project,
  type ProjectIssue,
  type ProjectMember,
  UNASSIGNED,
} from "@/lib/project-types"
import { initials, nextIssueId } from "@/lib/work-utils"

type ProjectWorkspaceValue = {
  loading: boolean
  /** Only projects the signed-in user belongs to (any role, active or invited). */
  projects: Project[]
  /** Issues of those projects. */
  issues: ProjectIssue[]
  /** Fetch one project by id when deep-linking / refreshing a project URL. */
  ensureProject: (projectId: string) => Promise<Project | undefined>
  getMyRole: (projectId: string) => ProjectMember["role"] | undefined
  createProject: (input: {
    name: string
    key: string
    team: string
    description: string
    due: string
    visibility: Project["visibility"]
    clientId?: string
    clientEngagementId?: string
  }) => Promise<{ ok: true; project: Project } | { ok: false; message: string }>
  updateProject: (
    projectId: string,
    input: Partial<Pick<Project, "name" | "description" | "due" | "team" | "status" | "visibility">>
  ) => Promise<void>
  inviteMember: (
    projectId: string,
    email: string,
    role?: ProjectMember["role"],
    name?: string
  ) => Promise<{ ok: boolean; message: string }>
  updateMemberRole: (
    projectId: string,
    email: string,
    role: ProjectMember["role"]
  ) => Promise<void>
  removeMember: (projectId: string, email: string) => Promise<void>
  createIssue: (
    projectId: string,
    input: {
      title: string
      description: string
      priority: ProjectIssue["priority"]
      type: ProjectIssue["type"]
      assignee?: string
      labels?: string[]
      estimate?: string
      dueDate?: string
      status?: ProjectIssue["status"]
    }
  ) => Promise<ProjectIssue | null>
  updateIssue: (
    issueId: string,
    input: Partial<
      Pick<
        ProjectIssue,
        | "title"
        | "description"
        | "priority"
        | "status"
        | "type"
        | "assignee"
        | "labels"
        | "estimate"
        | "dueDate"
      >
    >
  ) => Promise<void>
  deleteIssue: (issueId: string) => Promise<void>
  addComment: (issueId: string, body: string) => Promise<void>
  getProject: (projectId: string) => Project | undefined
  getProjectIssues: (projectId: string) => ProjectIssue[]
  getIssue: (issueId: string) => ProjectIssue | undefined
}

const ProjectWorkspaceContext = createContext<ProjectWorkspaceValue | null>(null)

function nowLabel() {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function dateLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatStamp(iso: string) {
  if (!iso) return dateLabel()
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateTime(iso: string) {
  if (!iso) return nowLabel()
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof Error) return err.message || fallback
  return fallback
}

function mapApiProject(row: ApiWorkProject): Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    team: row.team || "",
    description: row.description || "",
    due: row.due || "",
    status: row.status,
    visibility: row.visibility,
    createdAt: formatStamp(row.created_at),
    clientId: row.client_id || undefined,
    clientEngagementId: row.client_engagement_id || undefined,
    members: row.members.map((member) => ({
      email: member.email,
      name: member.name,
      role: member.role,
      status: member.status,
      invitedAt: member.invited_at || undefined,
    })),
  }
}

function mapApiIssue(row: ApiWorkIssue): ProjectIssue {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description || "",
    priority: row.priority,
    status: row.status,
    type: row.type,
    labels: row.labels || [],
    assignee: row.assignee || UNASSIGNED,
    reporter: row.reporter || "",
    estimate: row.estimate || "",
    dueDate: row.due_date || "",
    createdAt: formatDateTime(row.created_at),
    updatedAt: formatDateTime(row.updated_at),
    comments: (row.comments || []).map((comment) => ({
      id: comment.id,
      author: comment.author,
      initials: comment.initials || initials(comment.author),
      body: comment.body,
      createdAt: comment.created_at,
    })),
    activity: (row.activity || []).map((item) => ({
      id: item.id,
      actor: item.actor,
      action: item.action,
      createdAt: item.created_at,
    })),
  }
}

export function ProjectWorkspaceProvider({ children }: { children: ReactNode }) {
  const { me, isAuthenticated, activeOrgId, loading: authLoading } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [issues, setIssues] = useState<ProjectIssue[]>([])
  const [loading, setLoading] = useState(true)
  const useApi = Boolean(isAuthenticated && activeOrgId)

  const sessionUser = useMemo(
    () =>
      me
        ? {
            name: me.full_name || me.email,
            email: me.email.toLowerCase(),
            initials: initials(me.full_name || me.email),
          }
        : {
            name: currentUser.name,
            email: currentUser.email.toLowerCase(),
            initials: currentUser.initials,
          },
    [me]
  )

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !activeOrgId) return
    setLoading(true)
    try {
      // Projects first so project pages can render; issues follow in the background.
      const projectRows = await workApi.listProjects(activeOrgId)
      setProjects(projectRows.map(mapApiProject))
      setLoading(false)
      try {
        const issueRows = await workApi.listIssues(activeOrgId)
        setIssues(issueRows.map(mapApiIssue))
      } catch {
        setIssues([])
      }
    } catch {
      setProjects([])
      setIssues([])
      setLoading(false)
    }
  }, [isAuthenticated, activeOrgId])

  useEffect(() => {
    if (authLoading) return
    if (useApi) {
      void refresh()
      return
    }
    setProjects(seedProjects)
    setIssues(seedIssues)
    setLoading(false)
  }, [authLoading, useApi, refresh])

  const value = useMemo<ProjectWorkspaceValue>(() => {
    const myProjects = projects.filter((project) =>
      project.members.some((member) => member.email.toLowerCase() === sessionUser.email)
    )
    const myProjectIds = new Set(myProjects.map((project) => project.id))
    const myIssues = issues.filter((issue) => myProjectIds.has(issue.projectId))

    return {
      loading,
      projects: myProjects,
      issues: myIssues,
      async ensureProject(projectId) {
        const existing = myProjects.find((project) => project.id === projectId)
        if (existing) return existing
        if (!useApi) return undefined
        try {
          const row = await workApi.getProject(projectId)
          const mapped = mapApiProject(row)
          setProjects((current) =>
            current.some((item) => item.id === mapped.id) ? current : [mapped, ...current]
          )
          return mapped
        } catch {
          return undefined
        }
      },
      getMyRole(projectId) {
        return myProjects
          .find((project) => project.id === projectId)
          ?.members.find((member) => member.email.toLowerCase() === sessionUser.email)?.role
      },
      getProject(projectId) {
        return myProjects.find((project) => project.id === projectId)
      },
      getProjectIssues(projectId) {
        return myIssues.filter((issue) => issue.projectId === projectId)
      },
      getIssue(issueId) {
        return myIssues.find((issue) => issue.id === issueId)
      },

      async createProject(input) {
        const key = input.key.trim().toUpperCase().slice(0, 5)
        if (!/^[A-Z][A-Z0-9]{1,4}$/.test(key)) {
          return { ok: false, message: "Key must be 2–5 letters or digits, starting with a letter." }
        }
        if (projects.some((item) => item.key === key)) {
          return { ok: false, message: `Key ${key} is already used by another project.` }
        }

        if (useApi && activeOrgId) {
          try {
            const row = await workApi.createProject(activeOrgId, {
              name: input.name,
              key,
              team: input.team,
              description: input.description,
              due: input.due,
              visibility: input.visibility,
              client_id: input.clientId,
              client_engagement_id: input.clientEngagementId,
            })
            const project = mapApiProject(row)
            setProjects((current) => [project, ...current])
            return { ok: true, project }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not create project.") }
          }
        }

        const project: Project = {
          id: `proj-${key.toLowerCase()}-${Date.now()}`,
          key,
          name: input.name,
          team: input.team,
          description: input.description,
          due: input.due,
          status: "Active",
          visibility: input.visibility,
          createdAt: dateLabel(),
          clientId: input.clientId,
          clientEngagementId: input.clientEngagementId,
          members: [
            {
              email: sessionUser.email,
              name: sessionUser.name,
              role: "Owner",
              status: "Active",
            },
          ],
        }
        setProjects((current) => [project, ...current])
        return { ok: true, project }
      },

      async updateProject(projectId, input) {
        if (useApi) {
          try {
            const row = await workApi.updateProject(projectId, {
              name: input.name,
              team: input.team,
              description: input.description,
              due: input.due,
              status: input.status,
              visibility: input.visibility,
            })
            const mapped = mapApiProject(row)
            setProjects((current) =>
              current.map((project) => (project.id === projectId ? mapped : project))
            )
            return
          } catch {
            return
          }
        }
        setProjects((current) =>
          current.map((project) =>
            project.id === projectId ? { ...project, ...input } : project
          )
        )
      },

      async inviteMember(projectId, email, role = "Member", name) {
        const normalized = email.trim().toLowerCase()
        if (!normalized.includes("@")) {
          return { ok: false, message: "Select a person from your organization." }
        }
        const project = myProjects.find((item) => item.id === projectId)
        if (!project) return { ok: false, message: "Project not found." }
        if (project.members.some((member) => member.email.toLowerCase() === normalized)) {
          return { ok: false, message: "This person is already on the project." }
        }

        const displayName =
          name?.trim() ||
          normalized
            .split("@")[0]
            .split(/[._-]/)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ")

        if (useApi) {
          try {
            const row = await workApi.inviteMember(projectId, {
              email: normalized,
              role,
              name: displayName,
            })
            const mapped = mapApiProject(row)
            setProjects((current) =>
              current.map((item) => (item.id === projectId ? mapped : item))
            )
            return { ok: true, message: `Added ${displayName} to the project.` }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not add member.") }
          }
        }

        setProjects((current) =>
          current.map((item) =>
            item.id === projectId
              ? {
                  ...item,
                  members: [
                    ...item.members,
                    {
                      email: normalized,
                      name: displayName,
                      role,
                      status: "Active",
                    },
                  ],
                }
              : item
          )
        )
        return { ok: true, message: `Added ${displayName} to the project.` }
      },

      async updateMemberRole(projectId, email, role) {
        if (useApi) {
          try {
            const row = await workApi.updateMemberRole(projectId, email, role)
            const mapped = mapApiProject(row)
            setProjects((current) =>
              current.map((project) => (project.id === projectId ? mapped : project))
            )
          } catch {
            /* ignore */
          }
          return
        }
        setProjects((current) =>
          current.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  members: project.members.map((member) =>
                    member.email === email && member.role !== "Owner"
                      ? { ...member, role }
                      : member
                  ),
                }
              : project
          )
        )
      },

      async removeMember(projectId, email) {
        if (useApi) {
          try {
            const row = await workApi.removeMember(projectId, email)
            const mapped = mapApiProject(row)
            setProjects((current) =>
              current.map((project) => (project.id === projectId ? mapped : project))
            )
          } catch {
            /* ignore */
          }
          return
        }
        setProjects((current) =>
          current.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  members: project.members.filter(
                    (member) => member.email !== email || member.role === "Owner"
                  ),
                }
              : project
          )
        )
      },

      async createIssue(projectId, input) {
        const project = myProjects.find((item) => item.id === projectId)
        if (!project) return null

        if (useApi) {
          try {
            const row = await workApi.createIssue({
              project_id: projectId,
              title: input.title,
              description: input.description,
              priority: input.priority,
              type: input.type,
              status: input.status ?? "To do",
              assignee: input.assignee || UNASSIGNED,
              labels: input.labels ?? [],
              estimate: input.estimate ?? "",
              due_date: input.dueDate ?? "",
            })
            const issue = mapApiIssue(row)
            setIssues((current) => [issue, ...current])
            return issue
          } catch {
            return null
          }
        }

        const stamp = nowLabel()
        const issue: ProjectIssue = {
          id: nextIssueId(project.key, issues),
          projectId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          type: input.type,
          status: input.status ?? "To do",
          labels: input.labels ?? [],
          assignee: input.assignee || UNASSIGNED,
          reporter: sessionUser.name,
          estimate: input.estimate ?? "",
          dueDate: input.dueDate ?? "",
          createdAt: stamp,
          updatedAt: stamp,
          comments: [],
          activity: [
            {
              id: `act-${Date.now()}`,
              actor: sessionUser.name,
              action: "created this issue",
              createdAt: stamp,
            },
          ],
        }
        setIssues((current) => [issue, ...current])
        return issue
      },

      async updateIssue(issueId, input) {
        if (useApi) {
          try {
            const row = await workApi.updateIssue(issueId, {
              title: input.title,
              description: input.description,
              priority: input.priority,
              status: input.status,
              type: input.type,
              assignee: input.assignee,
              labels: input.labels,
              estimate: input.estimate,
              due_date: input.dueDate,
            })
            const mapped = mapApiIssue(row)
            setIssues((current) =>
              current.map((issue) => (issue.id === issueId ? mapped : issue))
            )
          } catch {
            /* ignore */
          }
          return
        }

        setIssues((current) =>
          current.map((issue) => {
            if (issue.id !== issueId) return issue
            const stamp = nowLabel()
            const activity = [...issue.activity]
            if (input.status && input.status !== issue.status) {
              activity.unshift({
                id: `act-${Date.now()}-status`,
                actor: sessionUser.name,
                action: `moved status to ${input.status}`,
                createdAt: stamp,
              })
            }
            if (input.assignee && input.assignee !== issue.assignee) {
              activity.unshift({
                id: `act-${Date.now()}-assignee`,
                actor: sessionUser.name,
                action: `assigned to ${input.assignee}`,
                createdAt: stamp,
              })
            }
            if (input.type && input.type !== issue.type) {
              activity.unshift({
                id: `act-${Date.now()}-type`,
                actor: sessionUser.name,
                action: `changed type to ${input.type}`,
                createdAt: stamp,
              })
            }
            if (input.priority && input.priority !== issue.priority) {
              activity.unshift({
                id: `act-${Date.now()}-priority`,
                actor: sessionUser.name,
                action: `changed priority to ${input.priority}`,
                createdAt: stamp,
              })
            }
            return {
              ...issue,
              ...input,
              updatedAt: stamp,
              activity,
            }
          })
        )
      },

      async deleteIssue(issueId) {
        if (useApi) {
          try {
            await workApi.deleteIssue(issueId)
          } catch {
            return
          }
        }
        setIssues((current) => current.filter((issue) => issue.id !== issueId))
      },

      async addComment(issueId, body) {
        const trimmed = body.trim()
        if (!trimmed) return

        if (useApi) {
          try {
            const row = await workApi.addComment(issueId, trimmed)
            const mapped = mapApiIssue(row)
            setIssues((current) =>
              current.map((issue) => (issue.id === issueId ? mapped : issue))
            )
          } catch {
            /* ignore */
          }
          return
        }

        const stamp = nowLabel()
        const comment: IssueComment = {
          id: `comment-${Date.now()}`,
          author: sessionUser.name,
          initials: sessionUser.initials,
          body: trimmed,
          createdAt: stamp,
        }
        setIssues((current) =>
          current.map((issue) =>
            issue.id === issueId
              ? {
                  ...issue,
                  comments: [...issue.comments, comment],
                  updatedAt: stamp,
                  activity: [
                    {
                      id: `act-${Date.now()}-comment`,
                      actor: sessionUser.name,
                      action: "added a comment",
                      createdAt: stamp,
                    },
                    ...issue.activity,
                  ],
                }
              : issue
          )
        )
      },
    }
  }, [projects, issues, loading, useApi, activeOrgId, sessionUser])

  return (
    <ProjectWorkspaceContext.Provider value={value}>{children}</ProjectWorkspaceContext.Provider>
  )
}

export function useProjectWorkspace() {
  const context = useContext(ProjectWorkspaceContext)
  if (!context) {
    throw new Error("useProjectWorkspace must be used within ProjectWorkspaceProvider")
  }
  return context
}
