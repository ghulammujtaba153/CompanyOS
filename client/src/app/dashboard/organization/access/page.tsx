"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, Eye, KeyRound, Minus, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { DepartmentAccessDialog } from "@/components/dashboard/department-access-dialog"
import { DepartmentDialog } from "@/components/dashboard/department-dialog"
import { useOrganization } from "@/components/dashboard/organization-store"
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
import { TablePagination } from "@/components/dashboard/table-pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useClientPagination } from "@/lib/use-client-pagination"
import { navItems } from "@/lib/navigation"
import {
  accessRoles,
  accessRoleSummary,
  canManagePeople,
  type Department,
} from "@/lib/organization"
import { initials } from "@/lib/work-utils"

type Modal =
  | { kind: "create" }
  | { kind: "details"; department: Department }
  | { kind: "access"; department: Department }
  | { kind: "delete"; department: Department }

const MAX_CHIPS = 4

export default function OrganizationAccessPage() {
  const { me } = useOrganization()
  const canManage = canManagePeople(me?.accessRole)
  const [modal, setModal] = useState<Modal | null>(null)

  return (
    <>
      <DashboardHeader title="Departments & access" parent="Organization" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Departments & access</h1>
          {canManage ? (
            <Button onClick={() => setModal({ kind: "create" })}>
              <Plus data-icon="inline-start" />
              New department
            </Button>
          ) : null}
        </div>

        <Tabs defaultValue="departments">
          <TabsList variant="line">
            <TabsTrigger value="departments">Departments</TabsTrigger>
            <TabsTrigger value="roles">Role permissions</TabsTrigger>
          </TabsList>
          <TabsContent value="departments" className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Each department sees only the sidebar sections it&apos;s granted. Owners and Admins always see
              everything; Overview and Settings are open to all.
            </p>
            <DepartmentList canManage={canManage} onOpen={setModal} />
          </TabsContent>
          <TabsContent value="roles" className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {canManage
                ? "Click a cell to grant or revoke a capability for that role. Assign who holds each role in "
                : "Capabilities by workspace role. Change a person’s role from "}
              <Link href="/dashboard/organization/people" className="underline underline-offset-2">
                People
              </Link>
              {canManage ? ". Owner always keeps billing and ownership transfer." : "."}
            </p>
            <RolePermissions canManage={canManage} />
          </TabsContent>
        </Tabs>
      </div>

      {modal?.kind === "create" ? <DepartmentDialog onClose={() => setModal(null)} /> : null}
      {modal?.kind === "details" ? (
        <DepartmentDialog department={modal.department} onClose={() => setModal(null)} />
      ) : null}
      {modal?.kind === "access" ? (
        <DepartmentAccessDialog department={modal.department} onClose={() => setModal(null)} />
      ) : null}
      {modal?.kind === "delete" ? (
        <DeleteDepartmentDialog department={modal.department} onClose={() => setModal(null)} />
      ) : null}
    </>
  )
}

