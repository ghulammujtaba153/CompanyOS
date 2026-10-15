"use client"

import { useState } from "react"

import { Field, OptionSelect } from "@/components/dashboard/create-issue-dialog"
import { useCurrentProject, useProjectAccess } from "@/components/dashboard/project-shell"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { projectStatuses, type Project } from "@/lib/project-types"

export default function ProjectSettingsPage() {
  const project = useCurrentProject()
  const { canManage } = useProjectAccess()
  const { updateProject } = useProjectWorkspace()
  const [form, setForm] = useState({
    name: project.name,
    description: project.description,
    team: project.team,
    due: project.due,
    status: project.status,
    visibility: project.visibility,
  })
  const [saved, setSaved] = useState(false)

  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((key) => form[key] !== project[key])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  async function save() {
    if (!form.name.trim()) return
    await updateProject(project.id, {
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      team: form.team.trim(),
    })
    setSaved(true)
  }

  return (
    <form
      className="grid max-w-2xl gap-4"
      inert={!canManage}
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Name" htmlFor="name">
          <Input id="name" value={form.name} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field label="Key" htmlFor="key">
          <Input id="key" value={project.key} disabled className="font-mono" />
        </Field>
      </div>
      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
          className="min-h-24"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Team" htmlFor="team">
          <Input id="team" value={form.team} onChange={(event) => set("team", event.target.value)} />
        </Field>
        <Field label="Due date" htmlFor="due">
          <Input id="due" type="date" value={form.due} onChange={(event) => set("due", event.target.value)} />
        </Field>
        <Field label="Status">
          <OptionSelect value={form.status} options={projectStatuses} onChange={(v) => set("status", v)} />
        </Field>
        <Field label="Visibility">
          <OptionSelect<Project["visibility"]>
            value={form.visibility}
            options={["Private", "Company"]}
            onChange={(v) => set("visibility", v)}
          />
        </Field>
      </div>
      {!canManage ? (
        <p className="text-sm text-muted-foreground">Only owners and admins can change project settings.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        The key can&apos;t change — it keeps existing issue IDs ({project.key}-123) stable.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || !form.name.trim()}>
          Save changes
        </Button>
        {saved && !dirty ? <span className="text-sm text-muted-foreground">Saved</span> : null}
      </div>
    </form>
  )
}
