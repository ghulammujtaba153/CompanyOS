import { generateAiQuestions, runAiInterview, runAiScreen } from "@/lib/hiring-ai"
import {
  createHiringConfig,
  type AiScreenResult,
  type ApplicationAnswer,
  type InterviewCapture,
  type InterviewQuestion,
} from "@/lib/hiring-pipeline"
import {
  findCandidateByInterviewToken,
  findJobBySlug,
  getHiringState,
  setHiringCandidates,
  setHiringJobs,
} from "@/lib/hiring-store"
import { addDays, todayIso, type Candidate, type Job } from "@/lib/people-ops"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Result =
  | { ok: true; message?: string; id?: string; token?: string; pass?: boolean }
  | { ok: false; message: string }

function appendNote(existing: string, next: string) {
  return [existing.trim(), next.trim()].filter(Boolean).join("\n")
}

/** Human-readable rejection reason written into candidate notes. */
function aiScreenFailureNote(aiScreen: AiScreenResult, passScore: number) {
  const parts = [
    `AI screening failed: scored ${aiScreen.score}/100 (need ≥${passScore}).`,
    aiScreen.summary,
  ]
  if (aiScreen.risks.length) {
    parts.push(`Why it failed: ${aiScreen.risks.join("; ")}.`)
  }
  if (aiScreen.strengths.length) {
    parts.push(`Noted strengths: ${aiScreen.strengths.join("; ")}.`)
  }
  return parts.join(" ")
}

export function saveHiringJob(input: Omit<Job, "id" | "createdAt"> & { id?: string }): Result {
  const title = input.title.trim()
  if (!title) return { ok: false, message: "Job title is required." }
  if (input.openings < 1) return { ok: false, message: "At least one opening is required." }

  const { jobs, candidates } = getHiringState()
  const hired = (jobId: string) =>
    candidates.filter((candidate) => candidate.jobId === jobId && candidate.stage === "Hired").length

  if (input.id) {
    if (input.openings < hired(input.id)) {
      return { ok: false, message: "Openings can't be lower than people already hired." }
    }
    setHiringJobs((current) =>
      current.map((job) =>
        job.id === input.id
          ? {
              ...job,
              ...input,
              title,
              hiring: {
                ...input.hiring,
                applyForm: {
                  ...input.hiring.applyForm,
                  slug: input.hiring.applyForm.slug.trim() || job.hiring.applyForm.slug,
                },
              },
            }
          : job
      )
    )
  } else {
    const hiring = input.hiring ?? createHiringConfig(title)
    const slugBase = hiring.applyForm.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    let slug = slugBase
    let n = 2
    while (jobs.some((job) => job.hiring.applyForm.slug === slug)) {
      slug = `${slugBase}-${n++}`
    }
    const id = `job-${Date.now()}`
    setHiringJobs((current) => [
      {
        ...input,
        id,
        title,
        createdAt: todayIso(),
        hiring: {
          ...hiring,
          applyForm: { ...hiring.applyForm, slug, published: hiring.applyForm.published ?? true },
        },
      },
      ...current,
    ])
    return { ok: true, id }
  }
  return { ok: true, id: input.id }
}

export function updateJobHiring(jobId: string, hiring: Job["hiring"]): Result {
  const job = getHiringState().jobs.find((item) => item.id === jobId)
  if (!job) return { ok: false, message: "Job not found." }
  setHiringJobs((current) => current.map((item) => (item.id === jobId ? { ...item, hiring } : item)))
  return { ok: true }
}

export function approveInterviewQuestions(jobId: string, questionIds?: string[]): Result {
  const job = getHiringState().jobs.find((item) => item.id === jobId)
  if (!job) return { ok: false, message: "Job not found." }
  const questions = job.hiring.questions.map((question) =>
    !questionIds || questionIds.includes(question.id) ? { ...question, approved: true } : question
  )
  return updateJobHiring(jobId, { ...job.hiring, questions })
}

