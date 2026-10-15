"use client"

import { useState } from "react"
import { Lock } from "lucide-react"

import { useOrganization } from "@/components/dashboard/organization-store"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "cn"
import { applyAccessChange, controllableHrefs, navGroups } from "@/lib/navigation"
import type { Department } from "@/lib/organization"

export function DepartmentAccessDialog({
  department,
  onClose,
}: {
  department: Department
  onClose: () => void
}) {
  const { employees, getDepartmentAccess, setDepartmentAccess, setPreviewDepartmentId } =
    useOrganization()
  const saved = getDepartmentAccess(department.id)
  const [draft, setDraft] = useState<string[]>(saved)
  const granted = new Set(draft)
  const people = employees.filter((employee) => employee.departmentId === department.id).length
  const dirty = draft.length !== saved.length || draft.some((href) => !saved.includes(href))
  const [saving, setSaving] = useState<"save" | "preview" | null>(null)

  function toggle(href: string, allowed: boolean) {
    setDraft((current) => applyAccessChange(current, href, allowed))
  }

  async function save(thenPreview = false) {
    setSaving(thenPreview ? "preview" : "save")
    try {
      await setDepartmentAccess(department.id, draft)
      if (thenPreview) setPreviewDepartmentId(department.id)
      onClose()
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sidebar access · {department.name}</DialogTitle>
          <DialogDescription>
            Applies to {people} {people === 1 ? "person" : "people"} in this department. Owners and
            Admins always see everything.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {draft.length} of {controllableHrefs.length} items enabled
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setDraft([...controllableHrefs])}>
              Select all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft([])}>
              Clear
            </Button>
          </div>
        </div>

        <div className="-mx-1 max-h-[55vh] space-y-4 overflow-y-auto px-1">
          {navGroups.map((group) => (
            <section key={group.label}>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group.label}
              </h3>
              <ul className="divide-y rounded-lg border">
                {group.items.map((item) => {
                  const children = item.items ?? []
                  const enabledChildren = children.filter((child) => granted.has(child.href)).length
                  const on = item.locked || granted.has(item.href)
                  return (
                    <li key={item.href} className="px-3 py-2">
                      <label
                        className={cn(
                          "flex items-center gap-2.5 text-sm font-medium [&_svg]:size-4",
                          item.locked ? "cursor-default" : "cursor-pointer"
                        )}
                      >
                        <Checkbox
                          checked={on}
                          indeterminate={on && !item.locked && children.length > 0 && enabledChildren < children.length}
                          disabled={item.locked}
                          onChange={(next) => toggle(item.href, next)}
                        />
                        <item.icon />
                        <span className="flex-1">{item.title}</span>
                        {item.locked ? (
                          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                            <Lock className="size-3" />
                            Everyone
                          </span>
                        ) : children.length ? (
                          <span className="text-xs font-normal tabular-nums text-muted-foreground">
                            {enabledChildren}/{children.length}
                          </span>
                        ) : null}
                      </label>
                      {children.length ? (
                        <div className="mt-1.5 ml-6 grid gap-1.5 pl-2.5 sm:grid-cols-2">
                          {children.map((child) => (
                            <label
                              key={child.href}
                              className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
                            >
                              <Checkbox
                                checked={granted.has(child.href)}
                                onChange={(next) => toggle(child.href, next)}
                              />
                              {child.title}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            loading={saving === "preview"}
            disabled={Boolean(saving)}
            onClick={() => void save(true)}
          >
            {saving === "preview" ? "Saving…" : "Save & preview"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={Boolean(saving)}>
              Cancel
            </Button>
            <Button loading={saving === "save"} disabled={!dirty || Boolean(saving)} onClick={() => void save()}>
              {saving === "save" ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Checkbox({
  checked,
  indeterminate = false,
  disabled,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <input
      type="checkbox"
      className="size-4 shrink-0 accent-primary disabled:opacity-50"
      checked={checked}
      disabled={disabled}
      ref={(element) => {
        if (element) element.indeterminate = indeterminate
      }}
      onChange={(event) => onChange(event.target.checked)}
    />
  )
}
