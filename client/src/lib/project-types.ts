export type ProjectMember = {
  email: string
  name: string
  role: "Owner" | "Admin" | "Member" | "Viewer"
  status: "Active" | "Invited"
  invitedAt?: string
}

export type IssueComment = {
  id: string
  author: string
  initials: string
  body: string
  createdAt: string
}

export type IssueActivity = {
  id: string
  actor: string
  action: string
  createdAt: string
}

export type Project = {
  id: string
  key: string
  name: string
  team: string
  description: string
  /** ISO date (yyyy-mm-dd) or empty when not scheduled */
  due: string
  status: "Active" | "On hold" | "Completed"
  visibility: "Private" | "Company"
  createdAt: string
  members: ProjectMember[]
  /** Optional link back to Clients pipeline */
  clientId?: string
  clientEngagementId?: string
}

export type ProjectIssue = {
  id: string
  projectId: string
  title: string
  description: string
  priority: "Critical" | "High" | "Medium" | "Low"
  status: "Backlog" | "To do" | "In progress" | "In review" | "Blocked" | "Done"
  type: "Epic" | "Story" | "Bug" | "Task" | "Ticket"
  labels: string[]
  assignee: string
  reporter: string
  estimate: string
  /** ISO date (yyyy-mm-dd) or empty when not scheduled */
  dueDate: string
  createdAt: string
  updatedAt: string
  comments: IssueComment[]
  activity: IssueActivity[]
}

export const issueStatuses: ProjectIssue["status"][] = [
  "Backlog",
  "To do",
  "In progress",
  "In review",
  "Blocked",
  "Done",
]

export const issuePriorities: ProjectIssue["priority"][] = ["Critical", "High", "Medium", "Low"]

export const issueTypes: ProjectIssue["type"][] = ["Ticket", "Bug", "Task", "Story", "Epic"]

export const projectStatuses: Project["status"][] = ["Active", "On hold", "Completed"]

export const assignableRoles: ProjectMember["role"][] = ["Admin", "Member", "Viewer"]

export const UNASSIGNED = "Unassigned"

export function canEditIssues(role: ProjectMember["role"] | undefined) {
  return role === "Owner" || role === "Admin" || role === "Member"
}

export function canManageProject(role: ProjectMember["role"] | undefined) {
  return role === "Owner" || role === "Admin"
}

/** Signed-in user. Replace with the session user once auth is wired up. */
export const currentUser = {
  name: "Ghulam Ahmed",
  email: "ghulam@acmelabs.io",
  initials: "GA",
}

export const seedProjects: Project[] = [
  {
    id: "proj-companyos",
    key: "COS",
    name: "CompanyOS MVP",
    team: "Product",
    description:
      "Ship the first CompanyOS operating layer for demos and pilots, including projects, issues, governance, and communications.",
    due: "2026-05-28",
    status: "Active",
    visibility: "Company",
    createdAt: "Apr 02, 2026",
    members: [
      { email: "ghulam@acmelabs.io", name: "Ghulam Ahmed", role: "Owner", status: "Active" },
      { email: "maya@acmelabs.io", name: "Maya Patel", role: "Admin", status: "Active" },
      { email: "olivia@acmelabs.io", name: "Olivia Chen", role: "Member", status: "Active" },
      { email: "daniel@acmelabs.io", name: "Daniel Okafor", role: "Member", status: "Active" },
      {
        email: "aisha@acmelabs.io",
        name: "Aisha Khan",
        role: "Viewer",
        status: "Invited",
        invitedAt: "May 03, 2026",
      },
    ],
  },
  {
    id: "proj-hiring",
    key: "HIR",
    name: "Hiring automation",
    team: "People Operations",
    description: "Automate sourcing, screening, interview coordination, and offer approvals.",
    due: "2026-05-17",
    status: "Active",
    visibility: "Private",
    createdAt: "Mar 18, 2026",
    members: [
      { email: "olivia@acmelabs.io", name: "Olivia Chen", role: "Owner", status: "Active" },
      { email: "maya@acmelabs.io", name: "Maya Patel", role: "Member", status: "Active" },
      {
        email: "ghulam@acmelabs.io",
        name: "Ghulam Ahmed",
        role: "Member",
        status: "Invited",
        invitedAt: "May 02, 2026",
      },
    ],
  },
  {
    id: "proj-security",
    key: "SEC",
    name: "Security baseline",
    team: "Operations",
    description: "Establish access, audit, and approval security controls across the company OS.",
    due: "2026-06-28",
    status: "On hold",
    visibility: "Private",
    createdAt: "Apr 11, 2026",
    members: [
      { email: "ghulam@acmelabs.io", name: "Ghulam Ahmed", role: "Owner", status: "Active" },
    ],
  },
  {
    // Signed-in user is not a member — must not appear anywhere in the UI.
    id: "proj-marketing",
    key: "MKT",
    name: "Marketing site refresh",
    team: "Marketing",
    description: "Redesign the public website and pricing page.",
    due: "2026-07-15",
    status: "Active",
    visibility: "Private",
    createdAt: "Apr 15, 2026",
    members: [
      { email: "maya@acmelabs.io", name: "Maya Patel", role: "Owner", status: "Active" },
    ],
  },
]

