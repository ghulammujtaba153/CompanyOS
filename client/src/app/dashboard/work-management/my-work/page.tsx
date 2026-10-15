"use client"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { IssueTable } from "@/components/dashboard/issue-table"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { currentUser } from "@/lib/project-types"

export default function WorkMyWorkPage() {
  const { projects, issues } = useProjectWorkspace()
  const assigned = issues.filter((issue) => issue.assignee === currentUser.name)
  const reported = issues.filter((issue) => issue.reporter === currentUser.name)
  const openCount = (list: typeof issues) => list.filter((issue) => issue.status !== "Done").length

  return (
    <>
      <DashboardHeader title="My work" parent="Work Management" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <h1 className="text-xl font-semibold tracking-tight">My work</h1>
        <Tabs defaultValue="assigned">
          <TabsList variant="line">
            <TabsTrigger value="assigned">Assigned to me ({openCount(assigned)})</TabsTrigger>
            <TabsTrigger value="reported">Reported by me ({openCount(reported)})</TabsTrigger>
          </TabsList>
          <TabsContent value="assigned" className="pt-2">
            <IssueTable issues={assigned} projects={projects} />
          </TabsContent>
          <TabsContent value="reported" className="pt-2">
            <IssueTable issues={reported} projects={projects} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
