import {
  evaluate,
  type ActionContext,
  type AutonomyLevel,
  type Decision,
  type FirewallRule,
  type Passport,
} from "@/lib/governance"

export type Performer = { kind: "person"; employeeId: string } | { kind: "agent"; passportId: string }

export type ProcessStep = {
  id: string
  name: string
  performer: Performer
  /** Governance action this step performs; required for an agent to take it over. */
  capabilityId: string
  /** Hands-on minutes for a person to do the step. */
  durationMin: number
  /** Typical hours the work waits before this step starts. */
  waitHours: number
}

export type Process = {
  id: string
  name: string
  description: string
  departmentId: string
  ownerId: string
  runsPerWeek: number
  /** Typical action context used when governance evaluates agent steps. */
  context: ActionContext
  steps: ProcessStep[]
}

/** Assumptions for how governance outcomes translate into time. */
export const APPROVAL_MINUTES = 5
export const APPROVAL_WAIT_HOURS = 2
export const AGENT_MINUTES = 1
export const DRAFT_REVIEW_SHARE = 0.4

export type Policy = { passports: Passport[]; rules: FirewallRule[]; defaultAutonomy: AutonomyLevel }

export type StepResult = {
  step: ProcessStep
  decision?: Decision
  /** Person minutes per run after governance. */
  humanMinutes: number
  /** Elapsed hours per run (wait + work). */
  elapsedHours: number
  humanTouch: boolean
}

export function evaluateStep(step: ProcessStep, process: Process, policy: Policy): StepResult {
  if (step.performer.kind === "person") {
    return {
      step,
      humanMinutes: step.durationMin,
      elapsedHours: step.waitHours + step.durationMin / 60,
      humanTouch: true,
    }
  }
  const passportId = step.performer.passportId
  const passport = policy.passports.find((item) => item.id === passportId)
  const decision = passport
    ? evaluate(passport, step.capabilityId, process.context, policy.rules, policy.defaultAutonomy)
    : undefined

  switch (decision?.outcome) {
    case "Auto-execute":
      return { step, decision, humanMinutes: 0, elapsedHours: AGENT_MINUTES / 60, humanTouch: false }
    case "Needs approval":
      return {
        step,
        decision,
        humanMinutes: APPROVAL_MINUTES,
        elapsedHours: APPROVAL_WAIT_HOURS + (APPROVAL_MINUTES + AGENT_MINUTES) / 60,
        humanTouch: true,
      }
    case "Draft only": {
      const review = Math.round(step.durationMin * DRAFT_REVIEW_SHARE)
      return { step, decision, humanMinutes: review, elapsedHours: step.waitHours + review / 60, humanTouch: true }
    }
    default:
      // Blocked or no passport: a person has to pick the work up, as before.
      return {
        step,
        decision,
        humanMinutes: step.durationMin,
        elapsedHours: step.waitHours + step.durationMin / 60,
        humanTouch: true,
      }
  }
}

export type ProcessMetrics = {
  steps: StepResult[]
  cycleHours: number
  humanMinutesPerRun: number
  humanHoursPerWeek: number
  humanTouches: number
  agentSteps: number
  blockedSteps: number
}

export function processMetrics(process: Process, policy: Policy): ProcessMetrics {
  const steps = process.steps.map((step) => evaluateStep(step, process, policy))
  const humanMinutesPerRun = steps.reduce((sum, item) => sum + item.humanMinutes, 0)
  return {
    steps,
    cycleHours: steps.reduce((sum, item) => sum + item.elapsedHours, 0),
    humanMinutesPerRun,
    humanHoursPerWeek: (humanMinutesPerRun * process.runsPerWeek) / 60,
    humanTouches: steps.filter((item) => item.humanTouch).length,
    agentSteps: process.steps.filter((step) => step.performer.kind === "agent").length,
    blockedSteps: steps.filter((item) => item.decision?.outcome === "Blocked").length,
  }
}

/** Active agents whose passport covers a step's action. */
export function candidateAgents(step: ProcessStep, policy: Policy) {
  return policy.passports.filter(
    (passport) => passport.status === "Active" && passport.capabilityIds.includes(step.capabilityId)
  )
}

/**
 * Best-case plan: each person step goes to the eligible agent that saves the most
 * person time under current policy. Returns the proposed process.
 */
export function bestCasePlan(process: Process, policy: Policy): Process {
  return {
    ...process,
    steps: process.steps.map((step) => {
      if (step.performer.kind === "agent" || !step.capabilityId) return step
      let best = step
      let bestMinutes = step.durationMin
      for (const passport of candidateAgents(step, policy)) {
        const trial = { ...step, performer: { kind: "agent", passportId: passport.id } as Performer }
        const result = evaluateStep(trial, process, policy)
        if (result.decision?.outcome !== "Blocked" && result.humanMinutes < bestMinutes) {
          best = trial
          bestMinutes = result.humanMinutes
        }
      }
      return best
    }),
  }
}

