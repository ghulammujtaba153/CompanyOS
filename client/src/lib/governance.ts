export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5

export const autonomyLevels: { level: AutonomyLevel; name: string; description: string; effect: string }[] = [
  { level: 0, name: "Observe", description: "Watches processes and reports what people do.", effect: "Never acts" },
  { level: 1, name: "Recommend", description: "Suggests steps to automate without acting.", effect: "Never acts" },
  { level: 2, name: "Draft", description: "Prepares emails, documents, and actions for a person to send.", effect: "Drafts only" },
  { level: 3, name: "Execute with approval", description: "Prepares an action; a person approves; the agent executes.", effect: "Every action needs approval" },
  { level: 4, name: "Conditional autonomy", description: "Executes automatically unless a firewall rule triggers.", effect: "Auto unless a rule triggers" },
  { level: 5, name: "Autonomous", description: "Executes within boundaries; only High/Critical rules stop it.", effect: "Auto except High/Critical rules" },
]

export type Capability = { id: string; name: string; category: string }

/** Everything an agent could be allowed to do. Passports and rules reference these ids. */
export const capabilities: Capability[] = [
  { id: "candidate.read", name: "Read candidate profiles", category: "Hiring" },
  { id: "interview.schedule", name: "Schedule interviews", category: "Hiring" },
  { id: "offer.send", name: "Send offer letters", category: "Hiring" },
  { id: "invoice.read", name: "Read invoices", category: "Finance" },
  { id: "payment.prepare", name: "Prepare payment drafts", category: "Finance" },
  { id: "payment.execute", name: "Execute payments", category: "Finance" },
  { id: "vendor.bank_change", name: "Change vendor bank details", category: "Finance" },
  { id: "onboarding.draft", name: "Draft onboarding plans", category: "People" },
  { id: "leave.update", name: "Update leave records", category: "People" },
  { id: "payroll.export", name: "Export payroll data", category: "People" },
  { id: "crm.sync", name: "Sync CRM records", category: "Revenue" },
  { id: "contract.send", name: "Send customer contracts", category: "Revenue" },
  { id: "pricing.change", name: "Change pricing", category: "Revenue" },
  { id: "calendar.invite", name: "Send calendar invites", category: "Communication" },
  { id: "email.external", name: "Email external contacts", category: "Communication" },
  { id: "policy.publish", name: "Publish policy documents", category: "Data & compliance" },
  { id: "data.export", name: "Export customer data", category: "Data & compliance" },
  { id: "project.create", name: "Create projects", category: "Work" },
  { id: "issue.create", name: "Create issues", category: "Work" },
  { id: "issue.update", name: "Update issues", category: "Work" },
  { id: "brain.ask", name: "Ask Company Brain", category: "Knowledge" },
  { id: "document.search", name: "Search documents", category: "Knowledge" },
]

export const capabilityName = (id: string) => capabilities.find((item) => item.id === id)?.name ?? id

export type Passport = {
  id: string
  agent: string
  /** What the agent is for, shown in AI Workforce. */
  description?: string
  /** Department the agent works for. */
  departmentId?: string
  /** Accountable human (employee id). */
  ownerId: string
  /** null = inherit the company default. */
  autonomy: AutonomyLevel | null
  capabilityIds: string[]
  status: "Active" | "Paused"
}

export const riskLevels = ["Low", "Medium", "High", "Critical"] as const
export type Risk = (typeof riskLevels)[number]

export const conditions = ["Always", "Amount over", "External party", "Records over"] as const
export type Condition = (typeof conditions)[number]

export const approvalPaths = [
  "Auto-execute",
  "Accountable owner",
  "Department head",
  "Executive",
  "Legal / security review",
  "Block",
] as const
export type ApprovalPath = (typeof approvalPaths)[number]

export type FirewallRule = {
  id: string
  capabilityId: string
  condition: Condition
  /** Used by "Amount over" ($) and "Records over" (count). */
  threshold: number
  risk: Risk
  path: ApprovalPath
  enabled: boolean
}

export type ActionContext = { amount: number; external: boolean; records: number }

