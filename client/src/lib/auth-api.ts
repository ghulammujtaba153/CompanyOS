import { apiFetch, apiUpload, setAccessToken } from "@/lib/api"

export type OrgMemberRole = "owner" | "admin" | "manager" | "member"
export type MembershipStatus = "active" | "invited" | "suspended"
export type MembershipSource = "purchase" | "invite"
export type AccountType = "platform_admin" | "user"
export type PrimaryRole = "platform_admin" | "owner" | "admin" | "manager" | "member" | "client" | "user"

export type Membership = {
  id: string
  organization_id: string
  organization_name: string
  organization_slug: string
  role: OrgMemberRole
  status: MembershipStatus
  source: MembershipSource
  title: string
  department: string
}

export type ClientLink = {
  id: string
  client_id: string
  client_name: string
  client_company: string
  organization_id: string
  status: string
}

export type Me = {
  id: string
  email: string
  full_name: string
  account_type: AccountType
  is_active: boolean
  created_at: string
  memberships: Membership[]
  client_links: ClientLink[]
  primary_role: PrimaryRole
}

export type TokenResponse = {
  access_token: string
  token_type: string
  me?: Me | null
}

export type Member = {
  id: string
  user_id: string
  email: string
  full_name: string
  role: OrgMemberRole
  status: MembershipStatus
  source: MembershipSource
  title: string
  department: string
  department_id?: string | null
  manager_id?: string | null
  joined_at: string
}

export type OrgDepartment = {
  id: string
  organization_id: string
  name: string
  description: string
  head_member_id: string | null
  access_hrefs: string[]
  created_at: string
}

export type RolePermissionRow = {
  area: string
  capability: string
  roles: Array<"Owner" | "Admin" | "Manager" | "Member">
}

export type Organization = {
  id: string
  name: string
  slug: string
  legal_name: string
  tagline: string
  website: string
  industry: string
  company_size: string
  headquarters: string
  about: string
  contact_email: string
  contact_phone: string
  workspace_label: string
  logo_url: string
  logo_public_id: string
  role_permissions?: RolePermissionRow[]
  stripe_customer_id?: string
  stripe_subscription_id?: string
  plan_id?: string
  subscription_status?: string
  renews_on?: string
  payment_brand?: string
  payment_last4?: string
  purchaser_user_id: string
  created_at: string
}

export type InvitePeek = {
  email: string
  full_name?: string
  role: OrgMemberRole
  organization_name: string
  organization_slug: string
  user_exists?: boolean
  expires_at?: string | null
}

export type InviteOut = {
  id: string
  organization_id: string
  email: string
  full_name?: string
  role: OrgMemberRole
  title?: string
  department?: string
  department_id?: string | null
  manager_id?: string | null
  token: string
  accepted_at: string | null
  created_at: string
  invite_url_path: string
  member_id?: string | null
  email_sent?: boolean
  email_detail?: string
  user_exists?: boolean
}

export type ApiClient = {
  id: string
  organization_id: string
  name: string
  company: string
  email: string
  phone: string
  website: string
  industry: string
  status: string
  notes: string
  internal_owner_member_id?: string | null
  created_at: string
}

export type ApiEngagement = {
  id: string
  organization_id: string
  client_id: string
  title: string
  description: string
  price: number
  currency: string
  status: string
  start_date: string
  due_date: string
  owner_member_id?: string | null
  files: Array<Record<string, unknown>>
  phases: Array<Record<string, unknown>>
  work_project_id: string
  work_project_key: string
  created_at: string
  updated_at: string
}

export type ApiContract = {
  id: string
  organization_id: string
  client_id: string
  client_name: string
  engagement_id: string
  title: string
  model: string
  value: number
  currency: string
  start_date: string
  renewal_date: string
  status: string
  notes: string
  created_at: string
  updated_at: string
}

async function storeToken(res: TokenResponse) {
  setAccessToken(res.access_token)
  return res
}

export const authApi = {
  login: async (email: string, password: string) =>
    storeToken(await apiFetch<TokenResponse>("/api/v1/auth/login", { body: { email, password }, auth: false })),

  registerOwner: async (input: {
    full_name: string
    email: string
    password: string
    organization_name: string
    organization_slug?: string
  }) =>
    storeToken(
      await apiFetch<TokenResponse>("/api/v1/auth/register-owner", {
        body: input,
        auth: false,
      })
    ),

  me: () => apiFetch<Me>("/api/v1/auth/me"),

  peekInvite: (token: string) =>
    apiFetch<InvitePeek>(`/api/v1/auth/invites/${encodeURIComponent(token)}`, { auth: false }),

  acceptInvite: async (input: { token: string; full_name: string; password: string }) =>
    storeToken(
      await apiFetch<TokenResponse>("/api/v1/auth/accept-invite", {
        body: input,
        auth: false,
      })
    ),

  joinInvite: async (token: string) =>
    storeToken(
      await apiFetch<TokenResponse>("/api/v1/auth/accept-invite/join", {
        body: { token },
      })
    ),

  logout: () => setAccessToken(null),
}

export type OrganizationUpdate = {
  name?: string
  legal_name?: string
  tagline?: string
  website?: string
  industry?: string
  company_size?: string
  headquarters?: string
  about?: string
  contact_email?: string
  contact_phone?: string
  workspace_label?: string
  logo_url?: string
  role_permissions?: RolePermissionRow[]
}

export type LogoUploadResult = {
  logo_url: string
  logo_public_id: string
  organization: Organization
}

