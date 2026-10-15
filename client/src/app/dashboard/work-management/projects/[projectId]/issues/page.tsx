"use client"

import { IssueTable } from "@/components/dashboard/issue-table"
import { useCurrentProject } from "@/components/dashboard/project-shell"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"

export default function ProjectIssuesPage() {
  const project = useCurrentProject()
  const { getProjectIssues } = useProjectWorkspace()

  return <IssueTable issues={getProjectIssues(project.id)} />
}
