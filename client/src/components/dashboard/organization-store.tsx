"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { useAuth } from "@/components/auth/auth-provider"
import { ApiError } from "@/lib/api"
import { alwaysAllowedRoutes, controllableHrefs, navHrefForPath, navItems } from "@/lib/navigation"
import {
  baselineAccess,
  canManagePeople,
  permissionMatrix,
  seedDepartmentAccess,
  seedDepartments,
  seedEmployees,
  type AccessRole,
  type Department,
  type DepartmentAccess,
  type Employee,
  type EmployeeStatus,
  type PermissionRow,
} from "@/lib/organization"
import {
  orgApi,
  type Me,
  type Member,
  type OrgDepartment,
  type OrgMemberRole,
  type RolePermissionRow,
} from "@/lib/auth-api"
import { currentUser } from "@/lib/project-types"

function mapRole(role: OrgMemberRole): AccessRole {
  if (role === "owner") return "Owner"
  if (role === "admin") return "Admin"
  if (role === "manager") return "Manager"
  return "Member"
}

/** Build a directory person from the JWT session when members haven't loaded yet. */
function employeeFromAuth(authMe: Me, activeOrgId: string | null): Employee | undefined {
  const membership =
    authMe.memberships.find(
      (item) => item.organization_id === activeOrgId && item.status === "active"
    ) ?? authMe.memberships.find((item) => item.status === "active")
  if (!membership && authMe.primary_role !== "platform_admin") return undefined
  const role: AccessRole =
    authMe.primary_role === "platform_admin"
      ? "Owner"
      : membership
        ? mapRole(membership.role)
        : "Member"
  return {
    id: membership?.id ?? authMe.id,
    name: authMe.full_name,
    email: authMe.email.toLowerCase(),
    title: membership?.title || role,
    departmentId: "",
    managerId: "",
    accessRole: role,
    status: membership ? mapStatus(membership.status) : "Active",
    since: authMe.created_at.slice(0, 10),
  }
}

function toApiRole(role: AccessRole): OrgMemberRole {
  if (role === "Owner") return "owner"
  if (role === "Admin") return "admin"
  if (role === "Manager") return "manager"
  return "member"
}

function mapStatus(status: Member["status"]): EmployeeStatus {
  if (status === "invited") return "Invited"
  if (status === "suspended") return "Suspended"
  return "Active"
}

function toApiStatus(status: EmployeeStatus): Member["status"] {
  if (status === "Invited") return "invited"
  if (status === "Suspended") return "suspended"
  return "active"
}

function apiDepartmentsToLocal(rows: OrgDepartment[]): {
  departments: Department[]
  access: DepartmentAccess
} {
  const departments = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    headId: row.head_member_id ?? "",
  }))
  const access: DepartmentAccess = {}
  for (const row of rows) {
    access[row.id] = row.access_hrefs?.length ? [...row.access_hrefs] : [...baselineAccess]
  }
  return { departments, access }
}

function membersToEmployees(members: Member[], departments: Department[]): Employee[] {
  const byName = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]))
  const fallback = departments[0]?.id ?? ""
  return members.map((member) => ({
    id: member.id,
    name: member.full_name,
    email: member.email,
    title: member.title || member.role,
    departmentId:
      member.department_id ||
      byName.get((member.department || "").toLowerCase()) ||
      fallback,
    managerId: member.manager_id ?? "",
    accessRole: mapRole(member.role),
    status: mapStatus(member.status),
    since: member.joined_at.slice(0, 10),
  }))
}

type Result = { ok: true; message?: string; id?: string } | { ok: false; message: string }

export type EmployeeInput = Pick<
  Employee,
  "name" | "email" | "title" | "departmentId" | "managerId" | "accessRole"
> & {
  /** When set, provisions an active login immediately (no email). Prefer inviteEmployee. */
  password?: string
}

