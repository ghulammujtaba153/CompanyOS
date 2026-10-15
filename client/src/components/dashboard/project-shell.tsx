"use client"

import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { createContext, useContext, useEffect, type ReactNode } from "react"

import { useAuth } from "@/components/auth/auth-provider"
import { CreateIssueDialog } from "@/components/dashboard/create-issue-dialog"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { DetailPageSkeleton } from "@/components/dashboard/page-skeletons"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  canEditIssues,
  canManageProject,
  type Project,
  type ProjectMember,
} from "@/lib/project-types"
import { projectHref, WORK_ROOT } from "@/lib/work-utils"

type ProjectContextValue = {
  project: Project
  role: ProjectMember["role"]
  /** Owner/Admin/Member: create, edit, assign, move, delete issues. */
  canEdit: boolean
  /** Owner/Admin: members and settings. */
  canManage: boolean
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

function useProjectContext() {
  const value = useContext(ProjectContext)
  if (!value) throw new Error("Project hooks must be used inside ProjectShell")
  return value
}

/** The project resolved by the enclosing [projectId] layout. */
export function useCurrentProject() {
  return useProjectContext().project
}

/** The signed-in user's permissions on the current project. */
export function useProjectAccess() {
  const { role, canEdit, canManage } = useProjectContext()
  return { role, canEdit, canManage }
}

export function ProjectShell({ children }: { children: ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>()
  const pathname = usePathname()
  const { me, loading: authLoading } = useAuth()
  const { getProject, getProjectIssues, getMyRole, loading, ensureProject } = useProjectWorkspace()
  const project = getProject(projectId)
  const sessionEmail = (me?.email || "").toLowerCase()

  useEffect(() => {
    if (!projectId || project || authLoading) return
    void ensureProject(projectId)
  }, [projectId, project, authLoading, ensureProject])

  // Only block when we don't already have this project (stale-while-revalidate).
  if (!project && (authLoading || loading)) {
    return (
      <>
        <DashboardHeader title="Loading…" parent="Projects" />
        <DetailPageSkeleton />
      </>
    )
  }

  if (!project) {
    return (
      <>
        <DashboardHeader title="Not found" parent="Projects" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-medium">This project doesn&apos;t exist or you no longer have access.</p>
          <Button variant="outline" render={<Link href={`${WORK_ROOT}/projects`} />}>
            All projects
          </Button>
        </div>
      </>
    )
  }

  const role = getMyRole(project.id) ?? "Viewer"
  const invited =
    project.members.find((member) => member.email.toLowerCase() === sessionEmail)?.status ===
    "Invited"
  const access = {
    project,
    role,
    canEdit: canEditIssues(role),
    canManage: canManageProject(role),
  }

  const openIssues = getProjectIssues(project.id).filter((issue) => issue.status !== "Done").length
  const tabs = [
    { label: "Board", section: "board" },
    { label: "Issues", section: "issues", count: openIssues },
    { label: "Overview", section: "" },
    { label: "Documents", section: "documents" },
    { label: "Members", section: "members", count: project.members.length },
    { label: "Settings", section: "settings" },
  ]

  return (
    <ProjectContext.Provider value={access}>
      <DashboardHeader title={project.name} parent="Projects" />
      <div className="border-b px-4 pt-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {project.key}
            </Badge>
            <h1 className="truncate text-xl font-semibold tracking-tight">{project.name}</h1>
            {project.status !== "Active" ? <Badge variant="outline">{project.status}</Badge> : null}
            <Badge variant="outline" className="text-muted-foreground">
              {invited ? `Invited · ${role}` : role}
            </Badge>
          </div>
          {access.canEdit ? <CreateIssueDialog projectId={project.id} /> : null}
        </div>
        <nav className="-mb-px mt-3 flex gap-4 overflow-x-auto text-sm">
          {tabs.map((tab) => {
            const href = projectHref(project.id, tab.section)
            const active = tab.section
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname === href
            return (
              <Link
                key={tab.label}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 pb-2.5 whitespace-nowrap transition-colors",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.count !== undefined ? (
                  <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                    {tab.count}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
    </ProjectContext.Provider>
  )
}