export const orgApi = {
  list: () => apiFetch<Organization[]>("/api/v1/organizations"),
  get: (orgId: string) => apiFetch<Organization>(`/api/v1/organizations/${orgId}`),
  update: (orgId: string, body: OrganizationUpdate) =>
    apiFetch<Organization>(`/api/v1/organizations/${orgId}`, { method: "PATCH", body }),
  uploadLogo: (orgId: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return apiUpload<LogoUploadResult>(`/api/v1/organizations/${orgId}/logo`, form)
  },
  deleteLogo: (orgId: string) =>
    apiFetch<Organization>(`/api/v1/organizations/${orgId}/logo`, { method: "DELETE" }),
  members: (orgId: string) => apiFetch<Member[]>(`/api/v1/organizations/${orgId}/members`),
  addMember: (
    orgId: string,
    body: {
      email: string
      full_name: string
      password: string
      role: OrgMemberRole
      title?: string
      department?: string
      department_id?: string | null
      manager_id?: string | null
    }
  ) => apiFetch<Member>(`/api/v1/organizations/${orgId}/members`, { body }),
  updateMember: (
    orgId: string,
    memberId: string,
    body: {
      role?: OrgMemberRole
      status?: MembershipStatus
      title?: string
      department?: string
      department_id?: string | null
      manager_id?: string | null
      full_name?: string
    }
  ) =>
    apiFetch<Member>(`/api/v1/organizations/${orgId}/members/${memberId}`, {
      method: "PATCH",
      body,
    }),
  removeMember: (orgId: string, memberId: string) =>
    apiFetch<void>(`/api/v1/organizations/${orgId}/members/${memberId}`, { method: "DELETE" }),
  invite: (
    orgId: string,
    body: {
      email: string
      full_name?: string
      role: OrgMemberRole
      title?: string
      department?: string
      department_id?: string | null
      manager_id?: string | null
    }
  ) => apiFetch<InviteOut>(`/api/v1/organizations/${orgId}/invites`, { body }),
  listInvites: (orgId: string) => apiFetch<InviteOut[]>(`/api/v1/organizations/${orgId}/invites`),
  departments: (orgId: string) =>
    apiFetch<OrgDepartment[]>(`/api/v1/organizations/${orgId}/departments`),
  createDepartment: (
    orgId: string,
    body: {
      name: string
      description?: string
      head_member_id?: string | null
      access_hrefs?: string[]
      copy_access_from?: string | null
    }
  ) => apiFetch<OrgDepartment>(`/api/v1/organizations/${orgId}/departments`, { body }),
  updateDepartment: (
    orgId: string,
    departmentId: string,
    body: {
      name?: string
      description?: string
      head_member_id?: string | null
      access_hrefs?: string[]
    }
  ) =>
    apiFetch<OrgDepartment>(`/api/v1/organizations/${orgId}/departments/${departmentId}`, {
      method: "PATCH",
      body,
    }),
  deleteDepartment: (orgId: string, departmentId: string) =>
    apiFetch<void>(`/api/v1/organizations/${orgId}/departments/${departmentId}`, {
      method: "DELETE",
    }),
}

export function organizationToAgency(org: Organization) {
  return {
    name: org.name,
    legalName: org.legal_name,
    tagline: org.tagline,
    website: org.website,
    industry: org.industry,
    companySize: org.company_size,
    headquarters: org.headquarters,
    about: org.about,
    contactEmail: org.contact_email,
    contactPhone: org.contact_phone,
    logoDataUrl: org.logo_url || "",
    workspaceLabel: org.workspace_label,
  }
}

export const clientsApi = {
  list: (organizationId: string) =>
    apiFetch<ApiClient[]>(`/api/v1/clients?organization_id=${encodeURIComponent(organizationId)}`),
  get: (clientId: string) => apiFetch<ApiClient>(`/api/v1/clients/${clientId}`),
  create: (
    organizationId: string,
    body: {
      name: string
      company: string
      email?: string
      phone?: string
      website?: string
      industry?: string
      status?: string
      notes?: string
      internal_owner_member_id?: string | null
      create_portal_user?: boolean
      portal_password?: string
    }
  ) =>
    apiFetch<ApiClient>(`/api/v1/clients?organization_id=${encodeURIComponent(organizationId)}`, {
      body,
    }),
  update: (
    clientId: string,
    body: {
      name?: string
      company?: string
      email?: string
      phone?: string
      website?: string
      industry?: string
      status?: string
      notes?: string
      internal_owner_member_id?: string | null
    }
  ) => apiFetch<ApiClient>(`/api/v1/clients/${clientId}`, { method: "PATCH", body }),
  remove: (clientId: string) =>
    apiFetch<void>(`/api/v1/clients/${clientId}`, { method: "DELETE" }),
  listEngagements: (organizationId: string) =>
    apiFetch<ApiEngagement[]>(
      `/api/v1/engagements?organization_id=${encodeURIComponent(organizationId)}`
    ),
  createEngagement: (
    clientId: string,
    body: {
      title: string
      description?: string
      price?: number
      currency?: string
      status?: string
      start_date?: string
      due_date?: string
      owner_member_id?: string | null
      files?: Array<Record<string, unknown>>
      phases?: Array<Record<string, unknown>>
    }
  ) => apiFetch<ApiEngagement>(`/api/v1/clients/${clientId}/engagements`, { body }),
  updateEngagement: (
    engagementId: string,
    body: {
      title?: string
      description?: string
      price?: number
      currency?: string
      status?: string
      start_date?: string
      due_date?: string
      owner_member_id?: string | null
      files?: Array<Record<string, unknown>>
      phases?: Array<Record<string, unknown>>
      work_project_id?: string
      work_project_key?: string
    }
  ) =>
    apiFetch<ApiEngagement>(`/api/v1/engagements/${engagementId}`, {
      method: "PATCH",
      body,
    }),
  removeEngagement: (engagementId: string) =>
    apiFetch<void>(`/api/v1/engagements/${engagementId}`, { method: "DELETE" }),
  listContracts: (organizationId: string, params?: { clientId?: string; engagementId?: string }) => {
    const query = new URLSearchParams({ organization_id: organizationId })
    if (params?.clientId) query.set("client_id", params.clientId)
    if (params?.engagementId) query.set("engagement_id", params.engagementId)
    return apiFetch<ApiContract[]>(`/api/v1/contracts?${query.toString()}`)
  },
  createContract: (
    organizationId: string,
    body: {
      client_id: string
      engagement_id: string
      title: string
      model?: string
      value?: number
      currency?: string
      start_date?: string
      renewal_date?: string
      status?: string
      notes?: string
    }
  ) =>
    apiFetch<ApiContract>(`/api/v1/contracts?organization_id=${encodeURIComponent(organizationId)}`, {
      body,
    }),
  updateContract: (
    contractId: string,
    body: {
      title?: string
      model?: string
      value?: number
      currency?: string
      start_date?: string
      renewal_date?: string
      status?: string
      notes?: string
      client_id?: string
      engagement_id?: string
    }
  ) => apiFetch<ApiContract>(`/api/v1/contracts/${contractId}`, { method: "PATCH", body }),
  removeContract: (contractId: string) =>
    apiFetch<void>(`/api/v1/contracts/${contractId}`, { method: "DELETE" }),
}

