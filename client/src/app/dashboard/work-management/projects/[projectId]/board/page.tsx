"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowRight,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react"

import { IssueFormDialog } from "@/components/dashboard/create-issue-dialog"
import { PriorityBadge, StatusBadge } from "@/components/dashboard/issue-badges"
import { useCurrentProject, useProjectAccess } from "@/components/dashboard/project-shell"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "cn"
import {
  toWorkflowState,
  validateStatusChange,
  workflowStates,
  type WorkflowState,
} from "@/lib/issue-transitions"
import { currentUser, issuePriorities, UNASSIGNED, type ProjectIssue } from "@/lib/project-types"
import { formatDate, initials, isOverdue, issueHref } from "@/lib/work-utils"

const ALL = "all"
const MINE = "mine"

export default function ProjectBoardPage() {
  const project = useCurrentProject()
  const { canEdit } = useProjectAccess()
  const { getProjectIssues, updateIssue, deleteIssue } = useProjectWorkspace()
  const issues = getProjectIssues(project.id)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<WorkflowState | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [assigneeFilter, setAssigneeFilter] = useState(ALL)
  const [editing, setEditing] = useState<ProjectIssue | null>(null)
  const [creatingIn, setCreatingIn] = useState<WorkflowState | null>(null)
  const [deleting, setDeleting] = useState<ProjectIssue | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const memberNames = project.members.map((member) => member.name)

  const visible = issues.filter((issue) => {
    const q = query.trim().toLowerCase()
    if (q && !`${issue.id} ${issue.title} ${issue.labels.join(" ")}`.toLowerCase().includes(q)) {
      return false
    }
    if (assigneeFilter === MINE) return issue.assignee === currentUser.name
    if (assigneeFilter !== ALL) return issue.assignee === assigneeFilter
    return true
  })

  function moveIssue(issue: ProjectIssue, target: WorkflowState) {
    if (!canEdit || toWorkflowState(issue.status) === target) return
    const result = validateStatusChange(issue, target)
    if (!result.ok) return setError(result.message)
    setError("")
    void updateIssue(issue.id, { status: target })
  }

  function assign(issue: ProjectIssue, assignee: string) {
    if (assignee !== issue.assignee) void updateIssue(issue.id, { assignee })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter cards…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {[
            [ALL, "Everyone"],
            [MINE, "Only mine"],
            [UNASSIGNED, "Unassigned"],
          ].map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={assigneeFilter === value ? "secondary" : "ghost"}
              onClick={() => setAssigneeFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {!canEdit ? (
          <span className="ml-auto text-xs text-muted-foreground">
            View only — your role can&apos;t change issues.
          </span>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {error}
          <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setError("")}>
            <X />
          </Button>
        </div>
      ) : null}

      <div className="grid flex-1 gap-4 md:grid-cols-3">
        {workflowStates.map((state) => {
          const items = visible
            .filter((issue) => toWorkflowState(issue.status) === state)
            .sort((a, b) => issuePriorities.indexOf(a.priority) - issuePriorities.indexOf(b.priority))
          return (
            <section
              key={state}
              aria-label={state}
              className={cn(
                "flex min-h-[28rem] flex-col rounded-lg bg-muted/40 p-2 transition",
                overColumn === state && "ring-2 ring-primary"
              )}
              onDragOver={(event) => {
                if (!canEdit) return
                event.preventDefault()
                setOverColumn(state)
              }}
              onDragLeave={() => setOverColumn((current) => (current === state ? null : current))}
              onDrop={(event) => {
                event.preventDefault()
                const issueId = event.dataTransfer.getData("text/issue-id") || draggingId
                const issue = issues.find((item) => item.id === issueId)
                setDraggingId(null)
                setOverColumn(null)
                if (issue) moveIssue(issue, state)
              }}
            >
              <div className="flex items-center justify-between px-2 py-1">
                <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {state} <span className="ml-1 tabular-nums">{items.length}</span>
                </h2>
                {canEdit && state !== "Done" ? (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Add issue to ${state}`}
                    onClick={() => setCreatingIn(state)}
                  >
                    <Plus />
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {items.map((issue) => (
                  <article
                    key={issue.id}
                    draggable={canEdit}
                    onDragStart={(event) => {
                      setDraggingId(issue.id)
                      event.dataTransfer.setData("text/issue-id", issue.id)
                      event.dataTransfer.effectAllowed = "move"
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setOverColumn(null)
                    }}
                    className={cn(
                      "group rounded-md border bg-card p-3 shadow-xs",
                      canEdit && "cursor-grab active:cursor-grabbing",
                      draggingId === issue.id && "opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Link
                        href={issueHref(issue)}
                        draggable={false}
                        className="min-w-0 flex-1 text-sm font-medium hover:underline"
                      >
                        {issue.title}
                      </Link>
                      {canEdit ? (
                        <CardMenu
                          issue={issue}
                          column={state}
                          onEdit={() => setEditing(issue)}
                          onMove={(target) => moveIssue(issue, target)}
                          onDelete={() => setDeleting(issue)}
                        />
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <PriorityBadge priority={issue.priority} />
                      {issue.status !== state ? <StatusBadge status={issue.status} /> : null}
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{issue.id}</span>
                      {issue.dueDate ? (
                        <span className={cn(isOverdue(issue) && "font-medium text-destructive")}>
                          · {formatDate(issue.dueDate)}
                        </span>
                      ) : null}
                      <div className="ml-auto">
                        <AssigneePicker
                          issue={issue}
                          members={memberNames}
                          disabled={!canEdit}
                          onAssign={(name) => assign(issue, name)}
                        />
                      </div>
                    </div>
                  </article>
                ))}
                {!items.length ? (
                  <p className="rounded-md border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
                    {canEdit ? "Drop issues here" : "No issues"}
                  </p>
                ) : null}
              </div>
            </section>
          )
        })}
      </div>

      {editing ? (
        <IssueFormDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          // Always edit the latest version of the issue.
          issue={issues.find((issue) => issue.id === editing.id) ?? editing}
        />
      ) : null}

      {creatingIn ? (
        <IssueFormDialog
          key={creatingIn}
          open
          onOpenChange={(open) => !open && setCreatingIn(null)}
          projectId={project.id}
          status={creatingIn}
        />
      ) : null}

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delete {deleting?.id}?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleting?.title}&rdquo; and its comments and history will be removed permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deletingBusy}
              onClick={async () => {
                if (!deleting) return
                setDeletingBusy(true)
                try {
                  await deleteIssue(deleting.id)
                  setDeleting(null)
                } finally {
                  setDeletingBusy(false)
                }
              }}
            >
              {deletingBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function CardMenu({
  issue,
  column,
  onEdit,
  onMove,
  onDelete,
}: {
  issue: ProjectIssue
  column: WorkflowState
  onEdit: () => void
  onMove: (target: WorkflowState) => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Actions for ${issue.id}`}
            className="-mt-0.5 -mr-1 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100 data-popup-open:opacity-100"
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowRight />
            Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {workflowStates
              .filter((state) => state !== column)
              .map((state) => (
                <DropdownMenuItem key={state} onClick={() => onMove(state)}>
                  {state}
                </DropdownMenuItem>
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem render={<Link href={issueHref(issue)} />}>
          <ExternalLink />
          Open details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AssigneePicker({
  issue,
  members,
  disabled,
  onAssign,
}: {
  issue: ProjectIssue
  members: string[]
  disabled: boolean
  onAssign: (name: string) => void
}) {
  const unassigned = issue.assignee === UNASSIGNED
  const avatar = (
    <Avatar size="sm" className="size-6">
      <AvatarFallback className="text-[10px]">
        {unassigned ? <UserPlus className="size-3" /> : initials(issue.assignee)}
      </AvatarFallback>
    </Avatar>
  )

  if (disabled) return <span title={issue.assignee}>{avatar}</span>

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={unassigned ? "Assign" : `Assigned to ${issue.assignee}`}
        aria-label={unassigned ? `Assign ${issue.id}` : `Reassign ${issue.id} (${issue.assignee})`}
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {avatar}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={issue.assignee} onValueChange={(value) => onAssign(value as string)}>
          {[UNASSIGNED, ...members].map((name) => (
            <DropdownMenuRadioItem key={name} value={name}>
              {name === currentUser.name ? `${name} (me)` : name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