export function setInterviewQuestions(jobId: string, questions: InterviewQuestion[]): Result {
  const job = getHiringState().jobs.find((item) => item.id === jobId)
  if (!job) return { ok: false, message: "Job not found." }
  if (questions.length !== 5) return { ok: false, message: "Exactly 5 interview questions are required." }
  return updateJobHiring(jobId, { ...job.hiring, questions })
}

export function generateAiInterviewQuestions(jobId: string): Result & { questions?: InterviewQuestion[] } {
  const job = getHiringState().jobs.find((item) => item.id === jobId)
  if (!job) return { ok: false, message: "Job not found." }
  const questions = generateAiQuestions(job.title, job.description)
  const result = updateJobHiring(jobId, { ...job.hiring, questions })
  if (!result.ok) return result
  return {
    ok: true,
    questions,
    message: "AI drafted 5 interview questions. Review and approve before sending links.",
  }
}

export function submitApplication(input: {
  slug: string
  name: string
  email: string
  phone: string
  resumeNote: string
  resumeFile?: Candidate["resumeFile"]
  answers: ApplicationAnswer[]
}): Result {
  const job = findJobBySlug(input.slug)
  if (!job || job.status === "Closed") return { ok: false, message: "This role is no longer accepting applications." }
  if (!job.hiring.applyForm.published) return { ok: false, message: "This apply form is not published yet." }
  if (job.hiring.applyForm.expiresAt < todayIso()) {
    return { ok: false, message: "The application form has expired." }
  }
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name) return { ok: false, message: "Name is required." }
  if (!EMAIL.test(email)) return { ok: false, message: "Enter a valid email." }
  if (!input.resumeFile) return { ok: false, message: "Attach your CV / resume to continue." }
  const { candidates } = getHiringState()
  if (candidates.some((item) => item.jobId === job.id && item.email === email)) {
    return { ok: false, message: "You already applied to this role with that email." }
  }
  const id = `cand-${Date.now()}`
  const next: Candidate = {
    id,
    jobId: job.id,
    name,
    email,
    phone: input.phone.trim(),
    resumeNote: input.resumeNote.trim(),
    resumeFile: input.resumeFile,
    applicationAnswers: input.answers,
    source: "Apply form",
    stage: "Applied",
    rating: 0,
    notes: "",
    appliedAt: todayIso(),
  }
  setHiringCandidates((current) => [...current, next])
  return { ok: true, id, message: "Application submitted. We will review after the form closes." }
}

export function runAiScreeningForJob(jobId: string): Result {
  const job = getHiringState().jobs.find((item) => item.id === jobId)
  if (!job) return { ok: false, message: "Job not found." }
  if (job.hiring.applyForm.expiresAt >= todayIso() && job.status === "Open") {
    return {
      ok: false,
      message: `Form is still open until ${job.hiring.applyForm.expiresAt}. Close or wait for expiry before AI screening.`,
    }
  }
  const pending = getHiringState().candidates.filter(
    (candidate) => candidate.jobId === jobId && candidate.stage === "Applied"
  )
  if (!pending.length) return { ok: false, message: "No Applied candidates waiting for AI screening." }

  const passScore = job.hiring.passScore
  let shortlisted = 0
  let rejected = 0
  setHiringCandidates((current) =>
    current.map((candidate) => {
      if (candidate.jobId !== jobId || candidate.stage !== "Applied") return candidate
      const aiScreen = runAiScreen({
        name: candidate.name,
        jobTitle: job.title,
        answers: candidate.applicationAnswers,
        resumeNote: candidate.resumeNote,
      })
      const pass = aiScreen.score >= passScore
      if (pass) shortlisted++
      else rejected++
      return {
        ...candidate,
        aiScreen,
        stage: pass ? "Shortlisted" : "Rejected",
        notes: pass
          ? candidate.notes
          : appendNote(candidate.notes, aiScreenFailureNote(aiScreen, passScore)),
      }
    })
  )
  return {
    ok: true,
    message: `AI screened ${pending.length}: ${shortlisted} shortlisted, ${rejected} rejected.`,
  }
}