export type ApiWorkProjectMember = {
  email: string
  name: string
  role: "Owner" | "Admin" | "Member" | "Viewer"
  status: "Active" | "Invited"
  invited_at: string
}

export type ApiWorkProject = {
  id: string
  organization_id: string
  key: string
  name: string
  team: string
  description: string
  due: string
  status: "Active" | "On hold" | "Completed"
  visibility: "Private" | "Company"
  client_id: string
  client_engagement_id: string
  members: ApiWorkProjectMember[]
  created_at: string
  updated_at: string
}

export type ApiWorkIssueComment = {
  id: string
  author: string
  initials: string
  body: string
  created_at: string
}

export type ApiWorkIssueActivity = {
  id: string
  actor: string
  action: string
  created_at: string
}

export type ApiWorkIssue = {
  id: string
  uuid: string
  organization_id: string
  project_id: string
  title: string
  description: string
  priority: "Critical" | "High" | "Medium" | "Low"
  status: "Backlog" | "To do" | "In progress" | "In review" | "Blocked" | "Done"
  type: "Epic" | "Story" | "Bug" | "Task" | "Ticket"
  labels: string[]
  assignee: string
  reporter: string
  estimate: string
  due_date: string
  comments: ApiWorkIssueComment[]
  activity: ApiWorkIssueActivity[]
  created_at: string
  updated_at: string
}

