export type IntegrationScope = {
  id: string
  label: string
  /** Governance actions this scope makes possible for agents. */
  capabilityIds: string[]
  /** Grants access to sensitive data or money movement. */
  sensitive?: boolean
}

export type SyncEvent = { at: string; ok: boolean; message: string }

export type Integration = {
  id: string
  name: string
  category: "Productivity" | "Engineering" | "HR" | "CRM" | "Finance"
  description: string
  scopes: IntegrationScope[]
  status: "Connected" | "Available" | "Error"
  grantedScopeIds: string[]
  connectedBy?: string
  lastSyncAt?: string
  error?: string
  log: SyncEvent[]
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export const seedIntegrations: Integration[] = [
  {
    id: "google-workspace",
    name: "Google Workspace",
    category: "Productivity",
    description: "Email, calendar, and directory for scheduling and outreach.",
    scopes: [
      { id: "calendar", label: "Calendar", capabilityIds: ["calendar.invite", "interview.schedule"] },
      { id: "gmail", label: "Gmail (send)", capabilityIds: ["email.external", "offer.send"], sensitive: true },
      { id: "directory", label: "Directory (read)", capabilityIds: [] },
    ],
    status: "Connected",
    grantedScopeIds: ["calendar", "gmail", "directory"],
    connectedBy: "emp-ghulam",
    lastSyncAt: ago(2),
    log: [
      { at: ago(2), ok: true, message: "Synced 412 calendar events" },
      { at: ago(62), ok: true, message: "Synced 398 calendar events" },
    ],
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    category: "Finance",
    description: "Invoices, vendors, and payments for finance agents.",
    scopes: [
      { id: "invoices", label: "Invoices (read)", capabilityIds: ["invoice.read"] },
      { id: "payments", label: "Payments (create & send)", capabilityIds: ["payment.prepare", "payment.execute"], sensitive: true },
      { id: "vendors", label: "Vendors (edit)", capabilityIds: ["vendor.bank_change"], sensitive: true },
    ],
    status: "Error",
    grantedScopeIds: ["invoices", "payments"],
    connectedBy: "emp-ghulam",
    lastSyncAt: ago(75),
    error: "Access token expired — re-authorize to resume syncing.",
    log: [
      { at: ago(15), ok: false, message: "401 Unauthorized: token expired" },
      { at: ago(75), ok: true, message: "Synced 38 invoices" },
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "CRM",
    description: "Contacts, deals, and pipeline for revenue operations.",
    scopes: [
      { id: "contacts", label: "Contacts (read & write)", capabilityIds: ["crm.sync"] },
      { id: "deals", label: "Deals & quotes", capabilityIds: ["contract.send", "pricing.change"], sensitive: true },
      { id: "export", label: "Bulk export", capabilityIds: ["data.export"], sensitive: true },
    ],
    status: "Connected",
    grantedScopeIds: ["contacts"],
    connectedBy: "emp-samuel",
    lastSyncAt: ago(18),
    log: [{ at: ago(18), ok: true, message: "Synced 240 contacts" }],
  },
  {
    id: "github",
    name: "GitHub",
    category: "Engineering",
    description: "Repositories and pull requests as engineering activity signals.",
    scopes: [
      { id: "repos", label: "Repositories (read)", capabilityIds: [] },
      { id: "prs", label: "Pull requests (read)", capabilityIds: [] },
    ],
    status: "Available",
    grantedScopeIds: [],
    log: [],
  },
  {
    id: "bamboohr",
    name: "BambooHR",
    category: "HR",
    description: "Employee records, time off, and onboarding status.",
    scopes: [
      { id: "employees", label: "Employee records", capabilityIds: ["onboarding.draft"] },
      { id: "timeoff", label: "Time off", capabilityIds: ["leave.update"] },
      { id: "payroll", label: "Payroll", capabilityIds: ["payroll.export"], sensitive: true },
    ],
    status: "Available",
    grantedScopeIds: [],
    log: [],
  },
  {
    id: "notion",
    name: "Notion",
    category: "Productivity",
    description: "Company docs for the Company Brain and policy publishing.",
    scopes: [
      { id: "read", label: "Pages (read)", capabilityIds: [] },
      { id: "publish", label: "Pages (publish)", capabilityIds: ["policy.publish"], sensitive: true },
    ],
    status: "Available",
    grantedScopeIds: [],
    log: [],
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365",
    category: "Productivity",
    description: "Outlook mail and calendar, SharePoint documents.",
    scopes: [
      { id: "calendar", label: "Outlook calendar", capabilityIds: ["calendar.invite"] },
      { id: "mail", label: "Outlook mail (send)", capabilityIds: ["email.external"], sensitive: true },
    ],
    status: "Available",
    grantedScopeIds: [],
    log: [],
  },
]

/** Governance actions currently enabled by an integration's granted scopes. */
export function enabledCapabilities(integration: Integration) {
  if (integration.status === "Available") return []
  return integration.scopes
    .filter((scope) => integration.grantedScopeIds.includes(scope.id))
    .flatMap((scope) => scope.capabilityIds)
}
