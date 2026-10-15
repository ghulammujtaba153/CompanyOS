"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Trash2 } from "lucide-react"

import { assigneeOptions, Field, OptionSelect } from "@/components/dashboard/create-issue-dialog"
import { StatusBadge } from "@/components/dashboard/issue-badges"
import { useCurrentProject, useProjectAccess } from "@/components/dashboard/project-shell"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { validateStatusChange } from "@/lib/issue-transitions"
import {
  issuePriorities,
  issueStatuses,
  issueTypes,
  type ProjectIssue,
} from "@/lib/project-types"
import { isOverdue, parseLabels, projectHref } from "@/lib/work-utils"

export default function IssueDetailPage() {
  const { issueId } = useParams<{ issueId: string }>()
  const project = useCurrentProject()
  const { getIssue } = useProjectWorkspace()
  const issue = getIssue(issueId)

  if (!issue || issue.projectId !== project.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">Issue {issueId} was not found in {project.key}.</p>
        <Button variant="outline" render={<Link href={projectHref(project.id, "issues")} />}>
          Back to issues
        </Button>
      </div>
    )
  }

  // Keyed so local drafts reset when navigating between issues.
  return <IssueDetail key={issue.id} issue={issue} />
}

function IssueDetail({ issue }: { issue: ProjectIssue }) {
  const router = useRouter()
  const project = useCurrentProject()
  const { canEdit } = useProjectAccess()
  const { updateIssue, deleteIssue, addComment } = useProjectWorkspace()
  const [title, setTitle] = useState(issue.title)
  const [description, setDescription] = useState(issue.description)
  const [comment, setComment] = useState("")
  const [statusError, setStatusError] = useState("")
  const [deletingBusy, setDeletingBusy] = useState(false)

  const issuesHref = projectHref(project.id, "issues")

  function saveText() {
    const nextTitle = title.trim()
    if (!nextTitle) return setTitle(issue.title)
    if (nextTitle !== issue.title || description !== issue.description) {
      void updateIssue(issue.id, { title: nextTitle, description })
    }
  }

  function changeStatus(status: ProjectIssue["status"]) {
    // Validate against the latest description draft, not the last saved one.
    const result = validateStatusChange({ ...issue, description }, status)
    if (!result.ok) return setStatusError(result.message)
    setStatusError("")
    void updateIssue(issue.id, { status, description })
  }

  function submitComment() {
    if (!comment.trim()) return
    void addComment(issue.id, comment)
    setComment("")
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <div className="space-y-2">
          <Link
            href={issuesHref}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Issues
          </Link>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{issue.id}</span>
            <span>·</span>
            <span>{issue.type}</span>
            <StatusBadge status={issue.status} />
          </div>
          <Input
            aria-label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveText}
            readOnly={!canEdit}
            className="h-auto border-transparent px-1 -mx-1 text-2xl font-semibold shadow-none hover:border-input md:text-2xl"
          />
        </div>

        <Textarea
          aria-label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={saveText}
          readOnly={!canEdit}
          placeholder={canEdit ? "Add a description…" : "No description"}
          className="min-h-40"
        />

        <Tabs defaultValue="comments">
          <TabsList variant="line">
            <TabsTrigger value="comments">Comments ({issue.comments.length})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="comments" className="space-y-4 pt-2">
            {issue.comments.map((item) => (
              <div key={item.id} className="flex gap-3">
                <Avatar size="sm">
                  <AvatarFallback>{item.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{item.author}</span>{" "}
                    <span className="text-xs text-muted-foreground">{item.createdAt}</span>
                  </p>
                  <p className="mt-1 text-sm leading-6 whitespace-pre-wrap">{item.body}</p>
                </div>
              </div>
            ))}
            {canEdit ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                submitComment()
              }}
            >
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submitComment()
                }}
                placeholder="Write a comment… (Ctrl+Enter to send)"
                className="min-h-20"
              />
              <Button type="submit" size="sm" disabled={!comment.trim()}>
                Comment
              </Button>
            </form>
            ) : null}
          </TabsContent>
          <TabsContent value="history" className="pt-2">
            <ol className="space-y-2.5 text-sm">
              {issue.activity.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span>
                    <span className="font-medium">{item.actor}</span>{" "}
                    <span className="text-muted-foreground">{item.action}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.createdAt}</span>
                </li>
              ))}
            </ol>
          </TabsContent>
        </Tabs>
      </div>

      <Card size="sm" className="h-fit xl:sticky xl:top-20">
        <CardContent className="space-y-4">
          <Field label="Status">
            <OptionSelect
              disabled={!canEdit}
              value={issue.status}
              options={issueStatuses}
              onChange={changeStatus}
            />
            {statusError ? <p className="text-xs text-destructive">{statusError}</p> : null}
          </Field>
          <Field label="Assignee">
            <OptionSelect
                disabled={!canEdit}
              value={issue.assignee}
              options={assigneeOptions(
                project.members.map((member) => member.name),
                issue.assignee
              )}
              onChange={(assignee) => void updateIssue(issue.id, { assignee })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <OptionSelect
                disabled={!canEdit}
                value={issue.priority}
                options={issuePriorities}
                onChange={(priority) => void updateIssue(issue.id, { priority })}
              />
            </Field>
            <Field label="Type">
              <OptionSelect
                disabled={!canEdit}
                value={issue.type}
                options={issueTypes}
                onChange={(type) => void updateIssue(issue.id, { type })}
              />
            </Field>
            <Field label="Due date" htmlFor="issue-due">
              <Input
                id="issue-due"
                type="date"
                disabled={!canEdit}
                value={issue.dueDate}
                onChange={(event) => void updateIssue(issue.id, { dueDate: event.target.value })}
                aria-invalid={isOverdue(issue)}
              />
            </Field>
            <Field label="Estimate" htmlFor="issue-estimate">
              <Input
                id="issue-estimate"
                defaultValue={issue.estimate}
                disabled={!canEdit}
                placeholder="—"
                onBlur={(event) => void updateIssue(issue.id, { estimate: event.target.value.trim() })}
              />
            </Field>
          </div>
          <Field label="Labels" htmlFor="issue-labels">
            <Input
              id="issue-labels"
              defaultValue={issue.labels.join(", ")}
              disabled={!canEdit}
              placeholder="auth, mobile"
              onBlur={(event) => void updateIssue(issue.id, { labels: parseLabels(event.target.value) })}
            />
            {issue.labels.length ? (
              <div className="flex flex-wrap gap-1">
                {issue.labels.map((label) => (
                  <Badge key={label} variant="secondary">
                    {label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Field>

          <Separator />
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Reporter</dt>
            <dd className="text-right">{issue.reporter}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-right">{issue.createdAt}</dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd className="text-right">{issue.updatedAt}</dd>
          </dl>

          {canEdit ? (
          <Dialog>
            <DialogTrigger
              render={<Button variant="ghost" size="sm" className="w-full text-destructive" />}
            >
              <Trash2 data-icon="inline-start" />
              Delete issue
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Delete {issue.id}?</DialogTitle>
                <DialogDescription>
                  The issue, its comments, and its history are removed permanently.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="destructive"
                  loading={deletingBusy}
                  onClick={async () => {
                    setDeletingBusy(true)
                    try {
                      await deleteIssue(issue.id)
                      router.push(issuesHref)
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
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