export const seedIssues: ProjectIssue[] = [
  {
    id: "COS-142",
    projectId: "proj-companyos",
    title: "Add SSO to employee portal",
    description:
      "Implement CompanyOS single sign-on for employee login. Must support forced logout, session expiry, and audit logging for governance.",
    priority: "High",
    status: "In progress",
    type: "Story",
    labels: ["security", "auth", "mvp"],
    assignee: "Maya Patel",
    reporter: "Olivia Chen",
    estimate: "5d",
    dueDate: "2026-05-12",
    createdAt: "Apr 20, 2026",
    updatedAt: "May 04, 2026",
    comments: [
      {
        id: "c1",
        author: "Maya Patel",
        initials: "MP",
        body: "OAuth consent screen is ready. Next step is callback handling and session cookies.",
        createdAt: "May 03, 2026 · 4:20 PM",
      },
      {
        id: "c2",
        author: "Ghulam Ahmed",
        initials: "GA",
        body: "Please keep payroll scopes out of the SSO app. Decision firewall should still own sensitive actions.",
        createdAt: "May 03, 2026 · 5:01 PM",
      },
    ],
    activity: [
      { id: "a1", actor: "Olivia Chen", action: "created this issue", createdAt: "Apr 20, 2026" },
      { id: "a2", actor: "Maya Patel", action: "moved status to In progress", createdAt: "May 01, 2026" },
      { id: "a3", actor: "Maya Patel", action: "added label security", createdAt: "May 02, 2026" },
    ],
  },
  {
    id: "COS-156",
    projectId: "proj-companyos",
    title: "Channel notifications for offer approvals",
    description:
      "When an offer needs approval, post a structured message in #approvals with Approve / Decline actions.",
    priority: "Medium",
    status: "In review",
    type: "Story",
    labels: ["communications", "approvals"],
    assignee: "Olivia Chen",
    reporter: "Maya Patel",
    estimate: "3d",
    dueDate: "2026-05-10",
    createdAt: "Apr 24, 2026",
    updatedAt: "May 04, 2026",
    comments: [
      {
        id: "c3",
        author: "Olivia Chen",
        initials: "OC",
        body: "Draft message template is ready. Waiting on risk score badge from governance.",
        createdAt: "May 04, 2026 · 11:12 AM",
      },
    ],
    activity: [
      { id: "a4", actor: "Maya Patel", action: "created this issue", createdAt: "Apr 24, 2026" },
      { id: "a5", actor: "Olivia Chen", action: "moved status to In review", createdAt: "May 04, 2026" },
    ],
  },
  {
    id: "COS-188",
    projectId: "proj-companyos",
    title: "Project invite email template",
    description: "Create the transactional email copy and acceptance flow for project invites.",
    priority: "Low",
    status: "Backlog",
    type: "Task",
    labels: ["growth", "email"],
    assignee: "Unassigned",
    reporter: "Ghulam Ahmed",
    estimate: "1d",
    dueDate: "2026-05-20",
    createdAt: "May 01, 2026",
    updatedAt: "May 01, 2026",
    comments: [],
    activity: [
      { id: "a6", actor: "Ghulam Ahmed", action: "created this issue", createdAt: "May 01, 2026" },
    ],
  },
  {
    id: "COS-195",
    projectId: "proj-companyos",
    title: "Employee directory profile sheet",
    description:
      "Build the admin employee profile preview with compensation, leave, projects, and tickets.",
    priority: "High",
    status: "In progress",
    type: "Story",
    labels: ["people", "admin"],
    assignee: "Daniel Okafor",
    reporter: "Maya Patel",
    estimate: "3d",
    dueDate: "2026-05-22",
    createdAt: "May 03, 2026",
    updatedAt: "May 05, 2026",
    comments: [],
    activity: [
      { id: "a6b", actor: "Maya Patel", action: "created this issue", createdAt: "May 03, 2026" },
      { id: "a6c", actor: "Daniel Okafor", action: "moved status to In progress", createdAt: "May 05, 2026" },
    ],
  },
  {
    id: "COS-201",
    projectId: "proj-companyos",
    title: "Broken issue filter on mobile",
    description: "Priority filter chips overflow and become untappable under 390px width.",
    priority: "Critical",
    status: "Blocked",
    type: "Bug",
    labels: ["bug", "mobile"],
    assignee: "Maya Patel",
    reporter: "Aisha Khan",
    estimate: "1d",
    dueDate: "2026-05-06",
    createdAt: "May 02, 2026",
    updatedAt: "May 04, 2026",
    comments: [
      {
        id: "c4",
        author: "Maya Patel",
        initials: "MP",
        body: "Blocked on design token update for chip wrapping.",
        createdAt: "May 04, 2026 · 9:40 AM",
      },
    ],
    activity: [
      { id: "a7", actor: "Aisha Khan", action: "created this issue", createdAt: "May 02, 2026" },
      { id: "a8", actor: "Maya Patel", action: "moved status to Blocked", createdAt: "May 04, 2026" },
    ],
  },
  {
    id: "HIR-318",
    projectId: "proj-hiring",
    title: "Fix candidate import validation",
    description: "CSV import fails when phone numbers include spaces or country codes.",
    priority: "Medium",
    status: "To do",
    type: "Bug",
    labels: ["import", "recruiting"],
    assignee: "Recruiting Agent",
    reporter: "People Operations",
    estimate: "2d",
    dueDate: "2026-05-09",
    createdAt: "Apr 28, 2026",
    updatedAt: "Apr 28, 2026",
    comments: [],
    activity: [
      { id: "a9", actor: "People Operations", action: "created this issue", createdAt: "Apr 28, 2026" },
    ],
  },
  {
    id: "HIR-221",
    projectId: "proj-hiring",
    title: "Build onboarding checklist template",
    description: "Reusable checklist for IT accounts, documents, manager intro, and 30-day plan.",
    priority: "Medium",
    status: "To do",
    type: "Story",
    labels: ["onboarding"],
    assignee: "Olivia Chen",
    reporter: "People Operations",
    estimate: "3d",
    dueDate: "2026-05-14",
    createdAt: "Apr 22, 2026",
    updatedAt: "Apr 22, 2026",
    comments: [],
    activity: [
      { id: "a10", actor: "People Operations", action: "created this issue", createdAt: "Apr 22, 2026" },
    ],
  },
  {
    id: "SEC-204",
    projectId: "proj-security",
    title: "Publish approval policy update",
    description: "Document the decision firewall thresholds for offers, payments, and data exports.",
    priority: "High",
    status: "Done",
    type: "Ticket",
    labels: ["policy", "governance"],
    assignee: "Compliance Agent",
    reporter: "Ghulam Ahmed",
    estimate: "2d",
    dueDate: "2026-04-30",
    createdAt: "Apr 12, 2026",
    updatedAt: "Apr 30, 2026",
    comments: [
      {
        id: "c5",
        author: "Ghulam Ahmed",
        initials: "GA",
        body: "Published to Company Brain and linked from Governance.",
        createdAt: "Apr 30, 2026 · 3:15 PM",
      },
    ],
    activity: [
      { id: "a11", actor: "Ghulam Ahmed", action: "created this issue", createdAt: "Apr 12, 2026" },
      { id: "a12", actor: "Compliance Agent", action: "moved status to Done", createdAt: "Apr 30, 2026" },
    ],
  },
]
