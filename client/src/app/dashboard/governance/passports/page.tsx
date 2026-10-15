"use client"

import { useState } from "react"
import { MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, KeyedSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useGovernance } from "@/components/dashboard/governance-store"
import { useOrganization } from "@/components/dashboard/organization-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  autonomyLevels,
  capabilities,
  capabilityName,
  riskLevels,
  type AutonomyLevel,
  type Passport,
  type Risk,
} from "@/lib/governance"
import { useClientPagination } from "@/lib/use-client-pagination"

const MAX_CHIPS = 3

export default function GovernancePassportsPage() {
  const { loading, passports, defaultAutonomy, canEdit, savePassport, deletePassport } = useGovernance()
  const { getEmployee } = useOrganization()
  const [editing, setEditing] = useState<Passport | "new" | null>(null)
  const pagination = useClientPagination(passports, { resetKey: passports.length })

  if (loading) {
    return (
      <>
        <DashboardHeader title="Passports" parent="Governance" />
        <PageLoadingState label="Loading passports…" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="Permission passports" parent="Governance" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Permission passports</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              An agent can only attempt actions listed in its passport. Anything else is blocked.
            </p>
          </div>
          {canEdit ? (
            <Button onClick={() => setEditing("new")}>
              <Plus data-icon="inline-start" />
              New passport
            </Button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Accountable owner</TableHead>
                <TableHead>Autonomy</TableHead>
                <TableHead>Allowed actions</TableHead>
                <TableHead>Status</TableHead>
                {canEdit ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pageItems.map((passport) => {
                const level = passport.autonomy ?? defaultAutonomy
                return (
                  <TableRow key={passport.id} className={cn(passport.status === "Paused" && "text-muted-foreground")}>
                    <TableCell className="font-medium">
                      {canEdit ? (
                        <button type="button" className="hover:underline" onClick={() => setEditing(passport)}>
                          {passport.agent}
                        </button>
                      ) : (
                        passport.agent
                      )}
                    </TableCell>
                    <TableCell>{getEmployee(passport.ownerId)?.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      L{level} · {autonomyLevels[level].name}
                      {passport.autonomy === null ? (
                        <span className="ml-1 text-xs text-muted-foreground">(default)</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-md flex-wrap gap-1">
                        {passport.capabilityIds.slice(0, MAX_CHIPS).map((id) => (
                          <Badge key={id} variant="secondary">
                            {capabilityName(id)}
                          </Badge>
                        ))}
                        {passport.capabilityIds.length > MAX_CHIPS ? (
                          <Badge variant="outline">+{passport.capabilityIds.length - MAX_CHIPS}</Badge>
                        ) : null}
                        {!passport.capabilityIds.length ? <span className="text-sm">None</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={passport.status === "Active" ? "secondary" : "outline"}>{passport.status}</Badge>
                    </TableCell>
                    {canEdit ? (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${passport.agent}`} />}
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setEditing(passport)}>
                              <Pencil />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                savePassport({ ...passport, status: passport.status === "Active" ? "Paused" : "Active" })
                              }
                            >
                              {passport.status === "Active" ? <Pause /> : <Play />}
                              {passport.status === "Active" ? "Pause agent" : "Resume agent"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                if (window.confirm(`Revoke ${passport.agent}'s passport? It will be blocked from every action.`)) {
                                  deletePassport(passport.id)
                                }
                              }}
                            >
                              <Trash2 />
                              Revoke
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {!passports.length ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No agents have a passport.</p>
          ) : (
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
          )}
        </div>
      </div>

      {editing ? (
        <PassportDialog
          key={editing === "new" ? "new" : editing.id}
          passport={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}

const riskTone: Record<Risk, string> = {
  Low: "text-muted-foreground",
  Medium: "text-amber-600 dark:text-amber-400",
  High: "text-orange-600 dark:text-orange-400",
  Critical: "text-destructive",
}

function PassportDialog({ passport, onClose }: { passport?: Passport; onClose: () => void }) {
  const { savePassport, defaultAutonomy, rules } = useGovernance()
  const { employees } = useOrganization()
  const [form, setForm] = useState({
    agent: passport?.agent ?? "",
    ownerId: passport?.ownerId ?? "",
    autonomy: passport?.autonomy ?? null,
    capabilityIds: passport?.capabilityIds ?? [],
    status: passport?.status ?? ("Active" as Passport["status"]),
  })
  const [error, setError] = useState("")
  const categories = Array.from(new Set(capabilities.map((item) => item.category)))

  /** Highest risk among enabled firewall rules for an action. */
  function riskFor(capabilityId: string) {
    return rules
      .filter((rule) => rule.enabled && rule.capabilityId === capabilityId)
      .map((rule) => rule.risk)
      .sort((a, b) => riskLevels.indexOf(b) - riskLevels.indexOf(a))[0]
  }

  function toggle(id: string, on: boolean) {
    setForm((current) => ({
      ...current,
      capabilityIds: on ? [...current.capabilityIds, id] : current.capabilityIds.filter((item) => item !== id),
    }))
  }

  function submit() {
    const result = savePassport({ ...form, id: passport?.id })
    if (!result.ok) return setError(result.message)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{passport ? `${passport.agent} passport` : "New passport"}</DialogTitle>
        </DialogHeader>
        <form
          id="passport-form"
          className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Agent name" htmlFor="agent-name">
              <Input
                id="agent-name"
                autoFocus={!passport}
                value={form.agent}
                onChange={(event) => setForm({ ...form, agent: event.target.value })}
                placeholder="Support Agent"
              />
            </Field>
            <Field label="Accountable owner">
              <KeyedSelect
                className="w-full"
                value={form.ownerId}
                onChange={(ownerId) => setForm({ ...form, ownerId })}
                options={[
                  ["", "Choose a person…"],
                  ...employees.filter((e) => e.status === "Active").map((e) => [e.id, e.name] as const),
                ]}
              />
            </Field>
            <Field label="Autonomy">
              <KeyedSelect
                className="w-full"
                value={form.autonomy === null ? "default" : String(form.autonomy)}
                onChange={(value) =>
                  setForm({ ...form, autonomy: value === "default" ? null : (Number(value) as AutonomyLevel) })
                }
                options={[
                  ["default", `Company default (L${defaultAutonomy})`],
                  ...autonomyLevels.map((level) => [String(level.level), `L${level.level} · ${level.name}`] as const),
                ]}
              />
            </Field>
            <Field label="Status">
              <KeyedSelect
                className="w-full"
                value={form.status}
                onChange={(status) => setForm({ ...form, status: status as Passport["status"] })}
                options={[
                  ["Active", "Active"],
                  ["Paused", "Paused — blocked from all actions"],
                ]}
              />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">
              Allowed actions <span className="font-normal text-muted-foreground">({form.capabilityIds.length})</span>
            </p>
            {categories.map((category) => (
              <section key={category}>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{category}</h3>
                <ul className="divide-y rounded-md border">
                  {capabilities
                    .filter((item) => item.category === category)
                    .map((item) => {
                      const risk = riskFor(item.id)
                      return (
                        <li key={item.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/40">
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={form.capabilityIds.includes(item.id)}
                              onChange={(event) => toggle(item.id, event.target.checked)}
                            />
                            <span className="flex-1">{item.name}</span>
                            {risk ? <span className={cn("text-xs", riskTone[risk])}>{risk} risk rule</span> : null}
                          </label>
                        </li>
                      )
                    })}
                </ul>
              </section>
            ))}
          </div>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="passport-form">
            {passport ? "Save" : "Create passport"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