type OrganizationValue = {
  employees: Employee[]
  departments: Department[]
  rolePermissions: PermissionRow[]
  loading: boolean
  me: Employee | undefined
  getEmployee: (id: string) => Employee | undefined
  getDepartment: (id: string) => Department | undefined
  /** Email invite — recipient registers or signs in via /invite/{token}. */
  inviteEmployee: (input: EmployeeInput) => Promise<Result>
  /** Direct provision with password (no email). */
  addEmployee: (input: EmployeeInput) => Promise<Result>
  updateEmployee: (id: string, input: EmployeeInput) => Promise<Result>
  setEmployeeStatus: (id: string, status: Employee["status"]) => Promise<Result>
  removeEmployee: (id: string) => Promise<Result>
  saveDepartment: (
    input: Omit<Department, "id"> & { id?: string },
    /** New departments only: copy sidebar access from this department instead of the baseline. */
    copyAccessFrom?: string
  ) => Promise<Result>
  deleteDepartment: (id: string) => Promise<Result>
  /** Sidebar hrefs (sections + sub-items) a department may open. */
  getDepartmentAccess: (departmentId: string) => string[]
  /** Replace a department's access with a validated list of hrefs. */
  setDepartmentAccess: (departmentId: string, hrefs: string[]) => Promise<void>
  /** Grant or revoke a workspace capability for a role (Owner/Admin only). */
  toggleRolePermission: (capability: string, role: AccessRole) => Promise<Result>
  roleHasPermission: (capability: string, role: AccessRole | undefined) => boolean
  /** Whether the signed-in user may open this sidebar href / pathname. */
  canAccess: (hrefOrPath: string) => boolean
  /** Admin tool: see the sidebar exactly as a department sees it. */
  previewDepartmentId: string | null
  setPreviewDepartmentId: (departmentId: string | null) => void
  refreshOrganization: () => Promise<void>
}

function normalizeRolePermissions(rows?: RolePermissionRow[] | null): PermissionRow[] {
  if (!rows?.length) return permissionMatrix.map((row) => ({ ...row, roles: [...row.roles] }))
  return rows.map((row) => ({
    area: row.area,
    capability: row.capability,
    roles: [...row.roles] as AccessRole[],
  }))
}

