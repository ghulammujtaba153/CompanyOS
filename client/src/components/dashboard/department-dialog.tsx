"use client"

import { useState } from "react"

import { Field, KeyedSelect } from "@/components/dashboard/form-controls"
import { useOrganization } from "@/components/dashboard/organization-store"
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
import type { Department } from "@/lib/organization"

export function DepartmentDialog({
  department,
  onClose,
}: {
  department?: Department
  onClose: () => void
}) {
  const { employees, departments, saveDepartment } = useOrganization()
  const [copyFrom, setCopyFrom] = useState("")
  const [name, setName] = useState(department?.name ?? "")
  const [description, setDescription] = useState(department?.description ?? "")
  const [headId, setHeadId] = useState(department?.headId ?? "")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  // Members of the department first, then everyone else who is active.
  const candidates = employees
    .filter((item) => item.status !== "Suspended")
    .sort(
      (a, b) =>
        Number(b.departmentId === department?.id) - Number(a.departmentId === department?.id) ||
        a.name.localeCompare(b.name)
    )

  async function submit() {
    setSaving(true)
    setError("")
    try {
      const result = await saveDepartment(
        { id: department?.id, name, description, headId },
        copyFrom || undefined
      )
      if (!result.ok) return setError(result.message)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{department ? `Edit ${department.name}` : "New department"}</DialogTitle>
        </DialogHeader>
        <form
          id="department-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field label="Name" htmlFor="dep-name">
            <Input id="dep-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="dep-description">
            <Textarea
              id="dep-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this team is responsible for"
            />
          </Field>
          <Field label="Head">
            <KeyedSelect
              className="w-full"
              value={headId}
              onChange={setHeadId}
              options={[["", "Vacant"], ...candidates.map((item) => [item.id, item.name] as const)]}
            />
          </Field>
          {!department ? (
            <Field label="Sidebar access">
              <KeyedSelect
                className="w-full"
                value={copyFrom}
                onChange={setCopyFrom}
                options={[
                  ["", "Standard (Work, Communications, Company Brain)"],
                  ...departments.map((item) => [item.id, `Same as ${item.name}`] as const),
                ]}
              />
            </Field>
          ) : null}
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="department-form" loading={saving}>
            {saving ? "Saving…" : department ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