export const workApi = {
  listProjects: (organizationId: string) =>
    apiFetch<ApiWorkProject[]>(
      `/api/v1/projects?organization_id=${encodeURIComponent(organizationId)}`
    ),
  getProject: (projectId: string) =>
    apiFetch<ApiWorkProject>(`/api/v1/projects/${projectId}`),
  createProject: (
    organizationId: string,
    body: {
      name: string
      key: string
      team?: string
      description?: string
      due?: string
      visibility?: string
      client_id?: string
      client_engagement_id?: string
    }
  ) =>
    apiFetch<ApiWorkProject>(
      `/api/v1/projects?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  updateProject: (
    projectId: string,
    body: {
      name?: string
      team?: string
      description?: string
      due?: string
      status?: string
      visibility?: string
    }
  ) => apiFetch<ApiWorkProject>(`/api/v1/projects/${projectId}`, { method: "PATCH", body }),
  deleteProject: (projectId: string) =>
    apiFetch<void>(`/api/v1/projects/${projectId}`, { method: "DELETE" }),
  inviteMember: (projectId: string, body: { email: string; role?: string; name?: string }) =>
    apiFetch<ApiWorkProject>(`/api/v1/projects/${projectId}/members`, { body }),
  updateMemberRole: (projectId: string, email: string, role: string) =>
    apiFetch<ApiWorkProject>(
      `/api/v1/projects/${projectId}/members/${encodeURIComponent(email)}`,
      { method: "PATCH", body: { role } }
    ),
  removeMember: (projectId: string, email: string) =>
    apiFetch<ApiWorkProject>(
      `/api/v1/projects/${projectId}/members/${encodeURIComponent(email)}`,
      { method: "DELETE" }
    ),
  listIssues: (organizationId: string, projectId?: string) => {
    const query = new URLSearchParams({ organization_id: organizationId })
    if (projectId) query.set("project_id", projectId)
    return apiFetch<ApiWorkIssue[]>(`/api/v1/issues?${query.toString()}`)
  },
  createIssue: (body: {
    project_id: string
    title: string
    description?: string
    priority?: string
    type?: string
    status?: string
    assignee?: string
    labels?: string[]
    estimate?: string
    due_date?: string
  }) => apiFetch<ApiWorkIssue>(`/api/v1/issues`, { body }),
  updateIssue: (
    issueRef: string,
    body: {
      title?: string
      description?: string
      priority?: string
      status?: string
      type?: string
      assignee?: string
      labels?: string[]
      estimate?: string
      due_date?: string
    }
  ) =>
    apiFetch<ApiWorkIssue>(`/api/v1/issues/${encodeURIComponent(issueRef)}`, {
      method: "PATCH",
      body,
    }),
  deleteIssue: (issueRef: string) =>
    apiFetch<void>(`/api/v1/issues/${encodeURIComponent(issueRef)}`, { method: "DELETE" }),
  addComment: (issueRef: string, body: string) =>
    apiFetch<ApiWorkIssue>(`/api/v1/issues/${encodeURIComponent(issueRef)}/comments`, {
      body: { body },
    }),
}

export type ApiTimeEntry = {
  id: string
  organization_id: string
  user_id: string
  project_id: string
  project_name: string
  project_key: string
  week_start: string
  hours: number
  billable: boolean
  note: string
  status: "draft" | "submitted" | string
  created_at: string
  updated_at: string
}

export type ApiTimesheet = {
  week_start: string
  status: "draft" | "submitted" | string
  entries: ApiTimeEntry[]
}

export const timeApi = {
  getTimesheet: (organizationId: string, weekStart: string) =>
    apiFetch<ApiTimesheet>(
      `/api/v1/time-entries?organization_id=${encodeURIComponent(organizationId)}&week_start=${encodeURIComponent(weekStart)}`
    ),
  createEntry: (
    organizationId: string,
    body: {
      project_id: string
      week_start: string
      hours?: number
      billable?: boolean
      note?: string
    }
  ) =>
    apiFetch<ApiTimeEntry>(
      `/api/v1/time-entries?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  updateEntry: (
    entryId: string,
    body: { hours?: number; billable?: boolean; note?: string }
  ) => apiFetch<ApiTimeEntry>(`/api/v1/time-entries/${entryId}`, { method: "PATCH", body }),
  submitWeek: (organizationId: string, weekStart: string) =>
    apiFetch<ApiTimesheet>(
      `/api/v1/time-entries/submit?organization_id=${encodeURIComponent(organizationId)}`,
      { body: { week_start: weekStart } }
    ),
}

export type ApiCommChannel = {
  id: string
  organization_id: string
  kind: "channel" | "dm" | string
  name: string
  description: string
  visibility: "Public" | "Private" | string
  member_ids: string[]
  created_by: string | null
  created_at: string
  last_read_at: string | null
}

export type ApiCommMessage = {
  id: string
  channel_id: string
  author_id: string
  body: string
  created_at: string
  edited_at: string | null
  reactions: Record<string, string[]>
}

export const commsApi = {
  listChannels: (organizationId: string) =>
    apiFetch<ApiCommChannel[]>(
      `/api/v1/channels?organization_id=${encodeURIComponent(organizationId)}`
    ),
  createChannel: (
    organizationId: string,
    body: { name: string; description?: string; visibility?: string; member_ids?: string[] }
  ) =>
    apiFetch<ApiCommChannel>(
      `/api/v1/channels?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  updateChannel: (channelId: string, body: { name?: string; description?: string }) =>
    apiFetch<ApiCommChannel>(`/api/v1/channels/${channelId}`, { method: "PATCH", body }),
  deleteChannel: (channelId: string) =>
    apiFetch<void>(`/api/v1/channels/${channelId}`, { method: "DELETE" }),
  joinChannel: (channelId: string) =>
    apiFetch<ApiCommChannel>(`/api/v1/channels/${channelId}/join`, { method: "POST", body: {} }),
  leaveChannel: (channelId: string) =>
    apiFetch<ApiCommChannel>(`/api/v1/channels/${channelId}/leave`, { method: "POST", body: {} }),
  addMembers: (channelId: string, memberIds: string[]) =>
    apiFetch<ApiCommChannel>(`/api/v1/channels/${channelId}/members`, {
      body: { member_ids: memberIds },
    }),
  openDm: (organizationId: string, memberId: string) =>
    apiFetch<ApiCommChannel>(
      `/api/v1/dms?organization_id=${encodeURIComponent(organizationId)}`,
      { body: { member_id: memberId } }
    ),
  markRead: (channelId: string) =>
    apiFetch<ApiCommChannel>(`/api/v1/channels/${channelId}/read`, { method: "POST", body: {} }),
  listMessages: (channelId: string) =>
    apiFetch<ApiCommMessage[]>(`/api/v1/channels/${channelId}/messages`),
  sendMessage: (channelId: string, body: string) =>
    apiFetch<ApiCommMessage>(`/api/v1/channels/${channelId}/messages`, { body: { body } }),
  editMessage: (messageId: string, body: string) =>
    apiFetch<ApiCommMessage>(`/api/v1/messages/${messageId}`, {
      method: "PATCH",
      body: { body },
    }),
  deleteMessage: (messageId: string) =>
    apiFetch<void>(`/api/v1/messages/${messageId}`, { method: "DELETE" }),
  toggleReaction: (messageId: string, emoji: string) =>
    apiFetch<ApiCommMessage>(`/api/v1/messages/${messageId}/reactions`, { body: { emoji } }),
}

export type ApiHiringJob = {
  id: string
  organization_id: string
  title: string
  departmentId: string
  hiringManagerId: string
  openings: number
  status: string
  createdAt: string
  description: string
  location: string
  employmentType: string
  hiring: Record<string, unknown>
}

export type ApiHiringCandidate = {
  id: string
  organization_id: string
  jobId: string
  name: string
  email: string
  source: string
  stage: string
  rating: number
  notes: string
  appliedAt: string
  employeeId: string
  phone: string
  resumeNote: string
  resumeFile?: Record<string, unknown> | null
  applicationAnswers: Array<Record<string, unknown>>
  aiScreen?: Record<string, unknown> | null
  interviewToken: string
  interviewExpiresAt: string
  interviewInviteSentAt: string
  aiInterview?: Record<string, unknown> | null
  technicalInvite?: Record<string, unknown> | null
}

export type ApiLeaveRequest = {
  id: string
  organization_id: string
  employeeId: string
  type: string
  start: string
  end: string
  reason: string
  status: string
  approverId: string
  decisionNote: string
  createdAt: string
}

export type ApiOnboardingPlan = {
  id: string
  organization_id: string
  employeeId: string
  startDate: string
  buddyId: string
  tasks: Array<Record<string, unknown>>
}

export type ApiOffboardingPlan = {
  id: string
  organization_id: string
  employeeId: string
  employeeName: string
  title: string
  department: string
  lastDay: string
  reason: string
  status: string
  tasks: Array<Record<string, unknown>>
}

export type ApiPerformanceCycle = {
  id: string
  organization_id: string
  employeeId: string
  employeeName: string
  title: string
  managerName: string
  period: string
  status: string
  goals: Array<Record<string, unknown>>
  oneOnOnes: Array<Record<string, unknown>>
}

export type ApiJobOffer = {
  id: string
  organization_id: string
  candidateId: string
  candidateName: string
  candidateEmail: string
  jobId: string
  jobTitle: string
  salary: number
  currency: string
  equityNote: string
  startDate: string
  expiresOn: string
  status: string
  signToken: string
  signedAt: string
  signedName: string
  createdAt: string
}

export const peopleOpsApi = {
  listJobs: (organizationId: string) =>
    apiFetch<ApiHiringJob[]>(
      `/api/v1/people-ops/jobs?organization_id=${encodeURIComponent(organizationId)}`
    ),
  saveJob: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<ApiHiringJob>(
      `/api/v1/people-ops/jobs?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  deleteJob: (jobId: string) =>
    apiFetch<void>(`/api/v1/people-ops/jobs/${jobId}`, { method: "DELETE" }),
  listCandidates: (organizationId: string) =>
    apiFetch<ApiHiringCandidate[]>(
      `/api/v1/people-ops/candidates?organization_id=${encodeURIComponent(organizationId)}`
    ),
  saveCandidate: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<ApiHiringCandidate>(
      `/api/v1/people-ops/candidates?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  deleteCandidate: (candidateId: string) =>
    apiFetch<void>(`/api/v1/people-ops/candidates/${candidateId}`, { method: "DELETE" }),
  listLeave: (organizationId: string) =>
    apiFetch<ApiLeaveRequest[]>(
      `/api/v1/people-ops/leave?organization_id=${encodeURIComponent(organizationId)}`
    ),
  createLeave: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<ApiLeaveRequest>(
      `/api/v1/people-ops/leave?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  updateLeave: (leaveId: string, body: { status: string; decisionNote?: string }) =>
    apiFetch<ApiLeaveRequest>(`/api/v1/people-ops/leave/${leaveId}`, { method: "PATCH", body }),
  listOnboarding: (organizationId: string) =>
    apiFetch<ApiOnboardingPlan[]>(
      `/api/v1/people-ops/onboarding?organization_id=${encodeURIComponent(organizationId)}`
    ),
  createOnboarding: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<ApiOnboardingPlan>(
      `/api/v1/people-ops/onboarding?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  updateOnboarding: (planId: string, body: Record<string, unknown>) =>
    apiFetch<ApiOnboardingPlan>(`/api/v1/people-ops/onboarding/${planId}`, {
      method: "PATCH",
      body,
    }),
  listOffboarding: (organizationId: string) =>
    apiFetch<ApiOffboardingPlan[]>(
      `/api/v1/people-ops/offboarding?organization_id=${encodeURIComponent(organizationId)}`
    ),
  createOffboarding: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<ApiOffboardingPlan>(
      `/api/v1/people-ops/offboarding?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  updateOffboarding: (planId: string, body: Record<string, unknown>) =>
    apiFetch<ApiOffboardingPlan>(`/api/v1/people-ops/offboarding/${planId}`, {
      method: "PATCH",
      body,
    }),
  listPerformance: (organizationId: string) =>
    apiFetch<ApiPerformanceCycle[]>(
      `/api/v1/people-ops/performance?organization_id=${encodeURIComponent(organizationId)}`
    ),
  createPerformance: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<ApiPerformanceCycle>(
      `/api/v1/people-ops/performance?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  updatePerformance: (cycleId: string, body: Record<string, unknown>) =>
    apiFetch<ApiPerformanceCycle>(`/api/v1/people-ops/performance/${cycleId}`, {
      method: "PATCH",
      body,
    }),
  listOffers: (organizationId: string) =>
    apiFetch<ApiJobOffer[]>(
      `/api/v1/people-ops/offers?organization_id=${encodeURIComponent(organizationId)}`
    ),
  createOffer: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<ApiJobOffer>(
      `/api/v1/people-ops/offers?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  updateOffer: (offerId: string, body: Record<string, unknown>) =>
    apiFetch<ApiJobOffer>(`/api/v1/people-ops/offers/${offerId}`, { method: "PATCH", body }),
  publicGetOffer: (token: string) =>
    apiFetch<ApiJobOffer>(`/api/v1/people-ops/public/offers/${encodeURIComponent(token)}`, {
      auth: false,
    }),
  publicSignOffer: (token: string, signedName: string) =>
    apiFetch<ApiJobOffer>(`/api/v1/people-ops/public/offers/${encodeURIComponent(token)}/sign`, {
      auth: false,
      body: { signedName },
    }),
  publicGetJobBySlug: (slug: string) =>
    apiFetch<ApiPublicApplyJob>(
      `/api/v1/people-ops/public/jobs/${encodeURIComponent(slug)}`,
      { auth: false }
    ),
  publicApplyToJob: (
    slug: string,
    body: {
      name: string
      email: string
      phone?: string
      resumeNote?: string
      resumeFile?: Record<string, unknown> | null
      answers?: Array<Record<string, unknown>>
    }
  ) =>
    apiFetch<{ ok: boolean; id: string; message: string }>(
      `/api/v1/people-ops/public/jobs/${encodeURIComponent(slug)}/apply`,
      { auth: false, body }
    ),
  publicGetInterview: (token: string) =>
    apiFetch<ApiPublicInterviewSession>(
      `/api/v1/people-ops/public/interviews/${encodeURIComponent(token)}`,
      { auth: false }
    ),
  publicCompleteInterview: (
    token: string,
    body: {
      name: string
      jobTitleConfirm: string
      selfieDataUrl?: string
      captures?: Array<{
        id: string
        dataUrl: string
        capturedAt: string
        kind: "identity" | "random"
        questionId?: string
      }>
      answers: Array<{ questionId: string; answer: string }>
    }
  ) =>
    apiFetch<{ ok: boolean; passed: boolean; score: number; message: string }>(
      `/api/v1/people-ops/public/interviews/${encodeURIComponent(token)}/complete`,
      { auth: false, body }
    ),
}

export type ApiPublicInterviewSession = {
  token: string
  candidateName: string
  jobTitle: string
  expiresAt: string
  captureDelaySeconds: number
  passScore: number
  completed: boolean
  score: number | null
  passed: boolean | null
  questions: Array<{ id: string; prompt: string; seconds: number }>
  organization: {
    name: string
    tagline: string
    about: string
    logoUrl: string
  }
}

export type ApiPublicApplyJob = {
  id: string
  title: string
  description: string
  location: string
  employmentType: string
  status: string
  applyForm: {
    slug: string
    expiresAt: string
    welcomeMessage: string
    published: boolean
  }
  organization: {
    name: string
    tagline: string
    about: string
    logoUrl: string
  }
}

export type ApiVaultDocument = {
  id: string
  organization_id: string
  projectId?: string | null
  name: string
  category: string
  ownerName: string
  sizeLabel: string
  uploadedAt: string
  sharedWith: string
  status: string
  body: string
  fileUrl: string
}

export const documentsApi = {
  list: (
    organizationId: string,
    params?: { category?: string; q?: string; projectId?: string }
  ) => {
    const search = new URLSearchParams({ organization_id: organizationId })
    if (params?.category && params.category !== "All") search.set("category", params.category)
    if (params?.q?.trim()) search.set("q", params.q.trim())
    if (params?.projectId) search.set("project_id", params.projectId)
    return apiFetch<ApiVaultDocument[]>(`/api/v1/documents?${search.toString()}`)
  },
  create: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<ApiVaultDocument>(
      `/api/v1/documents?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  upload: (organizationId: string, formData: FormData) =>
    apiUpload<ApiVaultDocument>(
      `/api/v1/documents/upload?organization_id=${encodeURIComponent(organizationId)}`,
      formData
    ),
  update: (documentId: string, body: Record<string, unknown>) =>
    apiFetch<ApiVaultDocument>(`/api/v1/documents/${documentId}`, { method: "PATCH", body }),
  remove: (documentId: string) =>
    apiFetch<void>(`/api/v1/documents/${documentId}`, { method: "DELETE" }),
}

export type ApiSubscription = {
  organization_id: string
  planId: string
  status: string
  renewsOn: string
  billingEmail: string
  paymentMethod: { brand: string; last4: string; expires: string }
  stripeConfigured: boolean
  hasCustomer: boolean
}

export type ApiBillingInvoice = {
  id: string
  date: string
  amount: number
  status: string
  description: string
  hostedInvoiceUrl: string
  pdfUrl: string
}

export type ApiClientInvoice = {
  id: string
  organization_id: string
  number: string
  clientId: string
  clientName: string
  engagementId: string
  engagementTitle: string
  issueDate: string
  dueDate: string
  amount: number
  currency: string
  status: string
  lineItems: Array<{ description?: string; amount?: number }>
}

export type ApiAuditEvent = {
  id: string
  organization_id: string
  at: string
  actor: string
  action: string
  target: string
  area: string
}

export type ApiUtilizationRow = {
  employeeId: string
  name: string
  department: string
  billablePct: number
  capacityHours: number
  loggedHours: number
}

export const billingApi = {
  getSubscription: (organizationId: string) =>
    apiFetch<ApiSubscription>(
      `/api/v1/billing/subscription?organization_id=${encodeURIComponent(organizationId)}`
    ),
  checkout: (organizationId: string, planId: string) =>
    apiFetch<{ url: string }>(
      `/api/v1/billing/checkout?organization_id=${encodeURIComponent(organizationId)}`,
      { body: { planId } }
    ),
  portal: (organizationId: string) =>
    apiFetch<{ url: string }>(
      `/api/v1/billing/portal?organization_id=${encodeURIComponent(organizationId)}`,
      { body: {} }
    ),
  listInvoices: (organizationId: string) =>
    apiFetch<ApiBillingInvoice[]>(
      `/api/v1/billing/invoices?organization_id=${encodeURIComponent(organizationId)}`
    ),
}

export const financeApi = {
  listInvoices: (organizationId: string) =>
    apiFetch<ApiClientInvoice[]>(
      `/api/v1/finance/invoices?organization_id=${encodeURIComponent(organizationId)}`
    ),
  getInvoice: (invoiceId: string) =>
    apiFetch<ApiClientInvoice>(`/api/v1/finance/invoices/${invoiceId}`),
  createInvoice: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<ApiClientInvoice>(
      `/api/v1/finance/invoices?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  updateInvoice: (invoiceId: string, body: Record<string, unknown>) =>
    apiFetch<ApiClientInvoice>(`/api/v1/finance/invoices/${invoiceId}`, { method: "PATCH", body }),
}

export const auditApi = {
  list: (organizationId: string, area?: string) => {
    const search = new URLSearchParams({ organization_id: organizationId })
    if (area && area !== "All") search.set("area", area)
    return apiFetch<ApiAuditEvent[]>(`/api/v1/audit/events?${search.toString()}`)
  },
  create: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<ApiAuditEvent>(
      `/api/v1/audit/events?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  reindex: (organizationId: string) =>
    apiFetch<{ ok: boolean; total: number; indexed: number; errors: string[] }>(
      `/api/v1/audit/reindex?organization_id=${encodeURIComponent(organizationId)}`,
      { body: {} }
    ),
}

export const analyticsApi = {
  utilization: (organizationId: string, weekStart?: string) => {
    const search = new URLSearchParams({ organization_id: organizationId })
    if (weekStart) search.set("week_start", weekStart)
    return apiFetch<ApiUtilizationRow[]>(`/api/v1/analytics/utilization?${search.toString()}`)
  },
}

export type AiProviderInfo = {
  id: string
  label: string
  model: string
  configured: boolean
}

export type BrainAskResult = {
  answer: string
  citations: { title: string; docId: string; excerpt: string }[]
  confidence: "high" | "medium" | "low" | string
  mode: string
  retrieval?: "pinecone" | "keyword" | "hybrid" | "llamaindex" | string
  provider?: string
  model?: string
  traceId?: string
}

export type WorkDraftResult = {
  kind: string
  title?: string
  description?: string
  type?: string
  priority?: string
  labels?: string[]
  estimate?: string
  rationale?: string
  body?: string
  suggestions?: Array<Record<string, unknown>>
  provider?: string
  model?: string
}

export const aiApi = {
  providers: () =>
    apiFetch<{ defaultProvider: string; providers: AiProviderInfo[]; configured: boolean }>(
      `/api/v1/ai/providers`
    ),
  vectorsStatus: () =>
    apiFetch<{
      configured: boolean
      ready: boolean
      index: string
      dimension: number
      embeddingsAvailable: boolean
      embeddingProvider: string
    }>(`/api/v1/ai/vectors/status`),
  vectorsReindex: (organizationId: string) =>
    apiFetch<{ ok: boolean; total: number; indexed: number; errors: string[] }>(
      `/api/v1/ai/vectors/reindex?organization_id=${encodeURIComponent(organizationId)}`,
      { body: {} }
    ),
  brainAsk: (
    organizationId: string,
    body: { question: string; top_k?: number; provider?: string; projectId?: string }
  ) =>
    apiFetch<BrainAskResult>(
      `/api/v1/ai/brain/ask?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  evalRun: (
    organizationId: string,
    body?: { provider?: string; projectId?: string; withAnswers?: boolean }
  ) =>
    apiFetch<{
      ok: boolean
      total: number
      retrievalHitRate: number
      citationRate: number
      avgFaithfulness: number
      cases: Array<Record<string, unknown>>
    }>(`/api/v1/ai/eval/run?organization_id=${encodeURIComponent(organizationId)}`, {
      body: body ?? {},
    }),
  workDraft: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<WorkDraftResult>(
      `/api/v1/ai/work/draft?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  mcpInvoke: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<{
      toolName: string
      decision: Record<string, unknown>
      result: { ok: boolean; mode: string; message: string; data?: unknown }
      approvalId?: string
    }>(`/api/v1/ai/mcp/invoke?organization_id=${encodeURIComponent(organizationId)}`, { body }),
}

export const governanceApi = {
  getPolicy: (organizationId: string) =>
    apiFetch<{
      defaultAutonomy: number
      defaultProvider: string
      passports: Array<Record<string, unknown>>
      rules: Array<Record<string, unknown>>
    }>(`/api/v1/governance/policy?organization_id=${encodeURIComponent(organizationId)}`),
  updateSettings: (organizationId: string, body: { defaultAutonomy: number; defaultProvider?: string }) =>
    apiFetch<{ defaultAutonomy: number; defaultProvider: string }>(
      `/api/v1/governance/settings?organization_id=${encodeURIComponent(organizationId)}`,
      { method: "PUT", body }
    ),
  upsertPassport: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(
      `/api/v1/governance/passports?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  deletePassport: (organizationId: string, passportId: string) =>
    apiFetch<void>(
      `/api/v1/governance/passports/${encodeURIComponent(passportId)}?organization_id=${encodeURIComponent(organizationId)}`,
      { method: "DELETE" }
    ),
  upsertRule: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(
      `/api/v1/governance/rules?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  deleteRule: (organizationId: string, ruleId: string) =>
    apiFetch<void>(
      `/api/v1/governance/rules/${encodeURIComponent(ruleId)}?organization_id=${encodeURIComponent(organizationId)}`,
      { method: "DELETE" }
    ),
  evaluate: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(
      `/api/v1/governance/evaluate?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  seedDefaults: (organizationId: string) =>
    apiFetch<{ seeded: boolean }>(
      `/api/v1/governance/seed-defaults?organization_id=${encodeURIComponent(organizationId)}`,
      { body: {} }
    ),
  listActions: (organizationId: string) =>
    apiFetch<Array<Record<string, unknown>>>(
      `/api/v1/approvals/actions?organization_id=${encodeURIComponent(organizationId)}`
    ),
  submitAction: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(
      `/api/v1/approvals/actions?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  decideAction: (actionId: string, body: { decision: string; note?: string }) =>
    apiFetch<Record<string, unknown>>(`/api/v1/approvals/actions/${actionId}/decide`, { body }),
  listProcesses: (organizationId: string) =>
    apiFetch<Array<Record<string, unknown>>>(
      `/api/v1/processes?organization_id=${encodeURIComponent(organizationId)}`
    ),
  upsertProcess: (organizationId: string, body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(
      `/api/v1/processes?organization_id=${encodeURIComponent(organizationId)}`,
      { body }
    ),
  deleteProcess: (organizationId: string, processId: string) =>
    apiFetch<void>(
      `/api/v1/processes/${encodeURIComponent(processId)}?organization_id=${encodeURIComponent(organizationId)}`,
      { method: "DELETE" }
    ),
  listProcessRuns: (organizationId: string, processId: string) =>
    apiFetch<Array<Record<string, unknown>>>(
      `/api/v1/processes/${encodeURIComponent(processId)}/runs?organization_id=${encodeURIComponent(organizationId)}`
    ),
  kickoffProcessRun: (
    organizationId: string,
    processId: string,
    body?: { context?: Record<string, unknown>; autoAdvance?: boolean }
  ) =>
    apiFetch<Record<string, unknown>>(
      `/api/v1/processes/${encodeURIComponent(processId)}/runs?organization_id=${encodeURIComponent(organizationId)}`,
      { body: body ?? { autoAdvance: true } }
    ),
  getProcessRun: (organizationId: string, runId: string) =>
    apiFetch<Record<string, unknown>>(
      `/api/v1/process-runs/${encodeURIComponent(runId)}?organization_id=${encodeURIComponent(organizationId)}`
    ),
  advanceProcessRun: (organizationId: string, runId: string, body?: { forcePerson?: boolean; note?: string }) =>
    apiFetch<Record<string, unknown>>(
      `/api/v1/process-runs/${encodeURIComponent(runId)}/advance?organization_id=${encodeURIComponent(organizationId)}`,
      { body: body ?? { forcePerson: true } }
    ),
  cancelProcessRun: (organizationId: string, runId: string) =>
    apiFetch<Record<string, unknown>>(
      `/api/v1/process-runs/${encodeURIComponent(runId)}/cancel?organization_id=${encodeURIComponent(organizationId)}`,
      { body: {} }
    ),
}

export type ApiNotification = {
  id: string
  organizationId: string
  recipientUserId: string
  actorUserId: string
  actorName: string
  kind: string
  title: string
  body: string
  href: string
  entityType: string
  entityId: string
  roleScope: string
  readAt: string | null
  createdAt: string
  unread: boolean
}

export const notificationsApi = {
  list: (organizationId: string, unreadOnly = false) =>
    apiFetch<{ items: ApiNotification[]; unreadCount: number }>(
      `/api/v1/notifications?organization_id=${encodeURIComponent(organizationId)}&unread_only=${unreadOnly ? "true" : "false"}`
    ),
  unreadCount: (organizationId: string) =>
    apiFetch<{ unreadCount: number }>(
      `/api/v1/notifications/unread-count?organization_id=${encodeURIComponent(organizationId)}`
    ),
  markRead: (organizationId: string, ids: string[]) =>
    apiFetch<{ ok: boolean; updated: number }>(
      `/api/v1/notifications/read?organization_id=${encodeURIComponent(organizationId)}`,
      { body: { ids } }
    ),
  markAllRead: (organizationId: string) =>
    apiFetch<{ ok: boolean; updated: number }>(
      `/api/v1/notifications/read-all?organization_id=${encodeURIComponent(organizationId)}`,
      { body: {} }
    ),
}

export type ClassifiedLog = {
  source: string
  log_message: string
  target_label: string
  method: string
  is_issue: boolean
  alert?: {
    sent?: boolean
    skipped?: boolean
    reason?: string
    to?: string
    message_id?: string
  }
  ticket?: {
    id: string
    ticket_key: string
    title: string
    priority: string
  }
}

export type SupportTicketRow = {
  id: string
  ticket_key: string
  title: string
  description: string
  status: "open" | "in_progress" | "resolved" | "closed" | string
  priority: "low" | "medium" | "high" | "critical" | string
  category: string
  source: string
  log_message: string
  classification_label: string
  classification_method: string
  ai_summary: string
  ai_suggested_actions: string[]
  assigned_to_user_id: string | null
  assigned_to_name: string | null
  assigned_to_email: string | null
  created_by_user_id: string | null
  created_by_name: string | null
  created_at: string | null
  updated_at: string | null
}

export type TicketAssigneeOption = {
  id: string
  email: string
  full_name: string
  account_type: string
}

export type AdminOverview = {
  organizations: number
  members: number
  active_members: number
  users: number
  platform_admins: number
  open_tickets?: number
}

export type AdminOrgRow = {
  id: string
  name: string
  slug: string
  plan_id: string
  member_count: number
  created_at: string | null
}

export type AdminUserRow = {
  id: string
  email: string
  full_name: string
  account_type: string
  is_active: boolean
  organizations: Array<{
    organization_id: string
    organization_name: string
    role: string
    status: string
  }>
  created_at: string | null
}

export const adminApi = {
  overview: () => apiFetch<AdminOverview>("/api/v1/admin/overview"),
  organizations: () => apiFetch<AdminOrgRow[]>("/api/v1/admin/organizations"),
  users: () => apiFetch<AdminUserRow[]>("/api/v1/admin/users"),
  tickets: (status?: string) =>
    apiFetch<SupportTicketRow[]>(
      `/api/v1/admin/tickets${status && status !== "all" ? `?status=${encodeURIComponent(status)}` : ""}`
    ),
  ticketAssignees: () => apiFetch<TicketAssigneeOption[]>("/api/v1/admin/tickets/assignees"),
  ticket: (id: string) => apiFetch<SupportTicketRow>(`/api/v1/admin/tickets/${encodeURIComponent(id)}`),
  updateTicket: (
    id: string,
    body: {
      status?: string
      priority?: string
      assigned_to_user_id?: string | null
      clear_assignee?: boolean
    }
  ) =>
    apiFetch<SupportTicketRow>(`/api/v1/admin/tickets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    }),
}

export const logClassificationApi = {
  status: () =>
    apiFetch<{
      bert: { available: boolean; model_present: boolean; error?: string | null }
      brevo_configured: boolean
      alert_to: string
      issue_labels: string[]
      tickets_enabled?: boolean
    }>("/api/v1/log-classification/status"),
  classify: (
    logs: Array<{ source: string; log_message: string }>,
    alert = true,
    createTickets = true
  ) =>
    apiFetch<{
      count: number
      issues: number
      results: ClassifiedLog[]
      alert?: ClassifiedLog["alert"]
      tickets?: SupportTicketRow[]
    }>("/api/v1/log-classification/classify", {
      body: { logs, alert, create_tickets: createTickets },
    }),
}