const OrganizationContext = createContext<OrganizationValue | null>(null)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.detail || fallback
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { me: authMe, activeOrgId, isAuthenticated } = useAuth()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [access, setAccess] = useState<DepartmentAccess>({})
  const [rolePermissions, setRolePermissions] = useState<PermissionRow[]>(() =>
    normalizeRolePermissions()
  )
  const [previewDepartmentId, setPreviewDepartmentId] = useState<string | null>(null)
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [loading, setLoading] = useState(useApi)
  const sessionEmail = (authMe?.email ?? currentUser.email).toLowerCase()

  const refreshOrganization = useCallback(async () => {
    if (!isAuthenticated || !activeOrgId) return
    setLoading(true)
    try {
      const [org, memberRows, departmentRows] = await Promise.all([
        orgApi.get(activeOrgId),
        orgApi.members(activeOrgId),
        orgApi.departments(activeOrgId),
      ])
      const mapped = apiDepartmentsToLocal(departmentRows)
      setDepartments(mapped.departments)
      setAccess(mapped.access)
      setEmployees(membersToEmployees(memberRows, mapped.departments))
      setRolePermissions(normalizeRolePermissions(org.role_permissions))
    } catch {
      /* keep current directory if API unavailable — auth fallback still unlocks nav */
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, activeOrgId])

  useEffect(() => {
    if (!useApi) {
      // Offline / demo only when there is no authenticated org session.
      setEmployees(seedEmployees)
      setDepartments(seedDepartments)
      setAccess(seedDepartmentAccess)
      setRolePermissions(normalizeRolePermissions())
      return
    }
    void refreshOrganization()
  }, [useApi, refreshOrganization])

  const value = useMemo<OrganizationValue>(() => {
    const directoryMe = employees.find(
      (employee) => employee.email.toLowerCase() === sessionEmail
    )
    const me =
      directoryMe ?? (authMe ? employeeFromAuth(authMe, activeOrgId) : undefined)
    const activeOwners = employees.filter(
      (employee) => employee.accessRole === "Owner" && employee.status === "Active"
    )
    const isLastOwner = (employee: Employee) =>
      employee.accessRole === "Owner" && activeOwners.length <= 1

    function validate(input: EmployeeInput, id?: string): Result {
      if (!input.name.trim()) return { ok: false, message: "Name is required." }
      const email = input.email.trim().toLowerCase()
      if (!EMAIL.test(email)) return { ok: false, message: "Enter a valid work email." }
      if (employees.some((employee) => employee.email === email && employee.id !== id)) {
        return { ok: false, message: `${email} is already in the directory.` }
      }
      if (!departments.some((department) => department.id === input.departmentId)) {
        return { ok: false, message: "Choose a department." }
      }
      if (id && input.managerId) {
        let cursor: string | undefined = input.managerId
        while (cursor) {
          if (cursor === id) return { ok: false, message: "That manager reports to this person." }
          cursor = employees.find((employee) => employee.id === cursor)?.managerId
        }
      }
      return { ok: true }
    }

    async function inviteEmployee(input: EmployeeInput): Promise<Result> {
      const check = validate(input)
      if (!check.ok) return check
      const email = input.email.trim().toLowerCase()
      const department = departments.find((d) => d.id === input.departmentId)

      if (useApi && activeOrgId) {
        try {
          const invite = await orgApi.invite(activeOrgId, {
            email,
            full_name: input.name.trim(),
            role: input.accessRole === "Owner" ? "admin" : toApiRole(input.accessRole),
            title: input.title.trim(),
            department: department?.name ?? "",
            department_id: input.departmentId,
            manager_id: input.managerId || null,
          })
          await refreshOrganization()
          const mailNote = invite.email_sent
            ? `Invite emailed to ${email}.`
            : invite.email_detail || `Invite created — share ${invite.invite_url_path}`
          return {
            ok: true,
            message: mailNote,
            id: invite.member_id ?? invite.id,
          }
        } catch (err) {
          return { ok: false, message: errorMessage(err, "Could not send invite.") }
        }
      }

      const id = `emp-${Date.now()}`
      setEmployees((current) => [
        ...current,
        {
          ...input,
          id,
          name: input.name.trim(),
          email,
          title: input.title.trim(),
          status: "Invited",
          since: todayIso(),
        },
      ])
      return { ok: true, message: `Invite queued for ${email}.`, id }
    }

    async function addEmployee(input: EmployeeInput): Promise<Result> {
      const check = validate(input)
      if (!check.ok) return check
      const password = (input.password ?? "").trim()
      if (password.length < 6) {
        return { ok: false, message: "Password must be at least 6 characters." }
      }
      const email = input.email.trim().toLowerCase()
      const department = departments.find((d) => d.id === input.departmentId)

      if (useApi && activeOrgId) {
        try {
          const member = await orgApi.addMember(activeOrgId, {
            email,
            full_name: input.name.trim(),
            password,
            role: input.accessRole === "Owner" ? "admin" : toApiRole(input.accessRole),
            title: input.title.trim(),
            department: department?.name ?? "",
            department_id: input.departmentId,
            manager_id: input.managerId || null,
          })
          await refreshOrganization()
          return {
            ok: true,
            message: `${input.name.trim()} added — they can sign in with ${email}.`,
            id: member.id,
          }
        } catch (err) {
          return { ok: false, message: errorMessage(err, "Could not add user.") }
        }
      }

      const id = `emp-${Date.now()}`
      setEmployees((current) => [
        ...current,
        {
          ...input,
          id,
          name: input.name.trim(),
          email,
          title: input.title.trim(),
          status: "Active",
          since: todayIso(),
        },
      ])
      return { ok: true, message: `${input.name.trim()} added.`, id }
    }

    function roleHasPermission(capability: string, role: AccessRole | undefined) {
      if (!role) return false
      const row = rolePermissions.find((item) => item.capability === capability)
      return Boolean(row?.roles.includes(role))
    }

    async function toggleRolePermission(capability: string, role: AccessRole): Promise<Result> {
      if (!canManagePeople(me?.accessRole)) {
        return { ok: false, message: "Only Owners and Admins can change role permissions." }
      }
      // Owner must keep billing / ownership transfer.
      if (
        role === "Owner" &&
        (capability === "Billing, security & SSO" || capability === "Transfer ownership")
      ) {
        return { ok: false, message: "Owner always keeps this capability." }
      }

      const next = rolePermissions.map((row) => {
        if (row.capability !== capability) return row
        const has = row.roles.includes(role)
        return {
          ...row,
          roles: has ? row.roles.filter((item) => item !== role) : [...row.roles, role],
        }
      })
      setRolePermissions(next)

      if (useApi && activeOrgId) {
        try {
          const org = await orgApi.update(activeOrgId, {
            role_permissions: next.map((row) => ({
              area: row.area,
              capability: row.capability,
              roles: row.roles,
            })),
          })
          setRolePermissions(normalizeRolePermissions(org.role_permissions))
          return { ok: true, message: "Access updated." }
        } catch (err) {
          setRolePermissions(rolePermissions)
          return { ok: false, message: errorMessage(err, "Could not save access.") }
        }
      }
      return { ok: true, message: "Access updated." }
    }

    return {
      employees,
      departments,
      rolePermissions,
      loading,
      me,
      getEmployee: (id) => employees.find((employee) => employee.id === id),
      getDepartment: (id) => departments.find((department) => department.id === id),
      refreshOrganization,
      addEmployee,
      inviteEmployee,
      toggleRolePermission,
      roleHasPermission,

      async updateEmployee(id, input) {
        const employee = employees.find((item) => item.id === id)
        if (!employee) return { ok: false, message: "Person not found." }
        const check = validate(input, id)
        if (!check.ok) return check
        if (input.accessRole !== employee.accessRole) {
          if (employee.id === me?.id) {
            return { ok: false, message: "You can't change your own access role." }
          }
          if (isLastOwner(employee)) {
            return { ok: false, message: "Assign another Owner before changing this role." }
          }
        }

        const department = departments.find((d) => d.id === input.departmentId)

        if (useApi && activeOrgId) {
          try {
            await orgApi.updateMember(activeOrgId, id, {
              full_name: input.name.trim(),
              title: input.title.trim(),
              role: toApiRole(input.accessRole),
              department: department?.name ?? "",
              department_id: input.departmentId,
              manager_id: input.managerId || null,
            })
            await refreshOrganization()
            return { ok: true, message: "Changes saved." }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not save changes.") }
          }
        }

        setEmployees((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...input,
                  name: input.name.trim(),
                  email: input.email.trim().toLowerCase(),
                  title: input.title.trim(),
                }
              : item
          )
        )
        return { ok: true, message: "Changes saved." }
      },

      async setEmployeeStatus(id, status) {
        const employee = employees.find((item) => item.id === id)
        if (!employee) return { ok: false, message: "Person not found." }
        if (status === "Suspended") {
          if (employee.id === me?.id) return { ok: false, message: "You can't suspend yourself." }
          if (isLastOwner(employee)) {
            return { ok: false, message: "The only Owner can't be suspended." }
          }
        }

        if (useApi && activeOrgId) {
          try {
            await orgApi.updateMember(activeOrgId, id, { status: toApiStatus(status) })
            await refreshOrganization()
            return { ok: true }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not update status.") }
          }
        }

        setEmployees((current) =>
          current.map((item) => (item.id === id ? { ...item, status } : item))
        )
        return { ok: true }
      },

      async removeEmployee(id) {
        const employee = employees.find((item) => item.id === id)
        if (!employee) return { ok: false, message: "Person not found." }
        if (employee.id === me?.id) return { ok: false, message: "You can't remove yourself." }
        if (isLastOwner(employee)) return { ok: false, message: "The only Owner can't be removed." }

        if (useApi && activeOrgId) {
          try {
            await orgApi.removeMember(activeOrgId, id)
            await refreshOrganization()
            return { ok: true, message: `${employee.name} was removed.` }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not remove person.") }
          }
        }

        setEmployees((current) =>
          current
            .filter((item) => item.id !== id)
            .map((item) => (item.managerId === id ? { ...item, managerId: "" } : item))
        )
        setDepartments((current) =>
          current.map((item) => (item.headId === id ? { ...item, headId: "" } : item))
        )
        return { ok: true, message: `${employee.name} was removed.` }
      },

      async saveDepartment(input, copyAccessFrom) {
        const name = input.name.trim()
        if (!name) return { ok: false, message: "Department name is required." }
        if (
          departments.some(
            (item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== input.id
          )
        ) {
          return { ok: false, message: `${name} already exists.` }
        }

        if (useApi && activeOrgId) {
          try {
            if (input.id) {
              await orgApi.updateDepartment(activeOrgId, input.id, {
                name,
                description: input.description.trim(),
                head_member_id: input.headId || null,
              })
            } else {
              await orgApi.createDepartment(activeOrgId, {
                name,
                description: input.description.trim(),
                head_member_id: input.headId || null,
                copy_access_from: copyAccessFrom || null,
                access_hrefs: copyAccessFrom ? undefined : [...baselineAccess],
              })
            }
            await refreshOrganization()
            return { ok: true }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not save department.") }
          }
        }

        const department = { ...input, name, description: input.description.trim() }
        if (input.id) {
          setDepartments((current) =>
            current.map((item) => (item.id === input.id ? { ...item, ...department } : item))
          )
        } else {
          const id = `dep-${Date.now()}`
          setDepartments((current) => [...current, { ...department, id }])
          setAccess((current) => ({
            ...current,
            [id]: copyAccessFrom ? [...(current[copyAccessFrom] ?? [])] : [...baselineAccess],
          }))
        }
        return { ok: true }
      },

      async deleteDepartment(id) {
        const count = employees.filter((employee) => employee.departmentId === id).length
        if (count) {
          return {
            ok: false,
            message: `Move its ${count} ${count === 1 ? "person" : "people"} to another department first.`,
          }
        }

        if (useApi && activeOrgId) {
          try {
            await orgApi.deleteDepartment(activeOrgId, id)
            await refreshOrganization()
            return { ok: true }
          } catch (err) {
            return { ok: false, message: errorMessage(err, "Could not delete department.") }
          }
        }

        setDepartments((current) => current.filter((item) => item.id !== id))
        setAccess((current) => {
          const next = { ...current }
          delete next[id]
          return next
        })
        return { ok: true }
      },

      getDepartmentAccess(departmentId) {
        return access[departmentId] ?? []
      },

      async setDepartmentAccess(departmentId, hrefs) {
        if (!departments.some((department) => department.id === departmentId)) return
        const valid = Array.from(new Set(hrefs.filter((href) => controllableHrefs.includes(href))))
        setAccess((current) => ({ ...current, [departmentId]: valid }))

        if (useApi && activeOrgId) {
          try {
            await orgApi.updateDepartment(activeOrgId, departmentId, { access_hrefs: valid })
          } catch {
            /* keep local draft; next refresh will correct */
          }
        }
      },

      canAccess(hrefOrPath) {
        if (alwaysAllowedRoutes.includes(hrefOrPath)) return true
        const lockedItem = navItems.find((item) => item.href === hrefOrPath && item.locked)
        if (lockedItem) return true
        if (!me || me.status === "Suspended") return false
        const preview = previewDepartmentId && departments.some((d) => d.id === previewDepartmentId)
        // Owners/admins (and auth fallback before directory loads) see the full sidebar.
        if (!preview && canManagePeople(me.accessRole)) return true
        const href = navHrefForPath(hrefOrPath)
        if (!href) return true
        // Auth-only me has no department yet — don't hide the whole product.
        if (!me.departmentId && !preview) return true
        const granted = access[preview ? previewDepartmentId! : me.departmentId] ?? []
        const section = navItems.find(
          (item) => !item.locked && (href === item.href || href.startsWith(`${item.href}/`))
        )
        return granted.includes(href) && (!section || granted.includes(section.href))
      },

      previewDepartmentId,
      setPreviewDepartmentId,
    }
  }, [
    employees,
    departments,
    access,
    rolePermissions,
    previewDepartmentId,
    sessionEmail,
    authMe,
    useApi,
    activeOrgId,
    loading,
    refreshOrganization,
  ])

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) throw new Error("useOrganization must be used within OrganizationProvider")
  return context
}
