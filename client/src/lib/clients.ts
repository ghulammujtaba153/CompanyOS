export type ClientStatus = "Active" | "Prospect" | "Paused" | "Churned"

export type EngagementStatus =
  | "Draft"
  | "Discovery"
  | "In progress"
  | "Ready to promote"
  | "Promoted"
  | "On hold"
  | "Completed"

export type PhaseStatus = "Not started" | "In progress" | "Blocked" | "Done"

export type ClientFile = {
  id: string
  name: string
  sizeLabel: string
  kind: "Brief" | "Contract" | "Asset" | "Feedback" | "Other"
  sharedBy: "Client" | "Internal"
  uploadedAt: string
  note: string
}

export type EngagementPhase = {
  id: string
  name: string
  status: PhaseStatus
  dueDate: string
  notes: string
}

export type Client = {
  id: string
  name: string
  company: string
  email: string
  phone: string
  website: string
  industry: string
  status: ClientStatus
  ownerId: string
  notes: string
  createdAt: string
}

export type ClientEngagement = {
  id: string
  clientId: string
  title: string
  description: string
  /** Quoted / contracted price in USD */
  price: number
  currency: "USD"
  status: EngagementStatus
  startDate: string
  dueDate: string
  ownerId: string
  files: ClientFile[]
  phases: EngagementPhase[]
  /** Set when promoted into Work Management */
  workProjectId?: string
  workProjectKey?: string
  createdAt: string
  updatedAt: string
}

export const clientStatuses: ClientStatus[] = ["Active", "Prospect", "Paused", "Churned"]

export const engagementStatuses: EngagementStatus[] = [
  "Draft",
  "Discovery",
  "In progress",
  "Ready to promote",
  "Promoted",
  "On hold",
  "Completed",
]

export const phaseStatuses: PhaseStatus[] = ["Not started", "In progress", "Blocked", "Done"]

export const fileKinds: ClientFile["kind"][] = ["Brief", "Contract", "Asset", "Feedback", "Other"]

function todayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

const t = todayIso()

export const defaultPhases = (): EngagementPhase[] => [
  {
    id: `phase-${Date.now()}-1`,
    name: "Discovery & requirements",
    status: "In progress",
    dueDate: addDays(t, 7),
    notes: "Collect goals, constraints, and success criteria from the client.",
  },
  {
    id: `phase-${Date.now()}-2`,
    name: "Scope & proposal",
    status: "Not started",
    dueDate: addDays(t, 14),
    notes: "Lock price, deliverables, and timeline before internal delivery.",
  },
  {
    id: `phase-${Date.now()}-3`,
    name: "Ready for delivery handoff",
    status: "Not started",
    dueDate: addDays(t, 21),
    notes: "Promote into Work Management once scope is approved.",
  },
]

export const seedClients: Client[] = [
  {
    id: "client-northwind",
    name: "Priya Nair",
    company: "Northwind Retail",
    email: "priya@northwind.example",
    phone: "+1 415 555 0142",
    website: "northwind.example",
    industry: "Retail",
    status: "Active",
    ownerId: "emp-ghulam",
    notes: "Primary contact for ops automation engagements.",
    createdAt: addDays(t, -60),
  },
  {
    id: "client-helix",
    name: "Marcus Lee",
    company: "Helix Health",
    email: "marcus@helix.example",
    phone: "+1 646 555 0190",
    website: "helix.example",
    industry: "Healthcare",
    status: "Active",
    ownerId: "emp-samuel",
    notes: "Needs governed workflows; privacy-sensitive.",
    createdAt: addDays(t, -40),
  },
  {
    id: "client-orbit",
    name: "Sofia Alvarez",
    company: "Orbit Logistics",
    email: "sofia@orbit.example",
    phone: "+34 600 555 011",
    website: "orbit.example",
    industry: "Logistics",
    status: "Prospect",
    ownerId: "emp-ghulam",
    notes: "Evaluating CompanyOS for fleet dispatch ops.",
    createdAt: addDays(t, -12),
  },
]