export type Decision = {
  outcome: "Blocked" | "Draft only" | "Needs approval" | "Auto-execute"
  approver?: ApprovalPath
  reasons: string[]
  matchedRules: FirewallRule[]
}

const pathRank: Record<ApprovalPath, number> = {
  "Auto-execute": 0,
  "Accountable owner": 1,
  "Department head": 2,
  Executive: 3,
  "Legal / security review": 4,
  Block: 5,
}

export function conditionLabel(rule: Pick<FirewallRule, "condition" | "threshold">) {
  if (rule.condition === "Amount over") return `Amount over $${rule.threshold.toLocaleString()}`
  if (rule.condition === "Records over") return `More than ${rule.threshold.toLocaleString()} records`
  if (rule.condition === "External party") return "Involves an external party"
  return "Always"
}

function ruleMatches(rule: FirewallRule, context: ActionContext) {
  switch (rule.condition) {
    case "Always":
      return true
    case "Amount over":
      return context.amount > rule.threshold
    case "Records over":
      return context.records > rule.threshold
    case "External party":
      return context.external
  }
}

/**
 * The decision engine: what happens when `passport`'s agent tries `capabilityId`.
 * Order: paused → passport scope → autonomy level → firewall rules (strictest wins).
 */
export function evaluate(
  passport: Passport,
  capabilityId: string,
  context: ActionContext,
  rules: FirewallRule[],
  defaultAutonomy: AutonomyLevel
): Decision {
  const level = passport.autonomy ?? defaultAutonomy
  const levelName = autonomyLevels[level].name
  const matchedRules = rules.filter(
    (rule) => rule.enabled && rule.capabilityId === capabilityId && ruleMatches(rule, context)
  )

  if (passport.status === "Paused") {
    return { outcome: "Blocked", reasons: [`${passport.agent} is paused.`], matchedRules }
  }
  if (!passport.capabilityIds.includes(capabilityId)) {
    return {
      outcome: "Blocked",
      reasons: [`"${capabilityName(capabilityId)}" is not in ${passport.agent}'s passport.`],
      matchedRules,
    }
  }

  const strictest = [...matchedRules].sort((a, b) => pathRank[b.path] - pathRank[a.path])[0]
  const ruleReasons = matchedRules.map(
    (rule) => `Rule: ${conditionLabel(rule)} → ${rule.path} (${rule.risk} risk).`
  )

  if (strictest?.path === "Block") {
    return { outcome: "Blocked", reasons: ruleReasons, matchedRules }
  }
  if (level <= 1) {
    return {
      outcome: "Blocked",
      reasons: [`Autonomy L${level} (${levelName}) can only observe or recommend.`],
      matchedRules,
    }
  }
  if (level === 2) {
    return {
      outcome: "Draft only",
      reasons: [`Autonomy L2 (${levelName}): the agent drafts, a person sends.`, ...ruleReasons],
      matchedRules,
    }
  }

  const needsApproval =
    level === 3 ||
    (level === 4 && strictest && strictest.path !== "Auto-execute") ||
    (level === 5 && strictest && strictest.path !== "Auto-execute" && (strictest.risk === "High" || strictest.risk === "Critical"))

  if (needsApproval) {
    const approver =
      strictest && strictest.path !== "Auto-execute" ? strictest.path : ("Accountable owner" as ApprovalPath)
    return {
      outcome: "Needs approval",
      approver,
      reasons: [
        level === 3 ? `Autonomy L3 (${levelName}) requires approval for every action.` : `Autonomy L${level} (${levelName}).`,
        ...ruleReasons,
      ],
      matchedRules,
    }
  }

  return {
    outcome: "Auto-execute",
    reasons: [
      `Autonomy L${level} (${levelName}).`,
      ...(ruleReasons.length ? ruleReasons.map((reason) => `${reason} Allowed at this level.`) : ["No firewall rule triggered."]),
    ],
    matchedRules,
  }
}

// ---------- Seeds ----------

