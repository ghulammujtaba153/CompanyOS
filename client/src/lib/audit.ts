export type AuditEvent = {
  id: string
  at: string
  actor: string
  action: string
  target: string
  area: "Hiring" | "Organization" | "Clients" | "Work" | "Access" | "Finance" | "Documents" | "Billing"
}

export const seedAuditEvents: AuditEvent[] = [
  {
    id: "aud-1",
    at: "2026-10-07T09:12:00",
    actor: "Olivia Chen",
    action: "Moved candidate to Offer",
    target: "Jordan Lee · Senior Engineer",
    area: "Hiring",
  },
  {
    id: "aud-2",
    at: "2026-10-07T08:40:00",
    actor: "Ghulam Ahmed",
    action: "Updated department access",
    target: "Engineering",
    area: "Access",
  },
  {
    id: "aud-3",
    at: "2026-10-06T16:22:00",
    actor: "Samuel Wright",
    action: "Promoted engagement to project",
    target: "Store ops automation",
    area: "Clients",
  },
  {
    id: "aud-4",
    at: "2026-10-06T14:05:00",
    actor: "Maya Patel",
    action: "Changed issue status to Done",
    target: "OPS-12 · Exception digest",
    area: "Work",
  },
  {
    id: "aud-5",
    at: "2026-10-06T11:30:00",
    actor: "Olivia Chen",
    action: "Sent offer for e-sign",
    target: "Offer OFF-1042",
    area: "Hiring",
  },
  {
    id: "aud-6",
    at: "2026-10-05T17:18:00",
    actor: "Ghulam Ahmed",
    action: "Uploaded document",
    target: "Northwind MSA.pdf",
    area: "Documents",
  },
  {
    id: "aud-7",
    at: "2026-10-05T10:02:00",
    actor: "System",
    action: "Invoice marked Paid",
    target: "INV-2208",
    area: "Finance",
  },
  {
    id: "aud-8",
    at: "2026-10-04T15:44:00",
    actor: "Olivia Chen",
    action: "Invited employee",
    target: "aisha@acmelabs.io",
    area: "Organization",
  },
  {
    id: "aud-9",
    at: "2026-10-03T09:00:00",
    actor: "Maya Patel",
    action: "Approved leave request",
    target: "Daniel Kim · Annual leave",
    area: "Organization",
  },
  {
    id: "aud-10",
    at: "2026-10-02T13:20:00",
    actor: "Samuel Wright",
    action: "Updated contract renewal date",
    target: "CTR-NW-01",
    area: "Clients",
  },
]