export const seedEngagements: ClientEngagement[] = [
  {
    id: "eng-northwind-ops",
    clientId: "client-northwind",
    title: "Store ops automation",
    description:
      "Automate inventory exception handling and manager approvals across 40 retail locations.",
    price: 48000,
    currency: "USD",
    status: "In progress",
    startDate: addDays(t, -20),
    dueDate: addDays(t, 45),
    ownerId: "emp-ghulam",
    createdAt: addDays(t, -20),
    updatedAt: addDays(t, -1),
    files: [
      {
        id: "file-nw-1",
        name: "Northwind-ops-brief.pdf",
        sizeLabel: "420 KB",
        kind: "Brief",
        sharedBy: "Client",
        uploadedAt: addDays(t, -18),
        note: "Initial goals and pain points.",
      },
      {
        id: "file-nw-2",
        name: "MSA-signed.pdf",
        sizeLabel: "210 KB",
        kind: "Contract",
        sharedBy: "Client",
        uploadedAt: addDays(t, -15),
        note: "Master services agreement.",
      },
      {
        id: "file-nw-3",
        name: "Sample-exception-export.csv",
        sizeLabel: "1.1 MB",
        kind: "Asset",
        sharedBy: "Client",
        uploadedAt: addDays(t, -10),
        note: "Sample inventory exceptions for discovery.",
      },
    ],
    phases: [
      {
        id: "ph-nw-1",
        name: "Discovery & requirements",
        status: "Done",
        dueDate: addDays(t, -10),
        notes: "Workshops completed with store managers.",
      },
      {
        id: "ph-nw-2",
        name: "Scope & proposal",
        status: "Done",
        dueDate: addDays(t, -5),
        notes: "Price and milestones approved.",
      },
      {
        id: "ph-nw-3",
        name: "Handoff prep",
        status: "In progress",
        dueDate: addDays(t, 5),
        notes: "Ready to promote once internal owners are assigned.",
      },
    ],
  },
  {
    id: "eng-helix-onboarding",
    clientId: "client-helix",
    title: "Clinical onboarding OS",
    description:
      "Governed onboarding flows for clinical staff with policy checks before account provisioning.",
    price: 72000,
    currency: "USD",
    status: "Discovery",
    startDate: addDays(t, -8),
    dueDate: addDays(t, 60),
    ownerId: "emp-samuel",
    createdAt: addDays(t, -8),
    updatedAt: addDays(t, -2),
    files: [
      {
        id: "file-hx-1",
        name: "Helix-compliance-notes.docx",
        sizeLabel: "88 KB",
        kind: "Brief",
        sharedBy: "Client",
        uploadedAt: addDays(t, -7),
        note: "HIPAA-oriented constraints.",
      },
    ],
    phases: [
      {
        id: "ph-hx-1",
        name: "Discovery & requirements",
        status: "In progress",
        dueDate: addDays(t, 10),
        notes: "Mapping current onboarding SOPs.",
      },
      {
        id: "ph-hx-2",
        name: "Scope & proposal",
        status: "Not started",
        dueDate: addDays(t, 24),
        notes: "",
      },
      {
        id: "ph-hx-3",
        name: "Ready for delivery handoff",
        status: "Not started",
        dueDate: addDays(t, 35),
        notes: "",
      },
    ],
  },
  {
    id: "eng-orbit-pilot",
    clientId: "client-orbit",
    title: "Dispatch pilot",
    description: "Pilot CompanyOS for exception routing in two regional hubs.",
    price: 18000,
    currency: "USD",
    status: "Draft",
    startDate: addDays(t, -3),
    dueDate: addDays(t, 30),
    ownerId: "emp-ghulam",
    createdAt: addDays(t, -3),
    updatedAt: addDays(t, -3),
    files: [],
    phases: defaultPhases().map((phase, index) => ({
      ...phase,
      id: `ph-or-${index + 1}`,
      status: "Not started" as PhaseStatus,
    })),
  },
]

export function formatEngagementMoney(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function engagementProgress(engagement: ClientEngagement) {
  if (!engagement.phases.length) return 0
  const done = engagement.phases.filter((phase) => phase.status === "Done").length
  return Math.round((done / engagement.phases.length) * 100)
}

export function suggestProjectKey(title: string) {
  const letters = title
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  if (!letters.length) return "CLT"
  if (letters.length === 1) return letters[0].slice(0, 4)
  return letters
    .slice(0, 4)
    .map((word) => word[0])
    .join("")
    .slice(0, 4)
}
