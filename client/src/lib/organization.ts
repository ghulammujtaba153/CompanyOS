import { controllableHrefs, sectionHrefs } from "@/lib/navigation"

export type AccessRole = "Owner" | "Admin" | "Manager" | "Member"

export type EmployeeStatus = "Active" | "Invited" | "Suspended"

export type Employee = {
  id: string
  name: string
  email: string
  /** Job title, e.g. "Engineering Manager". Separate from the access role. */
  title: string
  departmentId: string
  managerId: string
  accessRole: AccessRole
  status: EmployeeStatus
  /** ISO date the person joined or was invited. */
  since: string
}

export type Department = {
  id: string
  name: string
  description: string
  /** Employee id of the department head, or "" when vacant. */
  headId: string
}

export const accessRoles: AccessRole[] = ["Owner", "Admin", "Manager", "Member"]

export const accessRoleSummary: Record<AccessRole, string> = {
  Owner: "Full control, including billing and security",
  Admin: "Manages people, departments, and platform access",
  Manager: "Runs projects and approves requests for their team",
  Member: "Works on assigned projects and submits requests",
}

export type PermissionRow = { area: string; capability: string; roles: AccessRole[] }

/** Default permission matrix — orgs can customize and persist their own copy. */
export const permissionMatrix: PermissionRow[] = [
  { area: "Workspace", capability: "Billing, security & SSO", roles: ["Owner"] },
  { area: "Workspace", capability: "Transfer ownership", roles: ["Owner"] },
  { area: "People", capability: "Invite & remove people", roles: ["Owner", "Admin"] },
  { area: "People", capability: "Change access roles", roles: ["Owner", "Admin"] },
  { area: "People", capability: "Manage departments", roles: ["Owner", "Admin"] },
  { area: "People", capability: "View directory", roles: ["Owner", "Admin", "Manager", "Member"] },
  { area: "Clients", capability: "Manage clients & engagements", roles: ["Owner", "Admin"] },
  { area: "Clients", capability: "Promote engagements to Work Management", roles: ["Owner", "Admin"] },
  { area: "Work", capability: "Create projects", roles: ["Owner", "Admin", "Manager"] },
  { area: "Work", capability: "Work on assigned projects", roles: ["Owner", "Admin", "Manager", "Member"] },
  { area: "Governance", capability: "Approve requests", roles: ["Owner", "Admin", "Manager"] },
  { area: "Governance", capability: "Configure agents & autonomy", roles: ["Owner", "Admin"] },
]

export function canManagePeople(role: AccessRole | undefined) {
  return role === "Owner" || role === "Admin"
}

export const seedDepartments: Department[] = [
  { id: "dep-leadership", name: "Leadership", description: "Sets company direction", headId: "emp-ghulam" },
  { id: "dep-engineering", name: "Engineering", description: "Builds products and internal systems", headId: "emp-maya" },
  { id: "dep-people", name: "People Operations", description: "Employee experience and hiring", headId: "emp-olivia" },
  { id: "dep-revenue", name: "Revenue", description: "Growth and customer relationships", headId: "emp-samuel" },
  { id: "dep-operations", name: "Operations", description: "Systems, vendors, and delivery", headId: "" },
  { id: "dep-finance", name: "Finance", description: "Company financial operations", headId: "" },
]

export const seedEmployees: Employee[] = [
  {
    id: "emp-ghulam",
    name: "Ghulam Ahmed",
    email: "ghulam@acmelabs.io",
    title: "Founder & CEO",
    departmentId: "dep-leadership",
    managerId: "",
    accessRole: "Owner",
    status: "Active",
    since: "2025-01-06",
  },
  {
    id: "emp-maya",
    name: "Maya Patel",
    email: "maya@acmelabs.io",
    title: "Engineering Manager",
    departmentId: "dep-engineering",
    managerId: "emp-ghulam",
    accessRole: "Admin",
    status: "Active",
    since: "2025-02-17",
  },
  {
    id: "emp-olivia",
    name: "Olivia Chen",
    email: "olivia@acmelabs.io",
    title: "HR Lead",
    departmentId: "dep-people",
    managerId: "emp-ghulam",
    accessRole: "Admin",
    status: "Active",
    since: "2025-03-03",
  },
  {
    id: "emp-samuel",
    name: "Samuel Davis",
    email: "samuel@acmelabs.io",
    title: "Account Executive",
    departmentId: "dep-revenue",
    managerId: "emp-ghulam",
    accessRole: "Manager",
    status: "Active",
    since: "2025-05-12",
  },
  {
    id: "emp-daniel",
    name: "Daniel Okafor",
    email: "daniel@acmelabs.io",
    title: "Software Engineer",
    departmentId: "dep-engineering",
    managerId: "emp-maya",
    accessRole: "Member",
    status: "Active",
    since: "2025-08-25",
  },
  {
    id: "emp-lena",
    name: "Lena Fischer",
    email: "lena@acmelabs.io",
    title: "Finance Analyst",
    departmentId: "dep-finance",
    managerId: "emp-ghulam",
    accessRole: "Member",
    status: "Suspended",
    since: "2025-06-02",
  },
  {
    id: "emp-aisha",
    name: "Aisha Khan",
    email: "aisha@acmelabs.io",
    title: "Software Engineer",
    departmentId: "dep-engineering",
    managerId: "emp-maya",
    accessRole: "Member",
    status: "Invited",
    since: "2026-05-03",
  },
]

/** Sidebar hrefs a department can open. Owners and Admins always see everything. */
export type DepartmentAccess = Record<string, string[]>

/** What a brand-new department starts with. */
export const baselineAccess = [
  ...sectionHrefs("/dashboard/work-management"),
  ...sectionHrefs("/dashboard/communications"),
  ...sectionHrefs("/dashboard/documents"),
  ...sectionHrefs("/dashboard/analytics"),
  ...sectionHrefs("/dashboard/subscription"),
]

const grant = (...sections: string[]) =>
  Array.from(new Set([...baselineAccess, ...sections.flatMap(sectionHrefs)]))

export const seedDepartmentAccess: DepartmentAccess = {
  "dep-leadership": grant(...controllableHrefs),
  "dep-engineering": grant(
    "/dashboard/ai-automation",
    "/dashboard/ai-workforce",
    "/dashboard/processes",
    "/dashboard/integrations"
  ),
  "dep-people": grant(
    "/dashboard/organization",
    "/dashboard/people-operations",
    "/dashboard/approvals",
    "/dashboard/ai-automation",
    "/dashboard/company-brain"
  ),
  "dep-revenue": grant("/dashboard/analytics", "/dashboard/clients", "/dashboard/finance"),
  "dep-operations": grant(
    "/dashboard/ai-automation",
    "/dashboard/processes",
    "/dashboard/integrations",
    "/dashboard/governance",
    "/dashboard/approvals"
  ),
  "dep-finance": grant(
    "/dashboard/approvals",
    "/dashboard/analytics",
    "/dashboard/finance",
    "/dashboard/clients",
    "/dashboard/ai-automation"
  ),
}
