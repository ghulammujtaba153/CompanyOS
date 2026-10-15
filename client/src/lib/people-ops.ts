import {
  createHiringConfig,
  hiringStages,
  type AiInterviewResult,
  type AiScreenResult,
  type ApplicationAnswer,
  type HiringJobFields,
  type TechnicalInvite,
} from "@/lib/hiring-pipeline"

// ---------- Hiring ----------

export { hiringStages }
export const candidateStages = hiringStages
export type CandidateStage = (typeof hiringStages)[number] | "Rejected"

export type Job = {
  id: string
  title: string
  departmentId: string
  hiringManagerId: string
  openings: number
  status: "Open" | "On hold" | "Closed"
  createdAt: string
} & HiringJobFields

export type Candidate = {
  id: string
  jobId: string
  name: string
  email: string
  source: "Referral" | "LinkedIn" | "Careers page" | "Agency" | "Recruiting Agent" | "Apply form"
  stage: CandidateStage
  /** 1–5 interview signal, 0 = not rated yet. */
  rating: number
  notes: string
  appliedAt: string
  /** Set when hired: the directory record created for them. */
  employeeId?: string
  phone: string
  resumeNote: string
  /** Demo CV attachment stored as a data URL (local only). */
  resumeFile?: {
    name: string
    size: number
    type: string
    dataUrl: string
  }
  applicationAnswers: ApplicationAnswer[]
  aiScreen?: AiScreenResult
  interviewToken?: string
  interviewExpiresAt?: string
  interviewInviteSentAt?: string
  aiInterview?: AiInterviewResult
  technicalInvite?: TechnicalInvite
}

export const candidateSources: Candidate["source"][] = [
  "Apply form",
  "Recruiting Agent",
  "Referral",
  "LinkedIn",
  "Careers page",
  "Agency",
]

// ---------- Onboarding ----------

export type OnboardingTask = {
  id: string
  title: string
  owner: "People Ops" | "IT" | "Manager" | "New hire"
  /** Days relative to start date (negative = before day one). */
  dueOffset: number
  done: boolean
}

export type OnboardingPlan = {
  id: string
  employeeId: string
  startDate: string
  buddyId: string
  tasks: OnboardingTask[]
}

export const onboardingTemplate: Omit<OnboardingTask, "id" | "done">[] = [
  { title: "Send offer letter & contract for signature", owner: "People Ops", dueOffset: -10 },
  { title: "Collect tax and bank details", owner: "People Ops", dueOffset: -5 },
  { title: "Order laptop and accessories", owner: "IT", dueOffset: -7 },
  { title: "Create accounts (email, SSO, CompanyOS)", owner: "IT", dueOffset: -2 },
  { title: "Prepare 30/60/90-day plan", owner: "Manager", dueOffset: -1 },
  { title: "Day-one welcome and team intro", owner: "Manager", dueOffset: 0 },
  { title: "Complete security & policy training", owner: "New hire", dueOffset: 3 },
  { title: "First 1:1 with manager", owner: "Manager", dueOffset: 5 },
  { title: "30-day check-in", owner: "People Ops", dueOffset: 30 },
]

/** Coerce API/datetime values to YYYY-MM-DD when possible. */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null
  const trimmed = value.trim()
  const candidate = trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed
  return isIsoDate(candidate) ? candidate : null
}

/** True when value looks like YYYY-MM-DD with a real calendar date. */
export function isIsoDate(iso: string | null | undefined): iso is string {
  if (!iso || typeof iso !== "string") return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return false
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

export function addDays(iso: string, days: number) {
  const base = toIsoDate(iso) ?? todayIso()
  const offset = Number.isFinite(days) ? days : 0
  const [y, m, d] = base.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + offset))
  if (Number.isNaN(date.getTime())) return todayIso()
  return date.toISOString().slice(0, 10)
}

export function todayIso() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export function planProgress(plan: OnboardingPlan) {
  if (!plan.tasks.length) return 0
  return Math.round((plan.tasks.filter((task) => task.done).length / plan.tasks.length) * 100)
}

export function overdueTasks(plan: OnboardingPlan) {
  const start = toIsoDate(plan.startDate)
  if (!start) return []
  const today = todayIso()
  return plan.tasks.filter((task) => {
    if (task.done) return false
    const offset = Number(task.dueOffset)
    if (!Number.isFinite(offset)) return false
    return addDays(start, offset) < today
  })
}

// ---------- Leave ----------

export const leaveTypes = ["Annual leave", "Sick leave", "Remote work", "Unpaid leave"] as const
export type LeaveType = (typeof leaveTypes)[number]

/** Yearly allowance in working days; null = not capped. */
export const leaveAllowance: Record<LeaveType, number | null> = {
  "Annual leave": 20,
  "Sick leave": 10,
  "Remote work": null,
  "Unpaid leave": null,
}

export type LeaveRequest = {
  id: string
  employeeId: string
  type: LeaveType
  start: string
  end: string
  reason: string
  status: "Pending" | "Approved" | "Declined" | "Cancelled"
  approverId: string
  decisionNote?: string
  createdAt: string
}

