export type OffboardingTask = {
  id: string
  title: string
  owner: "People Ops" | "IT" | "Manager" | "Employee" | "Finance"
  dueDate: string
  done: boolean
}

export type OffboardingPlan = {
  id: string
  employeeId: string
  employeeName: string
  title: string
  department: string
  lastDay: string
  reason: "Resignation" | "End of contract" | "Restructuring" | "Other"
  status: "In progress" | "Completed"
  tasks: OffboardingTask[]
}

export const seedOffboardingPlans: OffboardingPlan[] = [
  {
    id: "offb-1",
    employeeId: "emp-lena",
    employeeName: "Lena Ortiz",
    title: "Operations Lead",
    department: "Operations",
    lastDay: "2026-10-31",
    reason: "Resignation",
    status: "In progress",
    tasks: [
      { id: "ot-1", title: "Collect laptop and access badge", owner: "IT", dueDate: "2026-10-30", done: false },
      { id: "ot-2", title: "Revoke SSO and SaaS access", owner: "IT", dueDate: "2026-10-31", done: false },
      { id: "ot-3", title: "Exit interview", owner: "People Ops", dueDate: "2026-10-28", done: true },
      { id: "ot-4", title: "Knowledge transfer doc", owner: "Manager", dueDate: "2026-10-25", done: true },
      { id: "ot-5", title: "Final payroll & expenses", owner: "Finance", dueDate: "2026-11-05", done: false },
      { id: "ot-6", title: "Return signed equipment checklist", owner: "Employee", dueDate: "2026-10-31", done: false },
    ],
  },
  {
    id: "offb-2",
    employeeId: "emp-demo-past",
    employeeName: "Chris Novak",
    title: "Contract Designer",
    department: "Engineering",
    lastDay: "2026-09-15",
    reason: "End of contract",
    status: "Completed",
    tasks: [
      { id: "ot-7", title: "Archive design files", owner: "Manager", dueDate: "2026-09-14", done: true },
      { id: "ot-8", title: "Revoke Figma / Notion", owner: "IT", dueDate: "2026-09-15", done: true },
      { id: "ot-9", title: "Close contractor PO", owner: "Finance", dueDate: "2026-09-20", done: true },
    ],
  },
]

export function offboardingProgress(plan: OffboardingPlan) {
  if (!plan.tasks.length) return 0
  return Math.round((plan.tasks.filter((t) => t.done).length / plan.tasks.length) * 100)
}
