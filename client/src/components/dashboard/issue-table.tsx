"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Search, X } from "lucide-react"

import { KeyedSelect } from "@/components/dashboard/form-controls"
import { PriorityBadge, StatusBadge } from "@/components/dashboard/issue-badges"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "cn"
import {
  issuePriorities,
  issueStatuses,
  issueTypes,
  type Project,
  type ProjectIssue,
} from "@/lib/project-types"
import { useClientPagination } from "@/lib/use-client-pagination"
import { formatDate, isOverdue, issueHref } from "@/lib/work-utils"

const ALL = "all"
const OPEN = "open"
const OVERDUE = "overdue"

const sortOptions = {
  priority: "Priority",
  due: "Due date",
  updated: "Last updated",
} as const

type SortKey = keyof typeof sortOptions

function compare(a: ProjectIssue, b: ProjectIssue, sort: SortKey) {
  if (sort === "priority") {
    return issuePriorities.indexOf(a.priority) - issuePriorities.indexOf(b.priority)
  }
  if (sort === "due") {
    // Unscheduled issues sink to the bottom.
    return (a.dueDate || "9999").localeCompare(b.dueDate || "9999")
  }
  return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
}

export function IssueTable({
  issues,
  projects,
  emptyMessage = "No issues match these filters.",
}: {
  issues: ProjectIssue[]
  /** Pass to show the Project column and filter (cross-project views). */
  projects?: Project[]
  emptyMessage?: string
}) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<string>(OPEN)
  const [priority, setPriority] = useState<string>(ALL)
  const [type, setType] = useState<string>(ALL)
  const [assignee, setAssignee] = useState<string>(ALL)
  const [projectId, setProjectId] = useState<string>(ALL)
  const [sort, setSort] = useState<SortKey>("priority")

  const assignees = useMemo(
    () => Array.from(new Set(issues.map((issue) => issue.assignee))).sort(),
    [issues]
  )
  const projectById = useMemo(
    () => new Map((projects ?? []).map((project) => [project.id, project])),
    [projects]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return issues
      .filter((issue) => {
        if (
          q &&
          ![issue.id, issue.title, issue.assignee, ...issue.labels].some((value) =>
            value.toLowerCase().includes(q)
          )
        ) {
          return false
        }
        if (status === OPEN && issue.status === "Done") return false
        if (status === OVERDUE && !isOverdue(issue)) return false
        if (![ALL, OPEN, OVERDUE].includes(status) && issue.status !== status) return false
        if (priority !== ALL && issue.priority !== priority) return false
        if (type !== ALL && issue.type !== type) return false
        if (assignee !== ALL && issue.assignee !== assignee) return false
        if (projectId !== ALL && issue.projectId !== projectId) return false
        return true
      })
      .sort((a, b) => compare(a, b, sort))
  }, [issues, query, status, priority, type, assignee, projectId, sort])

  const pagination = useClientPagination(filtered, {
    pageSize: 10,
    resetKey: `${query}|${status}|${priority}|${type}|${assignee}|${projectId}|${sort}`,
  })

  const isFiltered =
    query !== "" ||
    status !== OPEN ||
    priority !== ALL ||
    type !== ALL ||
    assignee !== ALL ||
    projectId !== ALL

  function reset() {
    setQuery("")
    setStatus(OPEN)
    setPriority(ALL)
    setType(ALL)
    setAssignee(ALL)
    setProjectId(ALL)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search key, title, label…"
            className="pl-8"
          />
        </div>
        <KeyedSelect
          value={status}
          onChange={setStatus}
          options={[
            [OPEN, "Open"],
            [OVERDUE, "Overdue"],
            [ALL, "All statuses"],
            ...issueStatuses.map((item) => [item, item] as const),
          ]}
        />
        {projects ? (
          <KeyedSelect
            value={projectId}
            onChange={setProjectId}
            options={[
              [ALL, "All projects"],
              ...projects.map((project) => [project.id, project.name] as const),
            ]}
          />
        ) : null}
        <KeyedSelect
          value={assignee}
          onChange={setAssignee}
          options={[[ALL, "Any assignee"], ...assignees.map((item) => [item, item] as const)]}
        />
        <KeyedSelect
          value={priority}
          onChange={setPriority}
          options={[[ALL, "Any priority"], ...issuePriorities.map((item) => [item, item] as const)]}
        />
        <KeyedSelect
          value={type}
          onChange={setType}
          options={[[ALL, "Any type"], ...issueTypes.map((item) => [item, item] as const)]}
        />
        {isFiltered ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <X data-icon="inline-start" />
            Reset
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {filtered.length} of {issues.length}
          </span>
          <KeyedSelect
            value={sort}
            onChange={(value) => setSort(value as SortKey)}
            options={Object.entries(sortOptions).map(([key, label]) => [key, `Sort: ${label}`] as const)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        {filtered.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Key</TableHead>
                  <TableHead>Title</TableHead>
                  {projects ? <TableHead>Project</TableHead> : null}
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((issue) => {
                  const overdue = isOverdue(issue)
                  return (
                    <TableRow key={issue.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {issue.id}
                      </TableCell>
                      <TableCell className="max-w-96">
                        <Link href={issueHref(issue)} className="font-medium hover:underline">
                          {issue.title}
                        </Link>
                        {issue.labels.length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {issue.labels.map((label) => (
                              <Badge key={label} variant="secondary" className="h-4 text-[10px]">
                                {label}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </TableCell>
                      {projects ? (
                        <TableCell className="text-muted-foreground">
                          {projectById.get(issue.projectId)?.name ?? "—"}
                        </TableCell>
                      ) : null}
                      <TableCell>{issue.type}</TableCell>
                      <TableCell>
                        <PriorityBadge priority={issue.priority} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={issue.status} />
                      </TableCell>
                      <TableCell
                        className={cn(issue.assignee === "Unassigned" && "text-muted-foreground")}
                      >
                        {issue.assignee}
                      </TableCell>
                      <TableCell
                        className={cn("whitespace-nowrap", overdue && "font-medium text-destructive")}
                      >
                        {formatDate(issue.dueDate)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <TablePagination
              page={pagination.page}
              pageCount={pagination.pageCount}
              total={pagination.total}
              from={pagination.from}
              to={pagination.to}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </>
        ) : (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {issues.length ? emptyMessage : "No issues yet."}
          </p>
        )}
      </div>
    </div>
  )
}
