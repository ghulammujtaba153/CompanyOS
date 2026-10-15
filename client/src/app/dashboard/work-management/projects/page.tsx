"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Plus } from "lucide-react"

import { Field, OptionSelect } from "@/components/dashboard/create-issue-dialog"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { TablePagination } from "@/components/dashboard/table-pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "cn"
import { currentUser, type Project } from "@/lib/project-types"
import { useClientPagination } from "@/lib/use-client-pagination"
import { formatDate, isOverdue, projectHref, projectProgress } from "@/lib/work-utils"

export default function WorkProjectsPage() {
  const router = useRouter()
  const { loading, projects, getProjectIssues } = useProjectWorkspace()
  const pagination = useClientPagination(projects, { pageSize: 10 })

  if (loading) {
    return (
      <>
        <DashboardHeader title="Projects" parent="Work Management" />
        <PageLoadingState label="Loading projects…" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="Projects" parent="Work Management" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <CreateProjectDialog />
        </div>

        <div className="overflow-hidden rounded-lg border">
          {projects.length ? (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Your role</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-48">Progress</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((project) => {
                  const issues = getProjectIssues(project.id)
                  const progress = projectProgress(issues)
                  const open = issues.filter((issue) => issue.status !== "Done").length
                  const overdue = issues.filter(isOverdue).length
                  const me = project.members.find((member) => member.email === currentUser.email)
                  const boardHref = projectHref(project.id, "board")
                  return (
                    <TableRow
                      key={project.id}
                      className="cursor-pointer"
                      onClick={() => router.push(boardHref)}
                    >
                      <TableCell>
                        <Link
                          href={boardHref}
                          onClick={(event) => event.stopPropagation()}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <Badge variant="secondary" className="font-mono">
                            {project.key}
                          </Badge>
                          <span className="font-medium">{project.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {me?.role}
                        {me?.status === "Invited" ? (
                          <Badge variant="outline" className="ml-2">
                            Invited
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{project.team}</TableCell>
                      <TableCell>
                        <Badge variant={project.status === "Active" ? "secondary" : "outline"}>
                          {project.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="flex-1" />
                          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                            {progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{open}</TableCell>
                      <TableCell
                        className={cn("text-right tabular-nums", overdue && "font-medium text-destructive")}
                      >
                        {overdue}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{project.members.length}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(project.due)}</TableCell>
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
              You aren&apos;t part of any project yet. Create one, or ask a project owner to invite you.
            </p>
          )}
        </div>
      </div>
    </>
  )
}

const emptyProject = {
  name: "",
  key: "",
  team: "",
  due: "",
  description: "",
  visibility: "Private" as Project["visibility"],
}

function suggestKey(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase()
}

function CreateProjectDialog() {
  const router = useRouter()
  const { createProject } = useProjectWorkspace()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyProject)
  const [keyTouched, setKeyTouched] = useState(false)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!form.name.trim()) return setError("Project name is required.")
    setSaving(true)
    setError("")
    try {
      const result = await createProject({
        ...form,
        name: form.name.trim(),
        team: form.team.trim() || "General",
        description: form.description.trim(),
      })
      if (!result.ok) return setError(result.message)
      setOpen(false)
      setForm(emptyProject)
      setKeyTouched(false)
      setError("")
      router.push(projectHref(result.project.id, "board"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError("")
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        New project
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form
          id="create-project-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
            <Field label="Name" htmlFor="project-name">
              <Input
                id="project-name"
                autoFocus
                value={form.name}
                onChange={(event) => {
                  const name = event.target.value
                  setForm((current) => ({
                    ...current,
                    name,
                    key: keyTouched ? current.key : suggestKey(name),
                  }))
                }}
                placeholder="Customer portal"
              />
            </Field>
            <Field label="Key" htmlFor="project-key">
              <Input
                id="project-key"
                value={form.key}
                onChange={(event) => {
                  setKeyTouched(true)
                  setForm((current) => ({ ...current, key: event.target.value.toUpperCase() }))
                }}
                maxLength={5}
                className="font-mono"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Team" htmlFor="project-team">
              <Input
                id="project-team"
                value={form.team}
                onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}
                placeholder="Product"
              />
            </Field>
            <Field label="Due date" htmlFor="project-due">
              <Input
                id="project-due"
                type="date"
                value={form.due}
                onChange={(event) => setForm((current) => ({ ...current, due: event.target.value }))}
              />
            </Field>
            <Field label="Visibility">
              <OptionSelect<Project["visibility"]>
                value={form.visibility}
                options={["Private", "Company"]}
                onChange={(visibility) => setForm((current) => ({ ...current, visibility }))}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="project-description">
            <Textarea
              id="project-description"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Goal and scope"
            />
          </Field>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-project-form" loading={saving}>
            {saving ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
