export type ContractStatus = "Draft" | "Active" | "Renewal due" | "Expired" | "Terminated"

export type ContractModel = "Retainer" | "Fixed fee" | "Time & materials"

export type ClientContract = {
  id: string
  engagementId: string
  clientId: string
  clientName: string
  title: string
  model: ContractModel
  value: number
  currency: string
  startDate: string
  renewalDate: string
  status: ContractStatus
  notes: string
}

export const contractStatuses: ContractStatus[] = [
  "Draft",
  "Active",
  "Renewal due",
  "Expired",
  "Terminated",
]

export const contractModels: ContractModel[] = ["Retainer", "Fixed fee", "Time & materials"]

export const seedContracts: ClientContract[] = [
  {
    id: "ctr-nw-01",
    engagementId: "eng-northwind-ops",
    clientId: "client-northwind",
    clientName: "Northwind Retail",
    title: "Store ops automation MSA",
    model: "Fixed fee",
    value: 48000,
    currency: "USD",
    startDate: "2026-09-10",
    renewalDate: "2027-09-10",
    status: "Active",
    notes: "Includes discovery + delivery phases. Change orders billed T&M.",
  },
  {
    id: "ctr-hx-01",
    engagementId: "eng-helix-onboarding",
    clientId: "client-helix",
    clientName: "Helix Health",
    title: "Clinical onboarding retainer",
    model: "Retainer",
    value: 12000,
    currency: "USD",
    startDate: "2026-08-01",
    renewalDate: "2026-11-01",
    status: "Renewal due",
    notes: "Monthly retainer for governed onboarding workflows.",
  },
  {
    id: "ctr-or-01",
    engagementId: "eng-orbit-pilot",
    clientId: "client-orbit",
    clientName: "Orbit Logistics",
    title: "Fleet dispatch pilot SOW",
    model: "Time & materials",
    value: 18000,
    currency: "USD",
    startDate: "2026-10-15",
    renewalDate: "2027-01-15",
    status: "Draft",
    notes: "Awaiting client legal review.",
  },
]

export function formatContractMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount)
}
