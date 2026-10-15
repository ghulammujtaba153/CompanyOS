/**
 * Hiring GenAI layer.
 * Uses a local structured generator by default (no API key).
 * Set NEXT_PUBLIC_HIRING_AI_PROVIDER=openai and NEXT_PUBLIC_OPENAI_API_KEY
 * later to swap in a real LLM without changing ATS UI.
 */

import {
  type AiInterviewResult,
  type AiScreenResult,
  type ApplicationAnswer,
  type InterviewAnswer,
  type InterviewQuestion,
} from "@/lib/hiring-pipeline"

export type HiringAiProvider = "local" | "openai"

export function hiringAiProvider(): HiringAiProvider {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_HIRING_AI_PROVIDER === "openai") {
    return "openai"
  }
  return "local"
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

/** Generate interview questions grounded in title + description. */
export function generateAiQuestions(jobTitle: string, description?: string): InterviewQuestion[] {
  const desc = (description ?? "").toLowerCase()
  const focus: string[] = []
  if (desc.includes("api") || desc.includes("backend") || jobTitle.toLowerCase().includes("backend")) {
    focus.push("API design and reliability")
  }
  if (desc.includes("design") || jobTitle.toLowerCase().includes("design")) {
    focus.push("product craft and systems thinking")
  }
  if (desc.includes("sales") || jobTitle.toLowerCase().includes("account")) {
    focus.push("discovery and deal ownership")
  }
  if (!focus.length) focus.push("ownership and collaboration")

  const prompts = [
    {
      prompt: `Walk through a recent project relevant to ${jobTitle}. What was your role, the hardest trade-off, and the outcome?`,
      seconds: 120,
    },
    {
      prompt: `For ${jobTitle}, how would you approach ${focus[0]} under imperfect requirements?`,
      seconds: 90,
    },
    {
      prompt: `Describe a time you disagreed with a stakeholder. How did you resolve it while keeping delivery on track?`,
      seconds: 90,
    },
    {
      prompt: description
        ? `This role emphasizes: “${description.slice(0, 120)}${description.length > 120 ? "…" : ""}”. What experience maps most directly?`
        : `What would your first 30 days look like in the ${jobTitle} role?`,
      seconds: 100,
    },
    {
      prompt: `What would you want to measure to know you’re succeeding as a ${jobTitle} after 90 days?`,
      seconds: 75,
    },
  ]

  return prompts.map((item) => ({
    id: uid("q"),
    prompt: item.prompt,
    seconds: item.seconds,
    approved: false,
  }))
}

export function runAiScreen(input: {
  name: string
  jobTitle?: string
  answers: ApplicationAnswer[]
  resumeNote: string
}): AiScreenResult {
  const text = `${input.resumeNote} ${input.answers.map((a) => a.answer).join(" ")}`.toLowerCase()
  const job = (input.jobTitle ?? "").toLowerCase()
  let score = 52
  const strengths: string[] = []
  const risks: string[] = []

  const signals: [RegExp, number, string][] = [
    [/react|typescript|node|go|postgres|kubernetes/, 10, "Strong technical stack signal"],
    [/lead|led|owned|shipped|launched/, 10, "Ownership language"],
    [/design|figma|ux|prototype/, 8, "Design craft signal"],
    [/pipeline|quota|enterprise|crm/, 8, "Go-to-market experience"],
    [/metric|kpi|impact|reduced|increased/, 8, "Outcome-oriented answers"],
  ]
  for (const [re, pts, label] of signals) {
    if (re.test(text)) {
      score += pts
      strengths.push(label)
    }
  }
  if (text.length > 320) {
    score += 6
    strengths.push("Detailed written application")
  } else {
    risks.push("Short written responses — probe depth live")
  }
  if (/junior|intern/.test(text) && /senior|staff|lead/.test(job)) {
    score -= 8
    risks.push("Leveling risk vs senior bar")
  }
  if (!strengths.length) strengths.push("Completed structured application")
  if (!risks.length) risks.push("Validate depth in interview")

  score = Math.max(38, Math.min(97, score + (input.name.length % 5)))
  const summary =
    score >= 72
      ? `GenAI screen for ${input.name}: strong fit signals for ${input.jobTitle ?? "the role"}. Recommend shortlist and AI interview.`
      : `GenAI screen for ${input.name}: mixed fit. Proceed only if hiring bar allows coaching / mid-level growth.`

  return {
    score,
    summary,
    strengths: strengths.slice(0, 4),
    risks: risks.slice(0, 3),
    decidedAt: new Date().toISOString(),
  }
}

export function runAiInterview(input: {
  answers: InterviewAnswer[]
  passScore: number
  jobTitle?: string
}): Omit<AiInterviewResult, "selfieDataUrl" | "completedAt"> {
  const avgLen =
    input.answers.reduce((sum, item) => sum + item.answer.trim().length, 0) /
    Math.max(1, input.answers.length)
  let score = 48 + Math.min(38, Math.round(avgLen / 7))
  const joined = input.answers.map((a) => a.answer.toLowerCase()).join(" ")
  if (/metric|impact|customer|latency|revenue|retention/.test(joined)) score += 8
  if (/we |team |collaborat/.test(joined)) score += 4
  if (avgLen < 40) score -= 12
  score = Math.max(36, Math.min(98, score))
  const pass = score >= input.passScore
  return {
    score,
    pass,
    summary: pass
      ? `Timed interview passed for ${input.jobTitle ?? "role"}: clear structure, ownership, and concrete examples under time pressure.`
      : `Timed interview below pass score (${input.passScore}): answers were thin or incomplete. Prefer not advancing without a human screen.`,
    answers: input.answers,
  }
}

/** Back-compat aliases used by older call sites. */
export const simulateAiScreen = (input: {
  name: string
  answers: ApplicationAnswer[]
  resumeNote: string
}) => runAiScreen(input)

export const simulateAiInterview = (input: {
  answers: InterviewAnswer[]
  passScore: number
}) => runAiInterview(input)
