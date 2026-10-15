export type TimeEntry = {
  id: string
  projectId: string
  projectName: string
  projectKey: string
  hours: number
  billable: boolean
  note: string
}

export type TimesheetWeek = {
  weekStart: string
  entries: TimeEntry[]
}

export type UtilizationRow = {
  employeeId: string
  name: string
  department: string
  billablePct: number
  capacityHours: number
  loggedHours: number
}

export const seedTimesheet: TimesheetWeek = {
  weekStart: "2026-10-06",
  entries: [
    {
      id: "te-1",
      projectId: "proj-ops",
      projectName: "Store ops automation",
      projectKey: "OPS",
      hours: 18,
      billable: true,
      note: "Exception digest + approvals",
    },
    {
      id: "te-2",
      projectId: "proj-crm",
      projectName: "CRM integration",
      projectKey: "CRM",
      hours: 8,
      billable: true,
      note: "Sync mapping workshops",
    },
    {
      id: "te-3",
      projectId: "proj-internal",
      projectName: "CompanyOS platform",
      projectKey: "COS",
      hours: 10,
      billable: false,
      note: "Hiring ATS polish",
    },
  ],
}

export const seedUtilization: UtilizationRow[] = [
  {
    employeeId: "emp-maya",
    name: "Maya Patel",
    department: "Engineering",
    billablePct: 62,
    capacityHours: 40,
    loggedHours: 38,
  },
  {
    employeeId: "emp-daniel",
    name: "Daniel Kim",
    department: "Engineering",
    billablePct: 78,
    capacityHours: 40,
    loggedHours: 41,
  },
  {
    employeeId: "emp-aisha",
    name: "Aisha Khan",
    department: "Engineering",
    billablePct: 55,
    capacityHours: 40,
    loggedHours: 36,
  },
  {
    employeeId: "emp-samuel",
    name: "Samuel Wright",
    department: "Revenue",
    billablePct: 35,
    capacityHours: 40,
    loggedHours: 32,
  },
  {
    employeeId: "emp-ghulam",
    name: "Ghulam Ahmed",
    department: "Leadership",
    billablePct: 20,
    capacityHours: 40,
    loggedHours: 42,
  },
]

export function weekTotal(entries: TimeEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.hours, 0)
}

export function billableTotal(entries: TimeEntry[]) {
  return entries.filter((e) => e.billable).reduce((sum, entry) => sum + entry.hours, 0)
}