/** Manual move into AI Screening review pool before batch decide (optional step). */
export function moveToAiScreening(jobId: string): Result {
  const pending = getHiringState().candidates.filter(
    (candidate) => candidate.jobId === jobId && candidate.stage === "Applied"
  )
  if (!pending.length) return { ok: false, message: "No Applied candidates to queue." }
  setHiringCandidates((current) =>
    current.map((candidate) =>
      candidate.jobId === jobId && candidate.stage === "Applied"
        ? { ...candidate, stage: "AI Screening" }
        : candidate
    )
  )
  return { ok: true, message: `${pending.length} candidate(s) queued for AI screening.` }
}

export function decideAiScreening(jobId: string): Result {
  const job = getHiringState().jobs.find((item) => item.id === jobId)
  if (!job) return { ok: false, message: "Job not found." }
  const pool = getHiringState().candidates.filter(
    (candidate) =>
      candidate.jobId === jobId && (candidate.stage === "Applied" || candidate.stage === "AI Screening")
  )
  if (!pool.length) return { ok: false, message: "No candidates in Applied / AI Screening." }

  const passScore = job.hiring.passScore
  let shortlisted = 0
  let rejected = 0
  setHiringCandidates((current) =>
    current.map((candidate) => {
      if (candidate.jobId !== jobId) return candidate
      if (candidate.stage !== "Applied" && candidate.stage !== "AI Screening") return candidate
      const aiScreen =
        candidate.aiScreen ??
        runAiScreen({
          name: candidate.name,
          jobTitle: job.title,
          answers: candidate.applicationAnswers,
          resumeNote: candidate.resumeNote,
        })
      const pass = aiScreen.score >= passScore
      if (pass) shortlisted++
      else rejected++
      return {
        ...candidate,
        aiScreen,
        stage: pass ? "Shortlisted" : "Rejected",
        notes: pass
          ? candidate.notes
          : appendNote(candidate.notes, aiScreenFailureNote(aiScreen, passScore)),
      }
    })
  )
  return {
    ok: true,
    message: `Shortlist ready: ${shortlisted} advanced, ${rejected} rejected.`,
  }
}

export function sendInterviewInvites(jobId: string, candidateIds?: string[]): Result {
  const job = getHiringState().jobs.find((item) => item.id === jobId)
  if (!job) return { ok: false, message: "Job not found." }
  const unapproved = job.hiring.questions.filter((question) => !question.approved)
  if (unapproved.length) {
    return { ok: false, message: `Approve all 5 AI interview questions first (${unapproved.length} pending).` }
  }
  const targets = getHiringState().candidates.filter((candidate) => {
    if (candidate.jobId !== jobId || candidate.aiInterview) return false
    if (candidateIds?.length) return candidateIds.includes(candidate.id)
    return (
      candidate.stage === "Shortlisted" ||
      candidate.stage === "AI Interview" ||
      Boolean(candidate.interviewToken)
    )
  })
  if (!targets.length) {
    return {
      ok: false,
      message: "No candidates ready for an interview link. Shortlist someone first, or open a candidate already in AI Interview.",
    }
  }

  const hours = job.hiring.interviewLinkHours
  const expires = new Date(Date.now() + hours * 3600_000).toISOString()
  const issued: { name: string; url: string }[] = []
  setHiringCandidates((current) =>
    current.map((candidate) => {
      if (!targets.some((item) => item.id === candidate.id)) return candidate
      const token =
        candidate.interviewToken ||
        `iv-${candidate.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}-${Date.now().toString(36)}`
      issued.push({ name: candidate.name, url: interviewUrl(token) })
      return {
        ...candidate,
        stage: "AI Interview",
        interviewToken: token,
        interviewExpiresAt: expires,
        interviewInviteSentAt: new Date().toISOString(),
      }
    })
  )
  const first = issued[0]
  return {
    ok: true,
    message: first
      ? `Interview link ready for ${first.name} (valid ${hours}h). Copy it from “Interview links” below or the candidate card.`
      : `Sent ${hours}h AI interview links to ${targets.length} candidate(s).`,
  }
}

