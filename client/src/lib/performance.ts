export type GoalStatus = "On track" | "At risk" | "Done" | "Not started"

export type PerformanceGoal = {
  id: string
  title: string
  progress: number
  status: GoalStatus
}

export type OneOnOneNote = {
  id: string
  date: string
  summary: string
}

export type PerformanceCycle = {
  id: string
  employeeId: string
  employeeName: string
  title: string
  managerName: string
  period: string
  status: "Active" | "Completed"
  goals: PerformanceGoal[]
  oneOnOnes: OneOnOneNote[]
}

export const seedPerformanceCycles: PerformanceCycle[] = [
  {
    id: "perf-1",
    employeeId: "emp-maya",
    employeeName: "Maya Patel",
    title: "Engineering Manager",
    managerName: "Ghulam Ahmed",
    period: "H2 2026",
    status: "Active",
    goals: [
      { id: "g1", title: "Ship client portal MVP", progress: 60, status: "On track" },
      { id: "g2", title: "Reduce P1 incident MTTR below 2h", progress: 40, status: "At risk" },
      { id: "g3", title: "Hire 2 senior engineers", progress: 80, status: "On track" },
    ],
    oneOnOnes: [
      { id: "o1", date: "2026-10-01", summary: "Aligned on portal milestones; capacity tight on ops work." },
      { id: "o2", date: "2026-09-17", summary: "Discussed hiring pipeline and interview scorecards." },
    ],
  },
  {
    id: "perf-2",
    employeeId: "emp-daniel",
    employeeName: "Daniel Kim",
    title: "Senior Engineer",
    managerName: "Maya Patel",
    period: "H2 2026",
    status: "Active",
    goals: [
      { id: "g4", title: "Own exception digest reliability", progress: 70, status: "On track" },
      { id: "g5", title: "Mentor one mid-level engineer", progress: 50, status: "On track" },
      { id: "g6", title: "Document runbooks for on-call", progress: 20, status: "Not started" },
    ],
    oneOnOnes: [
      { id: "o3", date: "2026-09-30", summary: "Good progress on digest; schedule runbook sprint." },
    ],
  },
  {
    id: "perf-3",
    employeeId: "emp-samuel",
    employeeName: "Samuel Wright",
    title: "Revenue Lead",
    managerName: "Ghulam Ahmed",
    period: "H1 2026",
    status: "Completed",
    goals: [
      { id: "g7", title: "Close $200k new ARR", progress: 100, status: "Done" },
      { id: "g8", title: "Launch pipeline board", progress: 100, status: "Done" },
    ],
    oneOnOnes: [
      { id: "o4", date: "2026-06-20", summary: "Cycle wrap — exceeded ARR target." },
    ],
  },
]