export function formatHours(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

export type ProcessRunStatus =
  | "Running"
  | "WaitingApproval"
  | "WaitingPerson"
  | "Completed"
  | "Failed"
  | "Cancelled"

export type ProcessRunStepResult = {
  stepId: string
  name: string
  status: string
  detail?: string
  actionId?: string
  decision?: string
  at?: string
}

export type ProcessRun = {
  id: string
  processId: string
  processName: string
  status: ProcessRunStatus
  currentStepIndex: number
  context: ActionContext
  steps: ProcessStep[]
  stepResults: ProcessRunStepResult[]
  startedBy: string
  note: string
  createdAt: string
  updatedAt: string
}

// ---------- Seeds ----------

const person = (employeeId: string): Performer => ({ kind: "person", employeeId })
const agent = (passportId: string): Performer => ({ kind: "agent", passportId })

export const seedProcesses: Process[] = [
  {
    id: "proc-purchase",
    name: "Purchase approvals",
    description: "From a team's purchase request to the vendor being paid.",
    departmentId: "dep-finance",
    ownerId: "emp-ghulam",
    runsPerWeek: 25,
    context: { amount: 1200, records: 0, external: true },
    steps: [
      { id: "s1", name: "Review purchase request", performer: agent("pp-finance"), capabilityId: "invoice.read", durationMin: 10, waitHours: 4 },
      { id: "s2", name: "Match invoice to request", performer: agent("pp-finance"), capabilityId: "invoice.read", durationMin: 15, waitHours: 6 },
      { id: "s3", name: "Prepare payment", performer: agent("pp-finance"), capabilityId: "payment.prepare", durationMin: 20, waitHours: 4 },
      { id: "s4", name: "Execute payment", performer: agent("pp-finance"), capabilityId: "payment.execute", durationMin: 10, waitHours: 8 },
    ],
  },
  {
    id: "proc-scheduling",
    name: "Candidate scheduling",
    description: "Getting a screened candidate onto the right interviewers' calendars.",
    departmentId: "dep-people",
    ownerId: "emp-olivia",
    runsPerWeek: 30,
    context: { amount: 0, records: 0, external: true },
    steps: [
      { id: "s1", name: "Review candidate profile", performer: agent("pp-recruiting"), capabilityId: "candidate.read", durationMin: 15, waitHours: 24 },
      { id: "s2", name: "Find interviewer availability", performer: agent("pp-recruiting"), capabilityId: "interview.schedule", durationMin: 20, waitHours: 4 },
      { id: "s3", name: "Send calendar invite", performer: agent("pp-recruiting"), capabilityId: "calendar.invite", durationMin: 5, waitHours: 2 },
      { id: "s4", name: "Brief interviewers", performer: person("emp-maya"), capabilityId: "", durationMin: 10, waitHours: 1 },
    ],
  },
  {
    id: "proc-onboarding",
    name: "Employee onboarding",
    description: "Everything between a signed offer and a productive first week.",
    departmentId: "dep-people",
    ownerId: "emp-olivia",
    runsPerWeek: 2,
    context: { amount: 0, records: 0, external: false },
    steps: [
      { id: "s1", name: "Draft onboarding plan", performer: agent("pp-people"), capabilityId: "onboarding.draft", durationMin: 45, waitHours: 24 },
      { id: "s2", name: "Create accounts", performer: person("emp-daniel"), capabilityId: "", durationMin: 30, waitHours: 24 },
      { id: "s3", name: "Order laptop", performer: person("emp-ghulam"), capabilityId: "", durationMin: 20, waitHours: 48 },
      { id: "s4", name: "Schedule first-week meetings", performer: agent("pp-people"), capabilityId: "calendar.invite", durationMin: 25, waitHours: 4 },
    ],
  },
  {
    id: "proc-delivery",
    name: "Client brief → delivery board",
    description: "Turn a client brief into a project and first issues under Delivery Agent.",
    departmentId: "dep-engineering",
    ownerId: "emp-ghulam",
    runsPerWeek: 8,
    context: { amount: 0, records: 2, external: false },
    steps: [
      { id: "s1", name: "Create project from brief", performer: agent("pp-delivery"), capabilityId: "project.create", durationMin: 20, waitHours: 2 },
      { id: "s2", name: "Open initial issues", performer: agent("pp-delivery"), capabilityId: "issue.create", durationMin: 25, waitHours: 1 },
      { id: "s3", name: "Triage priorities with PM", performer: person("emp-ghulam"), capabilityId: "", durationMin: 30, waitHours: 4 },
    ],
  },
]
