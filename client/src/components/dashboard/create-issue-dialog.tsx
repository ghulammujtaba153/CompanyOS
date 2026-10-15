"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Plus } from "lucide-react"

import { Field, KeyedSelect, OptionSelect } from "@/components/dashboard/form-controls"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { validateStatusChange } from "@/lib/issue-transitions"
import {
  canEditIssues,
  issuePriorities,
  issueStatuses,
  issueTypes,
  UNASSIGNED,
  type ProjectIssue,
} from "@/lib/project-types"
import { issueHref, parseLabels } from "@/lib/work-utils"

type IssueForm = {
  title: string
  description: string
  priority: ProjectIssue["priority"]
  type: ProjectIssue["type"]
  status: ProjectIssue["status"]
  assignee: string
  labels: string
  estimate: string
  dueDate: string
}

function toForm(issue?: ProjectIssue, status?: ProjectIssue["status"]): IssueForm {
  return {
    title: issue?.title ?? "",
    description: issue?.description ?? "",
    priority: issue?.priority ?? "Medium",
    type: issue?.type ?? "Ticket",
    status: issue?.status ?? status ?? "To do",
    assignee: issue?.assignee ?? UNASSIGNED,
    labels: issue?.labels.join(", ") ?? "",
    estimate: issue?.estimate ?? "",
    dueDate: issue?.dueDate ?? "",
  }
}

/** "New issue" button + dialog. Omit `projectId` on cross-project views to pick a project. */
export function CreateIssueDialog({ projectId }: { projectId?: string }) {
  const { projects, getMyRole } = useProjectWorkspace()
  const [open, setOpen] = useState(false)
  const writable = projects.filter((project) => canEditIssues(getMyRole(project.id)))

  return (
    <>
      <Button disabled={!writable.length} onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        New issue
      </Button>
      <IssueFormDialog open={open} onOpenChange={setOpen} projectId={projectId} />
    </>
  )
}

/** Controlled create/edit dialog. Pass `issue` to edit it. */
export function IssueFormDialog({
  open,
  onOpenChange,
  issue,
  projectId,
  status,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  issue?: ProjectIssue
  projectId?: string
  status?: ProjectIssue["status"]
}) {
  const router = useRouter()
  const { projects, getProject, getMyRole, createIssue, updateIssue } = useProjectWorkspace()
  const writable = projects.filter((project) => canEditIssues(getMyRole(project.id)))
  const [form, setForm] = useState(() => toForm(issue, status))
  const [targetProjectId, setTargetProjectId] = useState(
    issue?.projectId ?? projectId ?? writable[0]?.id ?? ""
  )
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const project = getProject(issue?.projectId ?? projectId ?? targetProjectId)
  const editing = Boolean(issue)

  function set<K extends keyof IssueForm>(key: K, value: IssueForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function close(next: boolean) {
    onOpenChange(next)
    if (next) {
      // Re-sync with the latest issue each time the dialog opens.
      setForm(toForm(issue, status))
      setError("")
      setSaving(false)
    }
  }

  async function submit() {
    if (!project) return setError("Choose a project.")
    if (!form.title.trim()) return setError("Title is required.")
    const values = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      estimate: form.estimate.trim(),
      labels: parseLabels(form.labels),
    }

    setSaving(true)
    setError("")
    try {
      if (issue) {
        if (values.status !== issue.status) {
          const result = validateStatusChange({ ...issue, ...values }, values.status)
          if (!result.ok) return setError(result.message)
        }
        await updateIssue(issue.id, values)
        onOpenChange(false)
        return
      }

      const created = await createIssue(project.id, values)
      if (!created) return setError("Could not create the issue.")
      onOpenChange(false)
      setForm(toForm(undefined, status))
      if (!projectId) router.push(issueHref(created))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${issue!.id}` : `New issue${project && projectId ? ` in ${project.key}` : ""}`}
          </DialogTitle>
        </DialogHeader>
        <form
          id="issue-form"
          className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {!editing && !projectId ? (
            <Field label="Project">
              <KeyedSelect
                value={targetProjectId}
                onChange={(value) => {
                  setTargetProjectId(value)
                  set("assignee", UNASSIGNED)
                }}
                options={writable.map((item) => [item.id, item.name] as const)}
              />
            </Field>
          ) : null}
          <Field label="Title" htmlFor="issue-title">
            <Input
              id="issue-title"
              autoFocus
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="Short summary of the problem or request"
            />
          </Field>
          <Field label="Description" htmlFor="issue-description">
            <Textarea
              id="issue-description"
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Steps to reproduce, expected result, acceptance criteria…"
              className="min-h-28"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <OptionSelect
                value={form.status}
                // New issues can't start closed — Done goes through the transition rules.
                options={editing ? issueStatuses : issueStatuses.filter((item) => item !== "Done")}
                onChange={(v) => set("status", v)}
              />
            </Field>
            <Field label="Assignee">
              <OptionSelect
                value={form.assignee}
                options={assigneeOptions(project?.members.map((member) => member.name) ?? [], form.assignee)}
                onChange={(v) => set("assignee", v)}
              />
            </Field>
            <Field label="Type">
              <OptionSelect value={form.type} options={issueTypes} onChange={(v) => set("type", v)} />
            </Field>
            <Field label="Priority">
              <OptionSelect
                value={form.priority}
                options={issuePriorities}
                onChange={(v) => set("priority", v)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Due date" htmlFor="issue-due">
              <Input
                id="issue-due"
                type="date"
                value={form.dueDate}
                onChange={(event) => set("dueDate", event.target.value)}
              />
            </Field>
            <Field label="Estimate" htmlFor="issue-estimate">
              <Input
                id="issue-estimate"
                value={form.estimate}
                onChange={(event) => set("estimate", event.target.value)}
                placeholder="e.g. 3d"
              />
            </Field>
            <Field label="Labels" htmlFor="issue-labels">
              <Input
                id="issue-labels"
                value={form.labels}
                onChange={(event) => set("labels", event.target.value)}
                placeholder="auth, mobile"
              />
            </Field>
          </div>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="issue-form" loading={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Create issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Unassigned + project members, keeping a former member selectable so the value renders. */
export { Field, OptionSelect }

export function assigneeOptions(memberNames: string[], current: string) {
  const options = [UNASSIGNED, ...memberNames]
  return options.includes(current) ? options : [...options, current]
}