/** Create or refresh a single candidate’s shareable interview link. */
export function ensureInterviewLink(candidateId: string): Result & { url?: string } {
  const candidate = getHiringState().candidates.find((item) => item.id === candidateId)
  if (!candidate) return { ok: false, message: "Candidate not found." }
  const job = getHiringState().jobs.find((item) => item.id === candidate.jobId)
  if (!job) return { ok: false, message: "Job not found." }
  if (candidate.aiInterview) return { ok: false, message: "This candidate already completed the AI interview." }
  const unapproved = job.hiring.questions.filter((question) => !question.approved)
  if (unapproved.length) {
    return { ok: false, message: `Approve all interview questions first (${unapproved.length} pending).` }
  }
  const hours = job.hiring.interviewLinkHours
  const expires = new Date(Date.now() + hours * 3600_000).toISOString()
  const token =
    candidate.interviewToken ||
    `iv-${candidate.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}-${Date.now().toString(36)}`
  setHiringCandidates((current) =>
    current.map((item) =>
      item.id === candidateId
        ? {
            ...item,
            stage: "AI Interview",
            interviewToken: token,
            interviewExpiresAt: expires,
            interviewInviteSentAt: new Date().toISOString(),
          }
        : item
    )
  )
  const url = interviewUrl(token)
  return {
    ok: true,
    url,
    message: `Interview link ready (valid ${hours}h). Share: ${url}`,
  }
}

export function completeAiInterview(input: {
  token: string
  name: string
  jobTitleConfirm: string
  selfieDataUrl?: string
  captures?: InterviewCapture[]
  answers: { questionId: string; answer: string }[]
}): Result {
  const candidate = findCandidateByInterviewToken(input.token)
  if (!candidate) return { ok: false, message: "Interview link is invalid." }
  if (candidate.aiInterview) return { ok: false, message: "This interview was already completed." }
  if (candidate.interviewExpiresAt && Date.parse(candidate.interviewExpiresAt) < Date.now()) {
    return { ok: false, message: "This interview link has expired." }
  }
  const job = getHiringState().jobs.find((item) => item.id === candidate.jobId)
  if (!job) return { ok: false, message: "Role not found." }
  if (input.name.trim().toLowerCase() !== candidate.name.trim().toLowerCase()) {
    return { ok: false, message: "Name does not match the invitation. Use the name from your application." }
  }
  if (!input.jobTitleConfirm.trim()) return { ok: false, message: "Confirm the role you applied for." }

  const stamped = input.answers.map((answer) => ({
    questionId: answer.questionId,
    answer: answer.answer.trim(),
    capturedAt: new Date().toISOString(),
  }))
  const scored = runAiInterview({
    answers: stamped,
    passScore: job.hiring.passScore,
    jobTitle: job.title,
  })
  const captures = input.captures?.length
    ? input.captures
    : input.selfieDataUrl
      ? [
          {
            id: `cap-identity-${Date.now()}`,
            dataUrl: input.selfieDataUrl,
            capturedAt: new Date().toISOString(),
            kind: "identity" as const,
          },
        ]
      : []
  const result = {
    ...scored,
    selfieDataUrl: input.selfieDataUrl ?? captures.find((c) => c.kind === "identity")?.dataUrl,
    captures,
    completedAt: new Date().toISOString(),
  }
  setHiringCandidates((current) =>
    current.map((item) =>
      item.id === candidate.id
        ? {
            ...item,
            aiInterview: result,
            stage: result.pass ? "Technical Interview" : "Rejected",
            rating: Math.max(item.rating, Math.round(result.score / 20)),
            notes: result.pass
              ? item.notes
              : appendNote(
                  item.notes,
                  `AI interview failed: scored ${result.score}/100 (need ≥${job.hiring.passScore}). ${result.summary}`
                ),
          }
        : item
    )
  )
  return {
    ok: true,
    pass: result.pass,
    message: result.pass
      ? `Passed AI interview (${result.score}/100). HR will contact you about the technical interview.`
      : `AI interview scored ${result.score}/100 — below the pass bar.`,
  }
}