/** Working days (Mon–Fri) between two ISO dates, inclusive. */
export function workingDays(start: string, end: string) {
  if (!start || !end || end < start) return 0
  let count = 0
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
    if (weekday !== 0 && weekday !== 6) count++
  }
  return count
}

// ---------- Seeds (relative to today so the data stays current) ----------

const t = todayIso()

export const seedJobs: Job[] = [
  {
    id: "job-backend",
    title: "Senior Backend Engineer",
    departmentId: "dep-engineering",
    hiringManagerId: "emp-maya",
    openings: 2,
    status: "Open",
    createdAt: addDays(t, -40),
    description: "Own services, data models, and reliability for our core platform APIs.",
    location: "Remote · US/EU",
    employmentType: "Full-time",
    hiring: createHiringConfig("Senior Backend Engineer", "senior-backend-engineer"),
  },
  {
    id: "job-designer",
    title: "Product Designer",
    departmentId: "dep-engineering",
    hiringManagerId: "emp-maya",
    openings: 1,
    status: "Open",
    createdAt: addDays(t, -25),
    description: "Shape product craft across CompanyOS surfaces—from landing to ops workflows.",
    location: "Hybrid · SF",
    employmentType: "Full-time",
    hiring: createHiringConfig("Product Designer", "product-designer"),
  },
  {
    id: "job-ae",
    title: "Account Executive",
    departmentId: "dep-revenue",
    hiringManagerId: "emp-samuel",
    openings: 2,
    status: "Open",
    createdAt: addDays(t, -18),
    description: "Run full-cycle deals with mid-market teams adopting CompanyOS.",
    location: "Remote · Americas",
    employmentType: "Full-time",
    hiring: createHiringConfig("Account Executive", "account-executive"),
  },
  {
    id: "job-coordinator",
    title: "People Ops Coordinator",
    departmentId: "dep-people",
    hiringManagerId: "emp-olivia",
    openings: 1,
    status: "On hold",
    createdAt: addDays(t, -60),
    description: "Support hiring ops, onboarding, and employee programs.",
    location: "On-site · NYC",
    employmentType: "Full-time",
    hiring: {
      ...createHiringConfig("People Ops Coordinator", "people-ops-coordinator"),
      applyForm: {
        ...createHiringConfig("People Ops Coordinator", "people-ops-coordinator").applyForm,
        published: false,
      },
    },
  },
]

function blankCandidate(
  partial: Pick<Candidate, "id" | "jobId" | "name" | "email" | "source" | "stage" | "rating" | "notes" | "appliedAt"> &
    Partial<Candidate>
): Candidate {
  return {
    phone: "",
    resumeNote: "",
    applicationAnswers: [],
    ...partial,
  }
}

