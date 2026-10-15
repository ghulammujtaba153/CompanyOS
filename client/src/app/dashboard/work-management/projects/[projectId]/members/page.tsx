"use client"

import { useEffect, useMemo, useState } from "react"
import { Trash2 } from "lucide-react"

import { OptionSelect } from "@/components/dashboard/create-issue-dialog"
import { KeyedSelect } from "@/components/dashboard/form-controls"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useOrganization } from "@/components/dashboard/organization-store"
import { useCurrentProject, useProjectAccess } from "@/components/dashboard/project-shell"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { assignableRoles, type ProjectMember } from "@/lib/project-types"
import { useClientPagination } from "@/lib/use-client-pagination"
import { initials } from "@/lib/work-utils"

const roleHint: Record<ProjectMember["role"], string> = {
  Owner: "Full control",
  Admin: "Manage issues, members, settings",
  Member: "Create, update, and comment on issues",
  Viewer: "Read-only",
}

export default function ProjectMembersPage() {
  const project = useCurrentProject()
  const { canManage } = useProjectAccess()
  const { inviteMember, updateMemberRole, removeMember } = useProjectWorkspace()
  const { employees } = useOrganization()
  const [personId, setPersonId] = useState("")
  const [role, setRole] = useState<ProjectMember["role"]>("Member")
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const onProjectEmails = useMemo(
    () => new Set(project.members.map((member) => member.email.toLowerCase())),
    [project.members]
  )

  const availablePeople = useMemo(
    () =>
      employees.filter(
        (person) =>
          person.status !== "Suspended" &&
          Boolean(person.email) &&
          !onProjectEmails.has(person.email.toLowerCase())
      ),
    [employees, onProjectEmails]
  )

  const personOptions = useMemo(
    () =>
      availablePeople.map(
        (person) => [person.id, `${person.name} · ${person.email}`] as const
      ),
    [availablePeople]
  )

  useEffect(() => {
    if (!personOptions.length) {
      setPersonId("")
      return
    }
    if (!personOptions.some(([id]) => id === personId)) {
      setPersonId(personOptions[0][0])
    }
  }, [personOptions, personId])

  const members = useMemo(
    () => [...project.members].sort((a, b) => a.name.localeCompare(b.name)),
    [project.members]
  )
  const pagination = useClientPagination(members, { resetKey: members.length })

  async function addMember() {
    const person = availablePeople.find((item) => item.id === personId)
    if (!person) {
      setResult({ ok: false, message: "Select a person from your organization." })
      return
    }
    const next = await inviteMember(project.id, person.email, role, person.name)
    setResult(next)
  }

  return (
    <div className="max-w-4xl space-y-4">
      {canManage ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault()
            void addMember()
          }}
        >
          {personOptions.length ? (
            <KeyedSelect
              className="w-full min-w-0 sm:flex-1"
              value={personId}
              onChange={setPersonId}
              options={personOptions}
            />
          ) : (
            <p className="flex-1 text-sm text-muted-foreground">
              All organization people are already on this project.
            </p>
          )}
          <div className="sm:w-36">
            <OptionSelect value={role} options={assignableRoles} onChange={setRole} />
          </div>
          <Button type="submit" disabled={!personId}>
            Add member
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only owners and admins can invite or change members.
        </p>
      )}
      {result ? (
        <p className={cn("text-sm", result.ok ? "text-muted-foreground" : "text-destructive")}>
          {result.message}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pageItems.map((member) => (
              <TableRow key={member.email}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(member.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {member.role === "Owner" || !canManage ? (
                    <span className="text-sm">{member.role}</span>
                  ) : (
                    <div className="w-32">
                      <OptionSelect
                        value={member.role}
                        options={assignableRoles}
                        onChange={(value) => void updateMemberRole(project.id, member.email, value)}
                      />
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">{roleHint[member.role]}</p>
                </TableCell>
                <TableCell>
                  {member.status === "Invited" ? (
                    <Badge variant="outline">Invited {member.invitedAt}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Active</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {member.role !== "Owner" && canManage ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${member.name}`}
                      onClick={() => void removeMember(project.id, member.email)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
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
    </div>
  )
}