function DepartmentList({
  canManage,
  onOpen,
}: {
  canManage: boolean
  onOpen: (modal: Modal) => void
}) {
  const { departments, employees, getEmployee, getDepartmentAccess, setPreviewDepartmentId } =
    useOrganization()
  const pagination = useClientPagination(departments, { resetKey: departments.length })

  if (!departments.length) {
    return (
      <p className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
        No departments yet.
      </p>
    )
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Department</TableHead>
            <TableHead>Head</TableHead>
            <TableHead className="text-right">People</TableHead>
            <TableHead>Sidebar access</TableHead>
            {canManage ? <TableHead className="w-10" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagination.pageItems.map((department) => {
            const head = getEmployee(department.headId)
            const count = employees.filter((item) => item.departmentId === department.id).length
            const granted = getDepartmentAccess(department.id)
            const sections = navItems.filter((item) => !item.locked && granted.includes(item.href))
            return (
              <TableRow key={department.id}>
                <TableCell>
                  <p className="font-medium">{department.name}</p>
                  {department.description ? (
                    <p className="text-xs text-muted-foreground">{department.description}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {head ? (
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Avatar size="sm" className="size-6">
                        <AvatarFallback className="text-[10px]">{initials(head.name)}</AvatarFallback>
                      </Avatar>
                      {head.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Vacant</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Link
                    href={`/dashboard/organization/people?department=${department.id}`}
                    className="hover:underline"
                  >
                    {count}
                  </Link>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => onOpen({ kind: "access", department })}
                    className="flex max-w-md flex-wrap gap-1 rounded-md text-left enabled:cursor-pointer enabled:hover:opacity-80"
                    aria-label={`Edit sidebar access for ${department.name}`}
                  >
                    {sections.length ? (
                      <>
                        {sections.slice(0, MAX_CHIPS).map((item) => (
                          <Badge key={item.href} variant="secondary">
                            {item.title}
                          </Badge>
                        ))}
                        {sections.length > MAX_CHIPS ? (
                          <Badge variant="outline">+{sections.length - MAX_CHIPS} more</Badge>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">Overview & Settings only</span>
                    )}
                  </button>
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Actions for ${department.name}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => onOpen({ kind: "access", department })}>
                          <KeyRound />
                          Edit access
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onOpen({ kind: "details", department })}>
                          <Pencil />
                          Edit details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPreviewDepartmentId(department.id)}>
                          <Eye />
                          Preview sidebar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onOpen({ kind: "delete", department })}
                        >
                          <Trash2 />
                          Delete
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
    </div>
  )
}

function DeleteDepartmentDialog({
  department,
  onClose,
}: {
  department: Department
  onClose: () => void
}) {
  const { employees, deleteDepartment } = useOrganization()
  const count = employees.filter((item) => item.departmentId === department.id).length
  const [deleting, setDeleting] = useState(false)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delete {department.name}?</DialogTitle>
          <DialogDescription>
            {count
              ? `${count} ${count === 1 ? "person is" : "people are"} still in this department. Move them to another department first.`
              : "The department and its sidebar access settings are removed permanently."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {count ? (
            <Button
              variant="outline"
              render={<Link href={`/dashboard/organization/people?department=${department.id}`} />}
            >
              View people
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleting}
                onClick={async () => {
                  setDeleting(true)
                  try {
                    await deleteDepartment(department.id)
                    onClose()
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RolePermissions({ canManage }: { canManage: boolean }) {
  const { employees, rolePermissions, toggleRolePermission } = useOrganization()
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const areas = Array.from(new Set(rolePermissions.map((row) => row.area)))

  async function toggle(capability: string, role: (typeof accessRoles)[number]) {
    if (!canManage) return
    const key = `${capability}:${role}`
    setPending(key)
    setNotice(null)
    try {
      const result = await toggleRolePermission(capability, role)
      if (!result.ok) setNotice(result.message)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-2">
      {notice ? <p className="text-sm text-destructive">{notice}</p> : null}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56 align-bottom">Capability</TableHead>
              {accessRoles.map((role) => {
                const count = employees.filter(
                  (employee) => employee.accessRole === role && employee.status !== "Suspended"
                ).length
                return (
                  <TableHead key={role} className="h-auto min-w-36 py-3 align-bottom whitespace-normal">
                    <p className="font-semibold text-foreground">{role}</p>
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                      {accessRoleSummary[role]}
                    </p>
                    <Link
                      href={`/dashboard/organization/people?role=${role}`}
                      className="mt-1 inline-block text-xs font-normal text-primary hover:underline"
                    >
                      {count} {count === 1 ? "person" : "people"}
                    </Link>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas.map((area) => (
              <AreaRows
                key={area}
                area={area}
                canManage={canManage}
                pending={pending}
                onToggle={toggle}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function AreaRows({
  area,
  canManage,
  pending,
  onToggle,
}: {
  area: string
  canManage: boolean
  pending: string | null
  onToggle: (capability: string, role: (typeof accessRoles)[number]) => void
}) {
  const { rolePermissions, roleHasPermission } = useOrganization()

  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell
          colSpan={accessRoles.length + 1}
          className="py-1.5 text-xs font-semibold text-muted-foreground uppercase"
        >
          {area}
        </TableCell>
      </TableRow>
      {rolePermissions
        .filter((row) => row.area === area)
        .map((row) => (
          <TableRow key={row.capability}>
            <TableCell>{row.capability}</TableCell>
            {accessRoles.map((role) => {
              const allowed = roleHasPermission(row.capability, role)
              const locked =
                role === "Owner" &&
                (row.capability === "Billing, security & SSO" ||
                  row.capability === "Transfer ownership")
              const busy = pending === `${row.capability}:${role}`
              if (!canManage || locked) {
                return (
                  <TableCell key={role}>
                    {allowed ? (
                      <Check className="size-4 text-primary" aria-label="Allowed" />
                    ) : (
                      <Minus className="size-4 text-muted-foreground/40" aria-label="Not allowed" />
                    )}
                  </TableCell>
                )
              }
              return (
                <TableCell key={role}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onToggle(row.capability, role)}
                    className="rounded-md p-1 hover:bg-muted disabled:opacity-50"
                    aria-label={
                      allowed
                        ? `Revoke ${row.capability} for ${role}`
                        : `Grant ${row.capability} for ${role}`
                    }
                    title={allowed ? "Click to revoke" : "Click to grant"}
                  >
                    {allowed ? (
                      <Check className="size-4 text-primary" />
                    ) : (
                      <Minus className="size-4 text-muted-foreground/40" />
                    )}
                  </button>
                </TableCell>
              )
            })}
          </TableRow>
        ))}
    </>
  )
}
