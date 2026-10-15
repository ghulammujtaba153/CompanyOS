import { seedLeave, seedOnboarding, workingDays, type LeaveRequest } from "@/lib/people-ops"
import { seedEmployees, type Employee } from "@/lib/organization"
import { seedIssues, seedProjects, type Project, type ProjectIssue } from "@/lib/project-types"

export type SalaryIncrement = {
  id: string
  effectiveDate: string
  previousAmount: number
  newAmount: number
  reason: string
  approvedById: string
}

export type SalaryPayment = {
  id: string
  paidOn: string
  periodLabel: string
  amount: number
  method: "Bank transfer" | "Payroll"
  status: "Paid" | "Processing" | "Failed"
  reference: string
}

export type EmployeeCompensation = {
  employeeId: string
  currency: "USD"
  /** Monthly base salary */
  baseSalary: number
  payFrequency: "Monthly" | "Bi-weekly"
  employmentType: "Full-time" | "Part-time" | "Contract"
  location: string
  phone: string
  bankLast4: string
  taxIdMasked: string
  nextPayDate: string
  increments: SalaryIncrement[]
  payments: SalaryPayment[]
}

function isoMonthsAgo(months: number, day = 28) {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, day))
  return d.toISOString().slice(0, 10)
}

function monthLabel(iso: string) {
  const [y, m] = iso.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

function buildPayments(employeeId: string, amount: number, count = 6): SalaryPayment[] {
  return Array.from({ length: count }, (_, index) => {
    const paidOn = isoMonthsAgo(index, 28)
    return {
      id: `${employeeId}-pay-${index}`,
      paidOn,
      periodLabel: monthLabel(paidOn),
      amount,
      method: "Bank transfer" as const,
      status: index === 0 && employeeId === "emp-lena" ? ("Failed" as const) : ("Paid" as const),
      reference: `PAY-${paidOn.replaceAll("-", "")}-${employeeId.slice(-4).toUpperCase()}`,
    }
  })
}

/** Admin-facing compensation records keyed by employee id. */
export const seedCompensation: Record<string, EmployeeCompensation> = {
  "emp-ghulam": {
    employeeId: "emp-ghulam",
    currency: "USD",
    baseSalary: 14500,
    payFrequency: "Monthly",
    employmentType: "Full-time",
    location: "Remote · PK",
    phone: "+92 300 555 0101",
    bankLast4: "4821",
    taxIdMasked: "•••-••-1842",
    nextPayDate: isoMonthsAgo(-1, 28),
    increments: [
      {
        id: "inc-ghulam-1",
        effectiveDate: "2025-07-01",
        previousAmount: 12000,
        newAmount: 14500,
        reason: "Founder compensation review",
        approvedById: "emp-ghulam",
      },
    ],
    payments: buildPayments("emp-ghulam", 14500),
  },
  "emp-maya": {
    employeeId: "emp-maya",
    currency: "USD",
    baseSalary: 9200,
    payFrequency: "Monthly",
    employmentType: "Full-time",
    location: "Lahore · Hybrid",
    phone: "+92 321 555 0188",
    bankLast4: "7730",
    taxIdMasked: "•••-••-2291",
    nextPayDate: isoMonthsAgo(-1, 28),
    increments: [
      {
        id: "inc-maya-1",
        effectiveDate: "2025-09-01",
        previousAmount: 8100,
        newAmount: 9200,
        reason: "Promotion to Engineering Manager",
        approvedById: "emp-ghulam",
      },
      {
        id: "inc-maya-2",
        effectiveDate: "2025-03-01",
        previousAmount: 7400,
        newAmount: 8100,
        reason: "Annual merit increase",
        approvedById: "emp-ghulam",
      },
    ],
    payments: buildPayments("emp-maya", 9200),
  },
  "emp-olivia": {
    employeeId: "emp-olivia",
    currency: "USD",
    baseSalary: 7800,
    payFrequency: "Monthly",
    employmentType: "Full-time",
    location: "Remote · SG",
    phone: "+65 8123 4400",
    bankLast4: "1194",
    taxIdMasked: "•••-••-5510",
    nextPayDate: isoMonthsAgo(-1, 28),
    increments: [
      {
        id: "inc-olivia-1",
        effectiveDate: "2025-11-01",
        previousAmount: 7200,
        newAmount: 7800,
        reason: "Market adjustment",
        approvedById: "emp-ghulam",
      },
    ],
    payments: buildPayments("emp-olivia", 7800),
  },
  "emp-samuel": {
    employeeId: "emp-samuel",
    currency: "USD",
    baseSalary: 6500,
    payFrequency: "Monthly",
    employmentType: "Full-time",
    location: "Dubai · On-site",
    phone: "+971 50 555 0199",
    bankLast4: "6642",
    taxIdMasked: "•••-••-8833",
    nextPayDate: isoMonthsAgo(-1, 28),
    increments: [
      {
        id: "inc-samuel-1",
        effectiveDate: "2026-01-01",
        previousAmount: 6000,
        newAmount: 6500,
        reason: "Quota attainment bonus to base",
        approvedById: "emp-ghulam",
      },
    ],
    payments: buildPayments("emp-samuel", 6500),
  },
  "emp-daniel": {
    employeeId: "emp-daniel",
    currency: "USD",
    baseSalary: 5400,
    payFrequency: "Monthly",
    employmentType: "Full-time",
    location: "Karachi · Hybrid",
    phone: "+92 333 555 0144",
    bankLast4: "9088",
    taxIdMasked: "•••-••-4402",
    nextPayDate: isoMonthsAgo(-1, 28),
    increments: [
      {
        id: "inc-daniel-1",
        effectiveDate: "2026-02-01",
        previousAmount: 5000,
        newAmount: 5400,
        reason: "6-month performance review",
        approvedById: "emp-maya",
      },
    ],
    payments: buildPayments("emp-daniel", 5400),
  },
  "emp-lena": {
    employeeId: "emp-lena",
    currency: "USD",
    baseSalary: 6100,
    payFrequency: "Monthly",
    employmentType: "Full-time",
    location: "Remote · DE",
    phone: "+49 170 555 0122",
    bankLast4: "3310",
    taxIdMasked: "•••-••-7721",
    nextPayDate: isoMonthsAgo(-1, 28),
    increments: [],
    payments: buildPayments("emp-lena", 6100),
  },
  "emp-aisha": {
    employeeId: "emp-aisha",
    currency: "USD",
    baseSalary: 5200,
    payFrequency: "Monthly",
    employmentType: "Full-time",
    location: "Islamabad · Hybrid",
    phone: "+92 345 555 0177",
    bankLast4: "2256",
    taxIdMasked: "•••-••-9901",
    nextPayDate: isoMonthsAgo(-1, 28),
    increments: [],
    payments: [],
  },
}

export function formatMoney(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function getCompensation(employeeId: string) {
  return seedCompensation[employeeId] ?? null
}

export function getEmployeeProjects(employee: Employee): Array<Project & { role: string }> {
  return seedProjects
    .filter((project) => project.members.some((member) => member.email === employee.email))
    .map((project) => ({
      ...project,
      role: project.members.find((member) => member.email === employee.email)?.role ?? "Member",
    }))
}

export function getEmployeeIssues(employee: Employee): ProjectIssue[] {
  return seedIssues
    .filter((issue) => issue.assignee === employee.name || issue.reporter === employee.name)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getEmployeeLeave(employeeId: string): LeaveRequest[] {
  return seedLeave
    .filter((item) => item.employeeId === employeeId)
    .sort((a, b) => b.start.localeCompare(a.start))
}

export function getDirectReports(employeeId: string, employees: Employee[] = seedEmployees) {
  return employees.filter((item) => item.managerId === employeeId && item.status !== "Suspended")
}

export function getOnboarding(employeeId: string) {
  return seedOnboarding.find((plan) => plan.employeeId === employeeId) ?? null
}

export function leaveDaysUsed(employeeId: string, type: LeaveRequest["type"]) {
  return getEmployeeLeave(employeeId)
    .filter((item) => item.type === type && item.status === "Approved")
    .reduce((sum, item) => sum + workingDays(item.start, item.end), 0)
}

export function profileStats(employee: Employee) {
  const projects = getEmployeeProjects(employee)
  const issues = getEmployeeIssues(employee)
  const leave = getEmployeeLeave(employee.id)
  const compensation = getCompensation(employee.id)
  const openIssues = issues.filter((issue) => issue.status !== "Done").length
  const lastPaid = compensation?.payments.find((payment) => payment.status === "Paid")

  return {
    projectCount: projects.length,
    issueCount: issues.length,
    openIssues,
    leaveCount: leave.length,
    lastPaidOn: lastPaid?.paidOn ?? "",
    monthlySalary: compensation?.baseSalary ?? 0,
  }
}
