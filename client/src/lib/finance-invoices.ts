export type ClientInvoiceStatus = "Draft" | "Sent" | "Paid" | "Overdue" | "Void"

export type ClientInvoice = {
  id: string
  number: string
  clientId: string
  clientName: string
  engagementId: string
  engagementTitle: string
  issueDate: string
  dueDate: string
  amount: number
  currency: string
  status: ClientInvoiceStatus
  lineItems: { description: string; amount: number }[]
}

export const seedClientInvoices: ClientInvoice[] = [
  {
    id: "cinv-1",
    number: "INV-2208",
    clientId: "client-northwind",
    clientName: "Northwind Retail",
    engagementId: "eng-northwind-ops",
    engagementTitle: "Store ops automation",
    issueDate: "2026-09-30",
    dueDate: "2026-10-30",
    amount: 16000,
    currency: "USD",
    status: "Paid",
    lineItems: [
      { description: "Discovery & architecture", amount: 8000 },
      { description: "Sprint 1 delivery", amount: 8000 },
    ],
  },
  {
    id: "cinv-2",
    number: "INV-2214",
    clientId: "client-northwind",
    clientName: "Northwind Retail",
    engagementId: "eng-northwind-ops",
    engagementTitle: "Store ops automation",
    issueDate: "2026-10-07",
    dueDate: "2026-11-06",
    amount: 16000,
    currency: "USD",
    status: "Sent",
    lineItems: [{ description: "Sprint 2 delivery", amount: 16000 }],
  },
  {
    id: "cinv-3",
    number: "INV-2199",
    clientId: "client-helix",
    clientName: "Helix Health",
    engagementId: "eng-helix-onboarding",
    engagementTitle: "Clinical onboarding",
    issueDate: "2026-09-01",
    dueDate: "2026-10-01",
    amount: 12000,
    currency: "USD",
    status: "Overdue",
    lineItems: [{ description: "September retainer", amount: 12000 }],
  },
  {
    id: "cinv-4",
    number: "INV-2220",
    clientId: "client-orbit",
    clientName: "Orbit Logistics",
    engagementId: "eng-orbit-pilot",
    engagementTitle: "Fleet dispatch pilot",
    issueDate: "2026-10-08",
    dueDate: "2026-11-07",
    amount: 4500,
    currency: "USD",
    status: "Draft",
    lineItems: [{ description: "Kickoff & discovery (estimate)", amount: 4500 }],
  },
]

export function formatInvoiceMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount)
}