export function sendTechnicalInvite(
  candidateId: string,
  mode: "On-site" | "Online",
  scheduledNote: string
): Result {
  const candidate = getHiringState().candidates.find((item) => item.id === candidateId)
  if (!candidate) return { ok: false, message: "Candidate not found." }
  if (candidate.stage !== "Technical Interview") {
    return { ok: false, message: "Candidate must be in Technical Interview stage." }
  }
  if (!scheduledNote.trim()) return { ok: false, message: "Add schedule details for the invite." }
  setHiringCandidates((current) =>
    current.map((item) =>
      item.id === candidateId
        ? {
            ...item,
            technicalInvite: {
              mode,
              scheduledNote: scheduledNote.trim(),
              sentAt: new Date().toISOString(),
            },
            notes: [item.notes, `Technical invite (${mode}): ${scheduledNote.trim()}`].filter(Boolean).join("\n"),
          }
        : item
    )
  )
  return { ok: true, message: `Technical interview invite drafted for ${candidate.name} (${mode}).` }
}

export function selectAfterTechnical(candidateId: string, decision: "Offer" | "Rejected"): Result {
  const candidate = getHiringState().candidates.find((item) => item.id === candidateId)
  if (!candidate) return { ok: false, message: "Candidate not found." }
  if (candidate.stage !== "Technical Interview") {
    return { ok: false, message: "Only Technical Interview candidates can be selected here." }
  }
  setHiringCandidates((current) =>
    current.map((item) => (item.id === candidateId ? { ...item, stage: decision } : item))
  )
  return {
    ok: true,
    message:
      decision === "Offer"
        ? `${candidate.name} moved to Offer.`
        : `${candidate.name} rejected after technical interview.`,
  }
}

export function addManualCandidate(input: {
  jobId: string
  name: string
  email: string
  source: Candidate["source"]
  notes: string
}): Result {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name) return { ok: false, message: "Name is required." }
  if (!EMAIL.test(email)) return { ok: false, message: "Enter a valid email." }
  const { candidates } = getHiringState()
  if (candidates.some((item) => item.jobId === input.jobId && item.email === email)) {
    return { ok: false, message: `${email} already applied to this job.` }
  }
  setHiringCandidates((current) => [
    ...current,
    {
      id: `cand-${Date.now()}`,
      jobId: input.jobId,
      name,
      email,
      source: input.source,
      notes: input.notes,
      stage: "Applied",
      rating: 0,
      appliedAt: todayIso(),
      phone: "",
      resumeNote: "",
      applicationAnswers: [],
    },
  ])
  return { ok: true }
}

export function moveHiringCandidate(id: string, stage: Candidate["stage"]): Result {
  const { candidates, jobs } = getHiringState()
  const candidate = candidates.find((item) => item.id === id)
  const job = jobs.find((item) => item.id === candidate?.jobId)
  if (!candidate || !job) return { ok: false, message: "Candidate not found." }
  if (candidate.stage === "Hired") return { ok: false, message: `${candidate.name} is already hired.` }
  if (stage === "Hired") {
    return { ok: false, message: "Use the hire action from People Ops to create the employee record." }
  }
  setHiringCandidates((current) => current.map((item) => (item.id === id ? { ...item, stage } : item)))
  return { ok: true }
}

export function updateHiringCandidate(
  id: string,
  input: Partial<Pick<Candidate, "rating" | "notes">>
) {
  setHiringCandidates((current) => current.map((item) => (item.id === id ? { ...item, ...input } : item)))
}

export function deleteHiringCandidate(id: string) {
  setHiringCandidates((current) => current.filter((item) => item.id !== id || item.stage === "Hired"))
}

export function forceExpireApplyForm(jobId: string): Result {
  const job = getHiringState().jobs.find((item) => item.id === jobId)
  if (!job) return { ok: false, message: "Job not found." }
  return updateJobHiring(jobId, {
    ...job.hiring,
    applyForm: { ...job.hiring.applyForm, expiresAt: addDays(todayIso(), -1) },
  })
}

export function applyFormUrl(job: Job) {
  const path = `/apply/${job.hiring.applyForm.slug}`
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`
  }
  return path
}

export function interviewUrl(token: string) {
  const path = `/interview/${token}`
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`
  }
  return path
}
