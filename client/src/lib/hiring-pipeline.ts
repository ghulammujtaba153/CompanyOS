function addDays(iso: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso || "").trim())
  if (!match) {
    const now = new Date()
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  }
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const offset = Number.isFinite(days) ? days : 0
  const date = new Date(Date.UTC(y, m - 1, d + offset))
  if (Number.isNaN(date.getTime())) {
    const now = new Date()
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  }
  return date.toISOString().slice(0, 10)
}

function todayIso() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export const hiringStages = [
  "Applied",
  "AI Screening",
  "Shortlisted",
  "AI Interview",
  "Technical Interview",
  "Offer",
  "Hired",
] as const

export type HiringStage = (typeof hiringStages)[number] | "Rejected"

export type InterviewQuestion = {
  id: string
  prompt: string
  seconds: number
  /** AI draft awaiting HR approval */
  approved: boolean
}

export type ApplyFormConfig = {
  slug: string
  /** ISO date when applications close */
  expiresAt: string
  welcomeMessage: string
  published: boolean
}

export type JobHiringConfig = {
  applyForm: ApplyFormConfig
  /** Seconds before selfie capture during AI interview */
  captureDelaySeconds: number
  /** Hours the AI interview invite stays valid */
  interviewLinkHours: number
  questions: InterviewQuestion[]
  /** Minimum AI interview score (0–100) to pass */
  passScore: number
}

export type ApplicationAnswer = {
  question: string
  answer: string
}

export type AiScreenResult = {
  score: number
  summary: string
  strengths: string[]
  risks: string[]
  decidedAt: string
}

export type InterviewAnswer = {
  questionId: string
  answer: string
  capturedAt: string
}

/** Camera/screen stills taken during the AI interview for reviewer audit. */
export type InterviewCapture = {
  id: string
  dataUrl: string
  capturedAt: string
  kind: "identity" | "random"
  questionId?: string
}

export type AiInterviewResult = {
  score: number
  summary: string
  pass: boolean
  completedAt: string
  selfieDataUrl?: string
  /** Random mid-interview frames + identity capture for HR review. */
  captures?: InterviewCapture[]
  answers: InterviewAnswer[]
}

export type TechnicalInvite = {
  mode: "On-site" | "Online"
  scheduledNote: string
  sentAt: string
}

/** Extended job fields used by the ATS pipeline. */
export type HiringJobFields = {
  description: string
  location: string
  employmentType: "Full-time" | "Part-time" | "Contract"
  hiring: JobHiringConfig
}

export type ResumeFile = {
  name: string
  size: number
  type: string
  dataUrl: string
}

export type HiringCandidateFields = {
  phone: string
  resumeNote: string
  resumeFile?: ResumeFile
  applicationAnswers: ApplicationAnswer[]
  aiScreen?: AiScreenResult
  interviewToken?: string
  interviewExpiresAt?: string
  interviewInviteSentAt?: string
  aiInterview?: AiInterviewResult
  technicalInvite?: TechnicalInvite
}

export function defaultQuestions(jobTitle: string): InterviewQuestion[] {
  return [
    {
      id: "q1",
      prompt: `Why are you interested in the ${jobTitle} role at our company?`,
      seconds: 90,
      approved: true,
    },
    {
      id: "q2",
      prompt: "Describe a challenging project you owned end-to-end. What was the outcome?",
      seconds: 120,
      approved: true,
    },
    {
      id: "q3",
      prompt: "How do you prioritize work when multiple stakeholders need you at once?",
      seconds: 90,
      approved: true,
    },
    {
      id: "q4",
      prompt: "Tell us about a time you disagreed with a teammate. How did you resolve it?",
      seconds: 90,
      approved: true,
    },
    {
      id: "q5",
      prompt: "What would you focus on in your first 30 days if you joined this team?",
      seconds: 90,
      approved: false,
    },
  ]
}

/** @deprecated Prefer `@/lib/hiring-ai` — kept for seed helpers. */
export { generateAiQuestions, simulateAiScreen, simulateAiInterview } from "@/lib/hiring-ai"

export function createHiringConfig(title: string, slug?: string): JobHiringConfig {
  const safe =
    slug ||
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) ||
    `job-${Date.now()}`
  return {
    applyForm: {
      slug: safe,
      expiresAt: addDays(todayIso(), 14),
      welcomeMessage: `Apply for ${title}. Share your background and we will review applications after the form closes.`,
      published: true,
    },
    captureDelaySeconds: 5,
    interviewLinkHours: 48,
    questions: defaultQuestions(title),
    passScore: 70,
  }
}

/** Fill missing ATS fields from API/seed payloads that omit applyForm. */
export function normalizeHiringConfig(
  title: string,
  hiring: Partial<JobHiringConfig> | Record<string, unknown> | null | undefined,
  slugHint?: string
): JobHiringConfig {
  const defaults = createHiringConfig(title, slugHint)
  if (!hiring || typeof hiring !== "object") return defaults

  const raw = hiring as Partial<JobHiringConfig> & { applyForm?: Partial<ApplyFormConfig> }
  const applyForm = raw.applyForm

  return {
    applyForm: {
      slug:
        (typeof applyForm?.slug === "string" && applyForm.slug.trim()) || defaults.applyForm.slug,
      expiresAt:
        (typeof applyForm?.expiresAt === "string" && applyForm.expiresAt) ||
        defaults.applyForm.expiresAt,
      welcomeMessage:
        (typeof applyForm?.welcomeMessage === "string" && applyForm.welcomeMessage) ||
        defaults.applyForm.welcomeMessage,
      published:
        typeof applyForm?.published === "boolean"
          ? applyForm.published
          : defaults.applyForm.published,
    },
    captureDelaySeconds:
      typeof raw.captureDelaySeconds === "number"
        ? raw.captureDelaySeconds
        : defaults.captureDelaySeconds,
    interviewLinkHours:
      typeof raw.interviewLinkHours === "number"
        ? raw.interviewLinkHours
        : defaults.interviewLinkHours,
    questions: Array.isArray(raw.questions) && raw.questions.length
      ? raw.questions
      : defaults.questions,
    passScore: typeof raw.passScore === "number" ? raw.passScore : defaults.passScore,
  }
}