export const seedCandidates: Candidate[] = [
  blankCandidate({
    id: "cand-noah",
    jobId: "job-backend",
    name: "Noah Williams",
    email: "noah.w@example.com",
    source: "Recruiting Agent",
    stage: "AI Interview",
    rating: 4,
    notes: "Strong systems design; Go and Postgres.",
    appliedAt: addDays(t, -20),
    resumeNote: "8 years backend. Go, Postgres, Kubernetes.",
    applicationAnswers: [
      { question: "Relevant experience", answer: "Led payments platform rewrite in Go." },
      { question: "Why this role", answer: "Want to build ops tooling with AI governance." },
    ],
    aiScreen: {
      score: 88,
      summary: "Strong application signal for experience and role clarity. Recommend shortlist.",
      strengths: ["Relevant experience keywords", "Clear written communication", "Role motivation"],
      risks: ["Validate depth in live interview"],
      decidedAt: addDays(t, -14),
    },
    interviewToken: "iv-noah-demo",
    interviewExpiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
    interviewInviteSentAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  }),
  blankCandidate({
    id: "cand-elena",
    jobId: "job-backend",
    name: "Elena Rossi",
    email: "elena.rossi@example.com",
    source: "Referral",
    stage: "Offer",
    rating: 5,
    notes: "Referred by Maya. Excellent take-home.",
    appliedAt: addDays(t, -28),
    resumeNote: "Staff engineer at fintech.",
    applicationAnswers: [{ question: "Relevant experience", answer: "Scaled event pipelines to 2M events/day." }],
    aiScreen: {
      score: 94,
      summary: "Top-tier profile. Recommend shortlist.",
      strengths: ["Depth", "Ownership", "Referral signal"],
      risks: ["Validate culture add"],
      decidedAt: addDays(t, -22),
    },
    aiInterview: {
      score: 91,
      pass: true,
      summary: "Candidate communicated clearly under time pressure and covered ownership examples.",
      completedAt: addDays(t, -18),
      answers: [],
    },
    technicalInvite: {
      mode: "Online",
      scheduledNote: "Panel with Maya · Thursday 2pm",
      sentAt: addDays(t, -16),
    },
  }),
  blankCandidate({
    id: "cand-omar",
    jobId: "job-backend",
    name: "Omar Haddad",
    email: "omar.h@example.com",
    source: "LinkedIn",
    stage: "AI Screening",
    rating: 0,
    notes: "",
    appliedAt: addDays(t, -6),
    resumeNote: "Backend engineer, 4 years Node and Postgres.",
    applicationAnswers: [
      { question: "Relevant experience", answer: "Built billing APIs in Node." },
      { question: "Why this role", answer: "Excited about AI + ops products." },
    ],
  }),
  blankCandidate({
    id: "cand-jin",
    jobId: "job-backend",
    name: "Jin Park",
    email: "jin.park@example.com",
    source: "Apply form",
    stage: "Applied",
    rating: 0,
    notes: "",
    appliedAt: addDays(t, -2),
    resumeNote: "Recent grad, internship at SaaS startup.",
    applicationAnswers: [
      { question: "Relevant experience", answer: "Internship building REST services." },
      { question: "Why this role", answer: "Want to grow into backend systems." },
    ],
  }),
  blankCandidate({
    id: "cand-tom",
    jobId: "job-backend",
    name: "Tom Becker",
    email: "tom.b@example.com",
    source: "Agency",
    stage: "Rejected",
    rating: 2,
    notes: "Not enough backend depth.",
    appliedAt: addDays(t, -30),
    resumeNote: "Mostly frontend.",
    applicationAnswers: [],
    aiScreen: {
      score: 42,
      summary: "Mixed signals — experience present but answers lack depth for this bar.",
      strengths: ["Completed application"],
      risks: ["Thin written responses", "Unclear ownership examples"],
      decidedAt: addDays(t, -28),
    },
  }),
  blankCandidate({
    id: "cand-priya",
    jobId: "job-designer",
    name: "Priya Sharma",
    email: "priya.s@example.com",
    source: "LinkedIn",
    stage: "Technical Interview",
    rating: 4,
    notes: "Portfolio review scheduled.",
    appliedAt: addDays(t, -12),
    resumeNote: "Product designer, B2B SaaS.",
    applicationAnswers: [{ question: "Relevant experience", answer: "Redesigned onboarding for 40% activation lift." }],
    aiScreen: {
      score: 86,
      summary: "Strong application signal. Recommend shortlist.",
      strengths: ["Portfolio signal", "Outcome focus"],
      risks: ["Validate systems thinking"],
      decidedAt: addDays(t, -10),
    },
    aiInterview: {
      score: 82,
      pass: true,
      summary: "Clear communication and craft rationale under timed format.",
      completedAt: addDays(t, -8),
      answers: [],
    },
    technicalInvite: {
      mode: "On-site",
      scheduledNote: "Design critique · Friday morning",
      sentAt: addDays(t, -7),
    },
  }),
  blankCandidate({
    id: "cand-liam",
    jobId: "job-ae",
    name: "Liam Brooks",
    email: "liam.b@example.com",
    source: "Recruiting Agent",
    stage: "Shortlisted",
    rating: 3,
    notes: "",
    appliedAt: addDays(t, -7),
    resumeNote: "AE with SaaS mid-market wins.",
    applicationAnswers: [{ question: "Relevant experience", answer: "Closed $1.2M ARR last year." }],
    aiScreen: {
      score: 79,
      summary: "Strong commercial signal. Recommend shortlist.",
      strengths: ["Quota attainment", "Clear motivation"],
      risks: ["Validate discovery process"],
      decidedAt: addDays(t, -5),
    },
  }),
]

export const seedOnboarding: OnboardingPlan[] = [
  {
    id: "onb-aisha",
    employeeId: "emp-aisha",
    startDate: addDays(t, 6),
    buddyId: "emp-daniel",
    tasks: onboardingTemplate.map((task, index) => ({ ...task, id: `onb-aisha-${index}`, done: index < 3 })),
  },
  {
    id: "onb-daniel",
    employeeId: "emp-daniel",
    startDate: addDays(t, -20),
    buddyId: "emp-maya",
    tasks: onboardingTemplate.map((task, index) => ({ ...task, id: `onb-daniel-${index}`, done: index !== 8 && index !== 7 })),
  },
]

export const seedLeave: LeaveRequest[] = [
  { id: "LV-214", employeeId: "emp-samuel", type: "Annual leave", start: addDays(t, 14), end: addDays(t, 18), reason: "Family trip", status: "Pending", approverId: "emp-ghulam", createdAt: addDays(t, -1) },
  { id: "LV-215", employeeId: "emp-maya", type: "Sick leave", start: addDays(t, -9), end: addDays(t, -9), reason: "", status: "Approved", approverId: "emp-ghulam", createdAt: addDays(t, -9) },
  { id: "LV-216", employeeId: "emp-daniel", type: "Remote work", start: addDays(t, 3), end: addDays(t, 4), reason: "Home internet install", status: "Pending", approverId: "emp-maya", createdAt: addDays(t, -2) },
  { id: "LV-217", employeeId: "emp-ghulam", type: "Annual leave", start: addDays(t, -40), end: addDays(t, -36), reason: "", status: "Approved", approverId: "emp-olivia", createdAt: addDays(t, -50) },
]