export const seedPassports: Passport[] = [
  { id: "pp-recruiting", description: "Sources, screens, and schedules candidates for open roles.", departmentId: "dep-people", agent: "Recruiting Agent", ownerId: "emp-olivia", autonomy: 3, capabilityIds: ["candidate.read", "interview.schedule", "calendar.invite", "offer.send", "email.external", "document.search"], status: "Active" },
  { id: "pp-finance", description: "Processes invoices, flags exceptions, and pays approved vendors.", departmentId: "dep-finance", agent: "Finance Agent", ownerId: "emp-lena", autonomy: 4, capabilityIds: ["invoice.read", "payment.prepare", "payment.execute"], status: "Active" },
  { id: "pp-people", description: "Drafts onboarding plans and keeps leave records up to date.", departmentId: "dep-people", agent: "People Ops Agent", ownerId: "emp-olivia", autonomy: 2, capabilityIds: ["onboarding.draft", "leave.update", "calendar.invite", "brain.ask", "document.search"], status: "Active" },
  { id: "pp-revenue", description: "Keeps the CRM in sync and prepares pipeline follow-ups.", departmentId: "dep-revenue", agent: "Revenue Ops Agent", ownerId: "emp-samuel", autonomy: null, capabilityIds: ["crm.sync", "email.external"], status: "Paused" },
  { id: "pp-delivery", description: "Creates projects and issues from briefs; triages delivery work.", departmentId: "dep-engineering", agent: "Delivery Agent", ownerId: "emp-maya", autonomy: 4, capabilityIds: ["project.create", "issue.create", "issue.update", "brain.ask", "document.search"], status: "Active" },
]

export const seedRules: FirewallRule[] = [
  { id: "fr-offer", capabilityId: "offer.send", condition: "Always", threshold: 0, risk: "High", path: "Executive", enabled: true },
  { id: "fr-payment", capabilityId: "payment.execute", condition: "Amount over", threshold: 500, risk: "Medium", path: "Department head", enabled: true },
  { id: "fr-payment-big", capabilityId: "payment.execute", condition: "Amount over", threshold: 10000, risk: "High", path: "Executive", enabled: true },
  { id: "fr-bank", capabilityId: "vendor.bank_change", condition: "Always", threshold: 0, risk: "Critical", path: "Block", enabled: true },
  { id: "fr-calendar", capabilityId: "calendar.invite", condition: "External party", threshold: 0, risk: "Low", path: "Accountable owner", enabled: true },
  { id: "fr-export", capabilityId: "data.export", condition: "Records over", threshold: 100, risk: "High", path: "Legal / security review", enabled: true },
  { id: "fr-policy", capabilityId: "policy.publish", condition: "Always", threshold: 0, risk: "High", path: "Legal / security review", enabled: true },
  { id: "fr-payroll", capabilityId: "payroll.export", condition: "Always", threshold: 0, risk: "Critical", path: "Block", enabled: true },
  { id: "fr-project", capabilityId: "project.create", condition: "Always", threshold: 0, risk: "Medium", path: "Accountable owner", enabled: true },
  { id: "fr-issue-bulk", capabilityId: "issue.create", condition: "Records over", threshold: 5, risk: "Medium", path: "Department head", enabled: true },
]

/** Starting points for new agents: sensible scope and a conservative autonomy level. */
export const agentTemplates: {
  id: string
  name: string
  description: string
  departmentId: string
  autonomy: AutonomyLevel
  capabilityIds: string[]
}[] = [
  { id: "support", name: "Customer Support Agent", description: "Answers customer emails and escalates complex cases.", departmentId: "dep-revenue", autonomy: 2, capabilityIds: ["email.external", "crm.sync"] },
  { id: "procurement", name: "Procurement Agent", description: "Prepares purchase payments and keeps vendor records current.", departmentId: "dep-finance", autonomy: 3, capabilityIds: ["invoice.read", "payment.prepare", "payment.execute"] },
  { id: "scheduler", name: "Scheduling Agent", description: "Books internal and external meetings across calendars.", departmentId: "dep-operations", autonomy: 4, capabilityIds: ["calendar.invite"] },
  { id: "compliance", name: "Compliance Agent", description: "Drafts policy updates and prepares audit data exports.", departmentId: "dep-leadership", autonomy: 2, capabilityIds: ["policy.publish", "data.export"] },
  { id: "custom", name: "Custom agent", description: "", departmentId: "", autonomy: 1, capabilityIds: [] },
]
