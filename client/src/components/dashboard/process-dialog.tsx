"use client"

import { useState } from "react"

import { Field, KeyedSelect } from "@/components/dashboard/form-controls"
import { useOrganization } from "@/components/dashboard/organization-store"
import { useProcesses } from "@/components/dashboard/processes-store"
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
import type { Process } from "@/lib/processes"

/** Create or edit a process's details (steps are edited on the process page). */
export function ProcessDialog({ process, onClose }: { process?: Process; onClose: (id?: string) => void }) {
  const { saveProcess } = useProcesses()
  const { me, employees, departments } = useOrganization()
  const [form, setForm] = useState({
    name: process?.name ?? "",
    description: process?.description ?? "",
    departmentId: process?.departmentId ?? me?.departmentId ?? departments[0]?.id ?? "",
    ownerId: process?.ownerId ?? me?.id ?? "",
    runsPerWeek: process?.runsPerWeek ?? 10,
    context: process?.context ?? { amount: 0, records: 0, external: false },
  })
  const [error, setError] = useState("")

  function submit() {
    const result = saveProcess({ ...form, id: process?.id })
    if (!result.ok) return setError(result.message)
    onClose(process ? undefined : result.id)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{process ? "Edit process" : "New process"}</DialogTitle>
        </DialogHeader>
        <form
          id="process-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field label="Name" htmlFor="process-name">
            <Input id="process-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Expense reimbursement" />
          </Field>
          <Field label="Description" htmlFor="process-description">
            <Textarea id="process-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department">
              <KeyedSelect className="w-full" value={form.departmentId} onChange={(departmentId) => setForm({ ...form, departmentId })} options={departments.map((d) => [d.id, d.name] as const)} />
            </Field>
            <Field label="Owner">
              <KeyedSelect
                className="w-full"
                value={form.ownerId}
                onChange={(ownerId) => setForm({ ...form, ownerId })}
                options={[["", "Choose…"], ...employees.filter((e) => e.status === "Active").map((e) => [e.id, e.name] as const)]}
              />
            </Field>
            <Field label="Runs per week" htmlFor="process-runs">
              <Input id="process-runs" type="number" min={1} value={form.runsPerWeek} onChange={(e) => setForm({ ...form, runsPerWeek: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Typical amount ($)" htmlFor="process-amount">
              <Input
                id="process-amount"
                type="number"
                min={0}
                value={form.context.amount}
                onChange={(e) => setForm({ ...form, context: { ...form.context, amount: Number(e.target.value) || 0 } })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={form.context.external}
              onChange={(e) => setForm({ ...form, context: { ...form.context, external: e.target.checked } })}
            />
            Usually involves an external party
          </label>
          <p className="text-xs text-muted-foreground">
            Amount and external party are what governance checks when an agent performs a step.
          </p>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button type="submit" form="process-form">
            {process ? "Save" : "Create process"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
