"use client"

import { useSyncExternalStore } from "react"

import { peopleOpsApi, type ApiHiringCandidate, type ApiHiringJob } from "@/lib/auth-api"
import { normalizeHiringConfig } from "@/lib/hiring-pipeline"
import { seedCandidates, seedJobs, type Candidate, type Job } from "@/lib/people-ops"

const STORAGE_KEY = "companyos-hiring-v1"

type HiringState = {
  jobs: Job[]
  candidates: Candidate[]
}

const serverSnapshot: HiringState = { jobs: seedJobs, candidates: seedCandidates }

function loadState(): HiringState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { jobs: seedJobs, candidates: seedCandidates }
    const parsed = JSON.parse(raw) as HiringState
    if (!Array.isArray(parsed.jobs) || !Array.isArray(parsed.candidates)) {
      return { jobs: seedJobs, candidates: seedCandidates }
    }
    if (!parsed.jobs[0]?.hiring?.applyForm) {
      return { jobs: seedJobs, candidates: seedCandidates }
    }
    return parsed
  } catch {
    return { jobs: seedJobs, candidates: seedCandidates }
  }
}

let state: HiringState = serverSnapshot
let hydrated = false
let apiOrgId: string | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function emit() {
  if (typeof window !== "undefined" && !apiOrgId) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* quota */
    }
  }
  listeners.forEach((listener) => listener())
  scheduleApiSync()
}

function hydrateFromStorage() {
  if (hydrated || typeof window === "undefined") return
  hydrated = true
  if (!apiOrgId) {
    state = loadState()
    listeners.forEach((listener) => listener())
  }
}

export function mapApiJob(row: ApiHiringJob): Job {
  return {
    id: row.id,
    title: row.title,
    departmentId: row.departmentId,
    hiringManagerId: row.hiringManagerId,
    openings: row.openings,
    status: row.status as Job["status"],
    createdAt: row.createdAt,
    description: row.description || "",
    location: row.location || "",
    employmentType: (row.employmentType || "Full-time") as Job["employmentType"],
    hiring: normalizeHiringConfig(row.title, row.hiring),
  }
}

export function mapApiCandidate(row: ApiHiringCandidate): Candidate {
  return {
    id: row.id,
    jobId: row.jobId,
    name: row.name,
    email: row.email,
    source: row.source as Candidate["source"],
    stage: row.stage as Candidate["stage"],
    rating: row.rating || 0,
    notes: row.notes || "",
    appliedAt: row.appliedAt || "",
    employeeId: row.employeeId || undefined,
    phone: row.phone || "",
    resumeNote: row.resumeNote || "",
    resumeFile: row.resumeFile as Candidate["resumeFile"],
    applicationAnswers: (row.applicationAnswers || []) as Candidate["applicationAnswers"],
    aiScreen: row.aiScreen as Candidate["aiScreen"],
    interviewToken: row.interviewToken || undefined,
    interviewExpiresAt: row.interviewExpiresAt || undefined,
    interviewInviteSentAt: row.interviewInviteSentAt || undefined,
    aiInterview: row.aiInterview as Candidate["aiInterview"],
    technicalInvite: row.technicalInvite as Candidate["technicalInvite"],
  }
}

function jobPayload(job: Job) {
  return {
    id: job.id,
    title: job.title,
    departmentId: job.departmentId,
    hiringManagerId: job.hiringManagerId,
    openings: job.openings,
    status: job.status,
    description: job.description,
    location: job.location,
    employmentType: job.employmentType,
    hiring: job.hiring,
  }
}

