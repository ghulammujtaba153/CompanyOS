import { seedAgency } from "@/lib/agency"

export type PlanId = "starter" | "growth" | "scale"

export type SubscriptionPlan = {
  id: PlanId
  name: string
  priceMonthly: number
  description: string
  seats: number
  highlights: string[]
}

export type Invoice = {
  id: string
  date: string
  amount: number
  status: "Paid" | "Open" | "Failed"
  description: string
}

export type UsageMeter = {
  label: string
  used: number
  limit: number
  unit: string
}

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 49,
    description: "For small agencies getting organized.",
    seats: 10,
    highlights: ["Up to 10 seats", "Hiring ATS", "Client pipeline", "Email support"],
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 149,
    description: "For growing software agencies shipping with clients.",
    seats: 40,
    highlights: [
      "Up to 40 seats",
      "Full hiring + AI interview",
      "Work management",
      "Analytics",
      "Priority support",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 399,
    description: "For multi-squad agencies with advanced ops needs.",
    seats: 150,
    highlights: [
      "Up to 150 seats",
      "Everything in Growth",
      "SSO-ready workspace",
      "Custom retention",
      "Dedicated success",
    ],
  },
]

export const seedSubscription = {
  planId: "growth" as PlanId,
  status: "Active" as const,
  renewsOn: "2026-11-07",
  billingEmail: seedAgency.contactEmail,
  paymentMethod: {
    brand: "Visa",
    last4: "4242",
    expires: "08/28",
  },
  invoices: [
    {
      id: "INV-1042",
      date: "2026-10-07",
      amount: 149,
      status: "Paid",
      description: "Growth plan · October 2026",
    },
    {
      id: "INV-1031",
      date: "2026-09-07",
      amount: 149,
      status: "Paid",
      description: "Growth plan · September 2026",
    },
    {
      id: "INV-1020",
      date: "2026-08-07",
      amount: 149,
      status: "Paid",
      description: "Growth plan · August 2026",
    },
    {
      id: "INV-1009",
      date: "2026-07-07",
      amount: 49,
      status: "Paid",
      description: "Starter plan · July 2026",
    },
  ] as Invoice[],
}

export function usageMeters(input: {
  seatsUsed: number
  openJobs: number
  activeCandidates: number
  projects: number
}): UsageMeter[] {
  return [
    { label: "Seats", used: input.seatsUsed, limit: 40, unit: "people" },
    { label: "Open jobs", used: input.openJobs, limit: 25, unit: "roles" },
    { label: "Active candidates", used: input.activeCandidates, limit: 500, unit: "profiles" },
    { label: "Projects", used: input.projects, limit: 100, unit: "projects" },
  ]
}

export function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    amount
  )
}
