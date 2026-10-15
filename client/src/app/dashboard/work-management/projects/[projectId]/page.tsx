"use client"

import Link from "next/link"

import { PriorityBadge, StatusBadge } from "@/components/dashboard/issue-badges"
import { useCurrentProject } from "@/components/dashboard/project-shell"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "cn"
import { UNASSIGNED } from "@/lib/project-types"
import { formatDate, isOverdue, issueHref, projectHref, projectProgress } from "@/lib/work-utils"

export default function ProjectOverviewPage() {
  const project = useCurrentProject()
  const { getProjectIssues } = useProjectWorkspace()
  const issues = getProjectIssues(project.id)
  const open = issues.filter((issue) => issue.status !== "Done")
  const progress = projectProgress(issues)

  const stats = [
    { label: "Open", value: open.length },
    { label: "In progress", value: open.filter((i) => i.status === "In progress" || i.status === "In review").length },
    { label: "Blocked", value: open.filter((i) => i.status === "Blocked").length, alert: true },
    { label: "Overdue", value: open.filter(isOverdue).length, alert: true },
    { label: "Unassigned", value: open.filter((i) => i.assignee === UNASSIGNED).length },
  ]

  const workload = Object.entries(
    open.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.assignee] = (acc[issue.assignee] ?? 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])

  const attention = open
    .filter((issue) => issue.status === "Blocked" || isOverdue(issue) || issue.priority === "Critical")
    .slice(0, 6)

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <p className="max-w-3xl text-sm text-muted-foreground">{project.description}</p>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-card p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p
                  className={cn(
                    "mt-1 text-2xl font-semibold tabular-nums",
                    stat.alert && stat.value > 0 && "text-destructive"
                  )}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
        <Card size="sm">
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Completion</span>
              <span className="font-semibold tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} />
            <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Due</dt>
              <dd className="text-right">{formatDate(project.due)}</dd>
              <dt className="text-muted-foreground">Team</dt>
              <dd className="text-right">{project.team}</dd>
              <dt className="text-muted-foreground">Visibility</dt>
              <dd className="text-right">{project.visibility}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Needs attention</CardTitle>
            <Button size="sm" variant="ghost" render={<Link href={projectHref(project.id, "issues")} />}>
              All issues
            </Button>
          </CardHeader>
          <CardContent>
            {attention.length ? (
              <ul className="divide-y">
                {attention.map((issue) => (
                  <li key={issue.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{issue.id}</span>
                    <Link href={issueHref(issue)} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {issue.title}
                    </Link>
                    <PriorityBadge priority={issue.priority} />
                    <StatusBadge status={issue.status} />
                    <span
                      className={cn(
                        "hidden w-16 text-right text-xs sm:block",
                        isOverdue(issue) ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {formatDate(issue.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing blocked, overdue, or critical.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open work by assignee</CardTitle>
          </CardHeader>
          <CardContent>
            {workload.length ? (
              <ul className="space-y-2 text-sm">
                {workload.map(([name, count]) => (
                  <li key={name} className="flex items-center justify-between">
                    <span className={cn(name === UNASSIGNED && "text-muted-foreground")}>{name}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No open issues.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