function candidatePayload(candidate: Candidate) {
  return {
    id: candidate.id,
    jobId: candidate.jobId,
    name: candidate.name,
    email: candidate.email,
    source: candidate.source,
    stage: candidate.stage,
    rating: candidate.rating,
    notes: candidate.notes,
    appliedAt: candidate.appliedAt,
    employeeId: candidate.employeeId || "",
    phone: candidate.phone,
    resumeNote: candidate.resumeNote,
    resumeFile: candidate.resumeFile || null,
    applicationAnswers: candidate.applicationAnswers || [],
    aiScreen: candidate.aiScreen || null,
    interviewToken: candidate.interviewToken || "",
    interviewExpiresAt: candidate.interviewExpiresAt || "",
    interviewInviteSentAt: candidate.interviewInviteSentAt || "",
    aiInterview: candidate.aiInterview || null,
    technicalInvite: candidate.technicalInvite || null,
  }
}

async function syncToApi() {
  if (!apiOrgId) return
  const orgId = apiOrgId
  const snapshot = state
  try {
    await Promise.all([
      ...snapshot.jobs.map((job) => peopleOpsApi.saveJob(orgId, jobPayload(job))),
      ...snapshot.candidates.map((candidate) =>
        peopleOpsApi.saveCandidate(orgId, candidatePayload(candidate))
      ),
    ])
  } catch {
    /* keep local mirror */
  }
}

function scheduleApiSync() {
  if (!apiOrgId) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    void syncToApi()
  }, 600)
}

/** Flush pending hiring writes immediately (for button loaders). */
export async function flushHiringApiSync() {
  if (!apiOrgId) return
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
  await syncToApi()
}

/** Enable Neon sync for hiring when authenticated; pass null to fall back to localStorage. */
export async function enableHiringApi(organizationId: string | null) {
  apiOrgId = organizationId
  if (!organizationId) {
    if (typeof window !== "undefined") {
      hydrated = true
      state = loadState()
      listeners.forEach((listener) => listener())
    }
    return
  }
  await refreshHiringFromApi()
}

/** Re-fetch jobs/candidates from the API (e.g. after public applications). */
export async function refreshHiringFromApi() {
  if (!apiOrgId) return
  const organizationId = apiOrgId
  try {
    const [jobs, candidates] = await Promise.all([
      peopleOpsApi.listJobs(organizationId),
      peopleOpsApi.listCandidates(organizationId),
    ])
    state = {
      jobs: jobs.map(mapApiJob),
      candidates: candidates.map(mapApiCandidate),
    }
    hydrated = true
    listeners.forEach((listener) => listener())
  } catch {
    // Keep prior data on refresh failure so detail pages don’t flash “not found”.
    hydrated = true
    listeners.forEach((listener) => listener())
  }
}

export function getHiringState(): HiringState {
  return state
}

export function subscribeHiring(listener: () => void) {
  listeners.add(listener)
  if (typeof window !== "undefined" && !hydrated) {
    queueMicrotask(hydrateFromStorage)
  }
  return () => listeners.delete(listener)
}

export function setHiringJobs(updater: (jobs: Job[]) => Job[]) {
  if (typeof window !== "undefined" && !hydrated && !apiOrgId) hydrateFromStorage()
  state = { ...state, jobs: updater(state.jobs) }
  emit()
}

export function setHiringCandidates(updater: (candidates: Candidate[]) => Candidate[]) {
  if (typeof window !== "undefined" && !hydrated && !apiOrgId) hydrateFromStorage()
  state = { ...state, candidates: updater(state.candidates) }
  emit()
}

export function patchHiringState(partial: Partial<HiringState>) {
  if (typeof window !== "undefined" && !hydrated && !apiOrgId) hydrateFromStorage()
  state = { ...state, ...partial }
  emit()
}

export function useHiringState() {
  return useSyncExternalStore(subscribeHiring, getHiringState, () => serverSnapshot)
}

export function findJobBySlug(slug: string) {
  if (typeof window !== "undefined" && !hydrated && !apiOrgId) hydrateFromStorage()
  return getHiringState().jobs.find((job) => job.hiring.applyForm.slug === slug)
}

export function findCandidateByInterviewToken(token: string) {
  if (typeof window !== "undefined" && !hydrated && !apiOrgId) hydrateFromStorage()
  return getHiringState().candidates.find((candidate) => candidate.interviewToken === token)
}
