"use client"

import { CreateIssueDialog } from "@/components/dashboard/create-issue-dialog"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { IssueTable } from "@/components/dashboard/issue-table"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"

export default function WorkIssuesPage() {
  const { projects, issues } = useProjectWorkspace()

  return (
    <>
      <DashboardHeader title="Issues" parent="Work Management" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Issues</h1>
          <CreateIssueDialog />
        </div>
        <IssueTable issues={issues} projects={projects} />
      </div>
    </>
  )
}
