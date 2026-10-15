"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"
import {
  Ban,
  Eye,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, KeyedSelect, OptionSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useOrganization, type EmployeeInput } from "@/components/dashboard/organization-store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { TablePagination } from "@/components/dashboard/table-pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "cn"
import { accessRoles, canManagePeople, type Employee } from "@/lib/organization"
import { useClientPagination } from "@/lib/use-client-pagination"
import { formatDate, initials } from "@/lib/work-utils"

const ALL = "all"
const statuses: Employee["status"][] = ["Active", "Invited", "Suspended"]

export default function OrganizationPeoplePage() {
  return (
    <>
      <DashboardHeader title="People" parent="Organization" />
      {/* useSearchParams needs a Suspense boundary for static rendering. */}
      <Suspense>
        <PeopleDirectory />
      </Suspense>
    </>
  )
}

function PeopleDirectory() {
  const router = useRouter()
  const params = useSearchParams()
  const {
    loading,
    employees,
    departments,
    me,
    getEmployee,
    getDepartment,
    setEmployeeStatus,
    removeEmployee,
  } = useOrganization()
  const canManage = canManagePeople(me?.accessRole)

  const [query, setQuery] = useState("")
  const [department, setDepartment] = useState(params.get("department") ?? ALL)
  const [role, setRole] = useState(params.get("role") ?? ALL)
  const [status, setStatus] = useState(ALL)
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; employee: Employee } | null>(null)
  const [removing, setRemoving] = useState<Employee | null>(null)
  const [removingBusy, setRemovingBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)

  function openProfile(employeeId: string) {
    router.push(`/dashboard/organization/people/${employeeId}`)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees
      .filter(
        (employee) =>
          (!q || `${employee.name} ${employee.email} ${employee.title}`.toLowerCase().includes(q)) &&
          (department === ALL || employee.departmentId === department) &&
          (role === ALL || employee.accessRole === role) &&
          (status === ALL || employee.status === status)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [employees, query, department, role, status])

  const pagination = useClientPagination(filtered, {
    pageSize: 10,
    resetKey: `${query}|${department}|${role}|${status}`,
  })

  const isFiltered = query !== "" || department !== ALL || role !== ALL || status !== ALL
  const pending = employees.filter((employee) => employee.status === "Invited").length

  if (loading) {
    return <PageLoadingState label="Loading people…" className="p-0" />
  }

  async function report(
    result: Promise<{ ok: boolean; message?: string }> | { ok: boolean; message?: string },
    fallback: string
  ) {
    const resolved = await result
    setNotice({ ok: resolved.ok, message: resolved.message ?? fallback })
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">People</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {employees.length} people
            {pending ? ` · ${pending} invited (inactive)` : ""}
            {" · open a person for their full admin profile"}
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setDialog({ mode: "add" })}>
            <UserPlus data-icon="inline-start" />
            Invite people
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, title…"
            className="pl-8"
          />
        </div>
        <KeyedSelect
          value={department}
          onChange={setDepartment}
          options={[[ALL, "All departments"], ...departments.map((item) => [item.id, item.name] as const)]}
        />
        <KeyedSelect
          value={role}
          onChange={setRole}
          options={[[ALL, "Any access"], ...accessRoles.map((item) => [item, item] as const)]}
        />
        <KeyedSelect
          value={status}
          onChange={setStatus}
          options={[[ALL, "Any status"], ...statuses.map((item) => [item, item] as const)]}
        />
        {isFiltered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("")
              setDepartment(ALL)
              setRole(ALL)
              setStatus(ALL)
            }}
          >
            <X data-icon="inline-start" />
            Reset
          </Button>
        ) : null}
      </div>

      {notice ? (
        <div
          role="status"
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm",
            notice.ok ? "bg-muted/40" : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {notice.message}
          <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X />
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border">
        {filtered.length ? (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pageItems.map((employee) => {
                const isMe = employee.id === me?.id
                return (
                  <TableRow
                    key={employee.id}
                    className={cn(
                      "cursor-pointer",
                      employee.status === "Suspended" && "opacity-60"
                    )}
                    onClick={() => openProfile(employee.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          <AvatarFallback>{initials(employee.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium">
                            {employee.name}
                            {isMe ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{employee.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{employee.title || "—"}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={(event) => {
                          event.stopPropagation()
                          setDepartment(employee.departmentId)
                        }}
                      >
                        {getDepartment(employee.departmentId)?.name ?? "—"}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {getEmployee(employee.managerId)?.name ?? "—"}
                    </TableCell>
                    <TableCell>{employee.accessRole}</TableCell>
                    <TableCell>
                      {employee.status === "Active" ? (
                        <span className="text-sm text-muted-foreground">
                          Since {formatDate(employee.since)}
                        </span>
                      ) : (
                        <Badge variant={employee.status === "Suspended" ? "destructive" : "outline"}>
                          {employee.status}
                        </Badge>
                      )}
                    </TableCell>
                    {canManage ? (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${employee.name}`} />
                            }
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => openProfile(employee.id)}>
                              <Eye />
                              View profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDialog({ mode: "edit", employee })}>
                              <Pencil />
                              Edit
                            </DropdownMenuItem>
                            {employee.status === "Suspended" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  report(setEmployeeStatus(employee.id, "Active"), `${employee.name} reactivated.`)
                                }
                              >
                                <RotateCcw />
                                Reactivate
                              </DropdownMenuItem>
                            ) : employee.status === "Active" && !isMe ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  report(
                                    setEmployeeStatus(employee.id, "Suspended"),
                                    `${employee.name} suspended — sign-in is blocked.`
                                  )
                                }
                              >
                                <Ban />
                                Suspend
                              </DropdownMenuItem>
                            ) : null}
                            {!isMe ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onClick={() => setRemoving(employee)}>
                                  <Trash2 />
                                  Remove
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    ) : null}
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
          <p className="p-10 text-center text-sm text-muted-foreground">No one matches these filters.</p>
        )}
      </div>

      {dialog ? (
        <EmployeeDialog
          key={dialog.mode === "edit" ? dialog.employee.id : "add"}
          employee={dialog.mode === "edit" ? dialog.employee : undefined}
          onClose={(message) => {
            setDialog(null)
            if (message) setNotice({ ok: true, message })
          }}
        />
      ) : null}

      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              They lose access to the workspace. Direct reports and department head roles they held become
              unassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={removingBusy}
              onClick={async () => {
                if (!removing) return
                setRemovingBusy(true)
                try {
                  await report(removeEmployee(removing.id), "Removed.")
                  setRemoving(null)
                } finally {
                  setRemovingBusy(false)
                }
              }}
            >
              {removingBusy ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmployeeDialog({
  employee,
  onClose,
}: {
  employee?: Employee
  onClose: (message?: string) => void
}) {
  const { employees, departments, me, addEmployee, inviteEmployee, updateEmployee } = useOrganization()
  const [form, setForm] = useState<EmployeeInput>({
    name: employee?.name ?? "",
    email: employee?.email ?? "",
    title: employee?.title ?? "",
    departmentId: employee?.departmentId ?? departments[0]?.id ?? "",
    managerId: employee?.managerId ?? "",
    accessRole: employee?.accessRole ?? "Member",
    password: "",
  })
  const [directProvision, setDirectProvision] = useState(false)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const isMe = Boolean(employee && me && employee.id === me.id)
  // Only Owners can grant Owner.
  const grantable = me?.accessRole === "Owner" ? accessRoles : accessRoles.filter((item) => item !== "Owner")

  function set<K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit() {
    setSaving(true)
    setError("")
    try {
      const result = employee
        ? await updateEmployee(employee.id, form)
        : directProvision
          ? await addEmployee(form)
          : await inviteEmployee(form)
      if (!result.ok) return setError(result.message)
      onClose(result.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{employee ? `Edit ${employee.name}` : "Invite people"}</DialogTitle>
        </DialogHeader>
        <form
          id="employee-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="emp-name">
              <Input id="emp-name" autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Work email" htmlFor="emp-email">
              <Input
                id="emp-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="name@company.com"
                disabled={Boolean(employee)}
              />
            </Field>
            {!employee && directProvision ? (
              <Field label="Password" htmlFor="emp-password">
                <Input
                  id="emp-password"
                  type="password"
                  value={form.password ?? ""}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
              </Field>
            ) : null}
            <Field label="Job title" htmlFor="emp-title">
              <Input
                id="emp-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Software Engineer"
              />
            </Field>
            <Field label="Department">
              <KeyedSelect
                className="w-full"
                value={form.departmentId}
                onChange={(value) => set("departmentId", value)}
                options={departments.map((item) => [item.id, item.name] as const)}
              />
            </Field>
            <Field label="Manager">
              <KeyedSelect
                className="w-full"
                value={form.managerId}
                onChange={(value) => set("managerId", value)}
                options={[
                  ["", "No manager"],
                  ...employees
                    .filter((item) => item.id !== employee?.id && item.status !== "Suspended")
                    .map((item) => [item.id, item.name] as const),
                ]}
              />
            </Field>
            <Field label="Access role">
              <OptionSelect
                value={form.accessRole}
                options={grantable.includes(form.accessRole) ? grantable : [...grantable, form.accessRole]}
                onChange={(value) => set("accessRole", value)}
                disabled={isMe}
              />
            </Field>
          </div>
          {isMe ? (
            <p className="text-xs text-muted-foreground">You can&apos;t change your own access role.</p>
          ) : null}
          {!employee ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={directProvision}
                  onChange={(e) => setDirectProvision(e.target.checked)}
                />
                Set a password myself (skip email invite)
              </label>
              <p className="text-xs text-muted-foreground">
                {directProvision
                  ? "They can sign in immediately with this email and password. No email is sent."
                  : "We email them a secure invite link. Existing users sign in; new users register."}
              </p>
            </div>
          ) : null}
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" loading={saving}>
            {saving ? "Saving…" : employee ? "Save" : directProvision ? "Add user" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

