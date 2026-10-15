"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  ArrowRight,
  Camera,
  Check,
  ClipboardCopy,
  ExternalLink,
  FileText,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  UserX,
  X,
} from "lucide-react"

import { Field, KeyedSelect, OptionSelect } from "@/components/dashboard/form-controls"
import { useOrganization } from "@/components/dashboard/organization-store"
import { usePeopleOps } from "@/components/dashboard/people-ops-store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { applyFormUrl, ensureInterviewLink, interviewUrl } from "@/lib/hiring-actions"
import {
  createHiringConfig,
  hiringStages,
  type AiInterviewResult,
  type InterviewQuestion,
} from "@/lib/hiring-pipeline"
import { flushHiringApiSync } from "@/lib/hiring-store"
import { cn } from "@/lib/utils"
import {
  candidateSources,
  todayIso,
  type Candidate,
  type CandidateStage,
  type Job,
} from "@/lib/people-ops"
import { formatDate } from "@/lib/work-utils"

type Notice = { ok: boolean; message: string } | null

const FLOW = [
  { label: "Create job", hint: "Publish form" },
  { label: "Collect", hint: "Applications" },
  { label: "AI screen", hint: "Shortlist" },
  { label: "AI interview", hint: "Timed link" },
  { label: "Technical", hint: "Live / on-site" },
  { label: "Hire", hint: "Offer & onboard" },
] as const

const STAGE_ACCENT: Record<(typeof hiringStages)[number], string> = {
  Applied: "bg-sky-500",
  "AI Screening": "bg-violet-500",
  Shortlisted: "bg-emerald-500",
  "AI Interview": "bg-amber-500",
  "Technical Interview": "bg-orange-500",
  Offer: "bg-teal-500",
  Hired: "bg-foreground",
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function flowStepForJob(job: Job, forJob: Candidate[]) {
  const formExpired = job.hiring.applyForm.expiresAt < todayIso()
  const pendingScreen = forJob.some((c) => c.stage === "Applied" || c.stage === "AI Screening")
  const shortlisted = forJob.some((c) => c.stage === "Shortlisted")
  const interviewing = forJob.some((c) => c.stage === "AI Interview")
  const technical = forJob.some((c) => c.stage === "Technical Interview")
  const offerOrHired = forJob.some((c) => c.stage === "Offer" || c.stage === "Hired")

  if (offerOrHired && !technical && !interviewing) return 5
  if (technical) return 4
  if (interviewing || shortlisted) return 3
  if (pendingScreen && formExpired) return 2
  if (job.hiring.applyForm.published || pendingScreen) return 1
  return 0
}

export type HiringNotice = Notice

export function HiringFlowStepper({ job, candidates }: { job: Job; candidates: Candidate[] }) {
  const forJob = candidates.filter((c) => c.jobId === job.id)
  const activeStep = flowStepForJob(job, forJob)

  return (
    <nav aria-label="Hiring flow" className="min-w-0 overflow-x-auto rounded-2xl border bg-muted/20 px-3 py-3 sm:px-4">
      <ol className="flex w-max min-w-full items-center gap-0">
        {FLOW.map((step, index) => {
          const done = index < activeStep
          const current = index === activeStep
          return (
            <li key={step.label} className="flex min-w-0 flex-1 items-center">
              <div className="flex w-24 flex-1 flex-col items-center gap-1.5 px-1 text-center sm:w-auto sm:min-w-28">
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    done && "bg-foreground text-background",
                    current && "bg-foreground text-background ring-4 ring-foreground/10",
                    !done && !current && "bg-muted text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <div>
                  <p
                    className={cn(
                      "text-xs font-medium sm:text-sm",
                      current ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="hidden text-[11px] text-muted-foreground sm:block">{step.hint}</p>
                </div>
              </div>
              {index < FLOW.length - 1 ? (
                <div
                  className={cn(
                    "mb-6 h-px w-4 shrink-0 sm:mb-7 sm:w-full sm:max-w-10",
                    index < activeStep ? "bg-foreground/40" : "bg-border"
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function NoticeBar({ notice, onDismiss }: { notice: NonNullable<Notice>; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-xs",
        notice.ok
          ? "border-emerald-500/20 bg-emerald-500/5 text-foreground"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      {notice.message}
      <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
        <X />
      </Button>
    </div>
  )
}

export function JobPipeline({
  job,
  onEdit,
  onNotice,
}: {
  job: Job
  onEdit: () => void
  onNotice: (notice: Notice) => void
}) {
  const {
    candidates,
    moveCandidate,
    isPeopleTeam,
    decideAiScreening,
    moveToAiScreening,
    sendInterviewInvites,
    approveInterviewQuestions,
    forceExpireApplyForm,
  } = usePeopleOps()
  const { me, getEmployee, getDepartment } = useOrganization()
  const canEdit = isPeopleTeam || job.hiringManagerId === me?.id
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showRejected, setShowRejected] = useState(false)
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const forJob = candidates.filter((candidate) => candidate.jobId === job.id)
  const rejected = forJob.filter((candidate) => candidate.stage === "Rejected")
  const open = forJob.find((candidate) => candidate.id === openId)
  const formExpired = job.hiring.applyForm.expiresAt < todayIso()
  const appliedCount = forJob.filter((c) => c.stage === "Applied" || c.stage === "AI Screening").length
  const shortlisted = forJob.filter((c) => c.stage === "Shortlisted").length
  const pendingQuestions = job.hiring.questions.filter((q) => !q.approved).length
  const linkTargets = forJob.filter(
    (c) =>
      !c.aiInterview &&
      (c.stage === "Shortlisted" || c.stage === "AI Interview" || Boolean(c.interviewToken))
  )
  const applyPath = applyFormUrl(job)
  const applyHref = `/apply/${job.hiring.applyForm.slug}`

  async function move(candidate: Candidate, stage: CandidateStage) {
    setBusy(`move:${candidate.id}`)
    try {
      const result = await moveCandidate(candidate.id, stage)
      await flushHiringApiSync()
      onNotice(result.ok ? (result.message ? { ok: true, message: result.message } : null) : result)
    } finally {
      setBusy(null)
    }
  }

  function run(result: { ok: boolean; message?: string }) {
    onNotice(result.ok ? { ok: true, message: result.message ?? "Done." } : { ok: false, message: result.message ?? "Failed." })
  }

  async function runAction(key: string, action: () => { ok: boolean; message?: string }) {
    if (busy) return
    setBusy(key)
    try {
      const result = action()
      if (result.ok) await flushHiringApiSync()
      run(result)
    } finally {
      setBusy(null)
    }
  }

  async function copy(text: string, label: string, key = "copy") {
    if (busy) return
    setBusy(key)
    try {
      await navigator.clipboard.writeText(text.startsWith("http") ? text : `${window.location.origin}${text}`)
      onNotice({ ok: true, message: `${label} copied.` })
    } catch {
      onNotice({ ok: false, message: "Could not copy link." })
    } finally {
      setBusy(null)
    }
  }

  const hm = getEmployee(job.hiringManagerId)?.name ?? "—"
  const primaryAction = !formExpired
    ? { label: "Collecting applications", detail: `Form open until ${formatDate(job.hiring.applyForm.expiresAt)}` }
    : appliedCount
      ? { label: "Ready for AI screening", detail: `${appliedCount} candidate${appliedCount === 1 ? "" : "s"} waiting` }
      : shortlisted
        ? {
            label: pendingQuestions ? "Approve interview questions" : "Send AI interview links",
            detail: `${shortlisted} shortlisted · pass ≥${job.hiring.passScore}`,
          }
        : { label: "Pipeline in progress", detail: `${forJob.filter((c) => c.stage !== "Rejected").length} in flow` }

  return (
    <section className="min-w-0 space-y-5">
      <header className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{job.title}</h2>
              <Badge variant="outline">{job.employmentType}</Badge>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {getDepartment(job.departmentId)?.name}
              <span className="mx-1.5 text-border">·</span>
              {job.location}
              <span className="mx-1.5 text-border">·</span>
              HM {hm}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{job.description}</p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {isPeopleTeam ? (
                <Button size="sm" variant="outline" onClick={onEdit}>
                  <Pencil data-icon="inline-start" />
                  Edit
                </Button>
              ) : null}
              <Button size="sm" onClick={() => setAdding(true)} disabled={job.status === "Closed"}>
                <Plus data-icon="inline-start" />
                Add candidate
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0 rounded-2xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-400">
              <FileText className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">1 · Apply form link</p>
                <Badge variant="outline" className="text-[10px]">
                  {formExpired ? "Closed" : "Live"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Candidate link (not AI). Share this so people can apply with CV.
              </p>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{applyHref}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <a
                  href={applyHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted"
                >
                  <ExternalLink className="size-3" />
                  Open form
                </a>
                <Button
                  size="xs"
                  variant="ghost"
                  loading={busy === "copy-apply"}
                  onClick={() => void copy(applyPath, "Apply link", "copy-apply")}
                >
                  <ClipboardCopy data-icon="inline-start" />
                  Copy link
                </Button>
                {canEdit && !formExpired ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    loading={busy === "close-form"}
                    onClick={() => void runAction("close-form", () => forceExpireApplyForm(job.id))}
                  >
                    Close form
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-400">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">2 · Start AI screening</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No public link — HR starts it here after the form closes. Scores Applied candidates and moves
                them to Shortlisted or Rejected.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {appliedCount ? `${appliedCount} waiting to be scored` : "No applications in queue"}
              </p>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {!formExpired ? (
                    <Button
                      size="xs"
                      variant="outline"
                      loading={busy === "close-form-first"}
                      onClick={() => void runAction("close-form-first", () => forceExpireApplyForm(job.id))}
                    >
                      Close form first
                    </Button>
                  ) : null}
                  <Button
                    size="xs"
                    variant="outline"
                    loading={busy === "queue-ai"}
                    onClick={() => void runAction("queue-ai", () => moveToAiScreening(job.id))}
                  >
                    Queue for AI
                  </Button>
                  <Button
                    size="xs"
                    loading={busy === "ai-shortlist"}
                    disabled={!appliedCount}
                    onClick={() => void runAction("ai-shortlist", () => decideAiScreening(job.id))}
                  >
                    <Sparkles data-icon="inline-start" />
                    Run AI shortlist
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border bg-card p-4 md:col-span-2 xl:col-span-1">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <Camera className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">3 · AI interview</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Generate 5 questions with AI → HR approves → send each shortlisted candidate their own
                `/interview/…` link ({job.hiring.interviewLinkHours}h, {job.hiring.captureDelaySeconds}s selfie).
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {shortlisted} shortlisted · {5 - pendingQuestions}/5 questions approved · pass ≥
                {job.hiring.passScore}
              </p>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => setQuestionsOpen(true)}>
                    <Sparkles data-icon="inline-start" />
                    Create / review questions
                  </Button>
                  {pendingQuestions ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      loading={busy === "approve-questions"}
                      onClick={() => void runAction("approve-questions", () => approveInterviewQuestions(job.id))}
                    >
                      <Check data-icon="inline-start" />
                      Approve all
                    </Button>
                  ) : null}
                  <Button
                    size="xs"
                    loading={busy === "interview-links"}
                    disabled={!!pendingQuestions || !linkTargets.length}
                    onClick={() => void runAction("interview-links", () => sendInterviewInvites(job.id))}
                  >
                    <Link2 data-icon="inline-start" />
                    {linkTargets.some((c) => c.interviewToken)
                      ? "Refresh / show interview links"
                      : "Create interview links"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-2.5">
        <div>
          <p className="text-sm font-medium">{primaryAction.label}</p>
          <p className="text-xs text-muted-foreground">{primaryAction.detail}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Pass score ≥{job.hiring.passScore} · {job.hiring.questions.length} timed questions
        </p>
      </div>

      {(() => {
        const invited = forJob.filter((c) => c.interviewToken && !c.aiInterview)
        const preview = invited[0] ?? null
        return (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Shareable interview links</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Copy a full URL and send it to the candidate (email/Slack). They open it without logging in.
                  Links expire after {job.hiring.interviewLinkHours}h.
                </p>
              </div>
              {preview?.interviewToken ? (
                <a
                  href={interviewUrl(preview.interviewToken)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs font-medium hover:bg-muted"
                >
                  <ExternalLink className="size-3.5" />
                  Preview interview
                </a>
              ) : null}
            </div>
            {invited.length ? (
              <ul className="mt-3 divide-y rounded-xl border bg-card">
                {invited.map((candidate) => {
                  const url = interviewUrl(candidate.interviewToken!)
                  return (
                    <li
                      key={candidate.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{candidate.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{url}</p>
                        {candidate.interviewExpiresAt ? (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Expires {new Date(candidate.interviewExpiresAt).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="xs"
                          loading={busy === `copy-iv-${candidate.id}`}
                          onClick={() =>
                            void copy(url, `${candidate.name} interview link`, `copy-iv-${candidate.id}`)
                          }
                        >
                          <ClipboardCopy data-icon="inline-start" />
                          Copy link
                        </Button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
                        >
                          Open
                        </a>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed bg-background/60 px-3 py-4 text-xs text-muted-foreground">
                No interview links yet. Shortlist a candidate (or move them to AI Interview), approve
                questions, then click <span className="font-medium text-foreground">Create interview links</span>.
              </p>
            )}
          </div>
        )
      })()}

      <div className="w-full min-w-0 max-w-full rounded-2xl border bg-muted/10">
        <div
          className="hiring-board-scroll w-full max-w-full overflow-x-auto overscroll-x-contain"
          role="region"
          aria-label="Candidate pipeline"
        >
          <div className="flex w-max gap-3 p-3 pe-8">
            {hiringStages.map((stage) => {
              const items = forJob.filter((candidate) => candidate.stage === stage)
              return (
                <div
                  key={stage}
                  className="flex w-64 shrink-0 flex-col rounded-2xl border bg-background"
                >
                  <div className="flex items-center gap-2 border-b px-3 py-2.5">
                    <span className={cn("size-1.5 shrink-0 rounded-full", STAGE_ACCENT[stage])} />
                    <h3 className="min-w-0 flex-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {stage}
                    </h3>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  <ul className="flex min-h-36 flex-1 flex-col gap-2 p-2">
                    {items.map((candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        job={job}
                        canEdit={canEdit}
                        onOpen={() => setOpenId(candidate.id)}
                        onMove={(next) => move(candidate, next)}
                        onCopyInterview={() => {
                          void (async () => {
                            if (candidate.interviewToken) {
                              await copy(
                                interviewUrl(candidate.interviewToken),
                                "Interview link",
                                `copy-iv-${candidate.id}`
                              )
                              return
                            }
                            setBusy(`ensure-iv-${candidate.id}`)
                            try {
                              const result = ensureInterviewLink(candidate.id)
                              if (result.ok) await flushHiringApiSync()
                              if (result.ok && result.url) {
                                await navigator.clipboard.writeText(result.url)
                                onNotice({
                                  ok: true,
                                  message: result.message ?? "Interview link copied.",
                                })
                              } else {
                                onNotice({
                                  ok: false,
                                  message: result.message ?? "Could not create interview link.",
                                })
                              }
                            } finally {
                              setBusy(null)
                            }
                          })()
                        }}
                      />
                    ))}
                    {!items.length ? (
                      <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed px-2 py-8 text-center text-[11px] text-muted-foreground/70">
                        Empty
                      </li>
                    ) : null}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span>Scroll sideways to see every stage</span>
          <span className="tabular-nums">{hiringStages.length} columns</span>
        </div>
      </div>

      {rejected.length ? (
        <div className="rounded-xl border px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowRejected((current) => !current)}
          >
            <span>Rejected ({rejected.length})</span>
            <span className="text-xs">{showRejected ? "Hide" : "Show"}</span>
          </button>
          {showRejected ? (
            <ul className="mt-2 divide-y border-t">
              {rejected.map((candidate) => (
                <li key={candidate.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <button type="button" className="flex items-center gap-2 hover:underline" onClick={() => setOpenId(candidate.id)}>
                    <Avatar size="sm">
                      <AvatarFallback>{initials(candidate.name)}</AvatarFallback>
                    </Avatar>
                    {candidate.name}
                  </button>
                  {canEdit ? (
                    <Button size="sm" variant="ghost" onClick={() => move(candidate, "Applied")}>
                      Reopen
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {adding ? <AddCandidateDialog job={job} onClose={() => setAdding(false)} /> : null}
      {open ? (
        <CandidateDialog
          candidate={open}
          job={job}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onMove={(stage) => move(open, stage)}
          onNotice={onNotice}
        />
      ) : null}
      {questionsOpen ? (
        <QuestionsDialog job={job} onClose={() => setQuestionsOpen(false)} onNotice={onNotice} />
      ) : null}
    </section>
  )
}

function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return (
    <span className="inline-flex" aria-label={value ? `${value} of 5` : "Not rated"}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className="disabled:cursor-default"
          aria-label={onChange ? `Rate ${n}` : undefined}
        >
          <Star className={cn("size-3.5", n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
        </button>
      ))}
    </span>
  )
}

function nextStage(stage: CandidateStage) {
  const index = hiringStages.indexOf(stage as (typeof hiringStages)[number])
  return index >= 0 && index < hiringStages.length - 1 ? hiringStages[index + 1] : null
}

function CandidateCard({
  candidate,
  canEdit,
  onOpen,
  onMove,
  onCopyInterview,
}: {
  candidate: Candidate
  job: Job
  canEdit: boolean
  onOpen: () => void
  onMove: (stage: CandidateStage) => void
  onCopyInterview: () => void
}) {
  const next = nextStage(candidate.stage)
  const days = Math.max(0, Math.round((Date.parse(todayIso()) - Date.parse(candidate.appliedAt)) / 86_400_000))

  return (
    <li className="group rounded-xl border bg-card p-2.5 shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <Avatar size="sm" className="mt-0.5">
            <AvatarFallback className="text-[10px]">{initials(candidate.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium leading-snug group-hover:underline">
              {candidate.name}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {candidate.source} · {days}d
            </span>
          </span>
        </button>
        {canEdit && candidate.stage !== "Hired" ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Actions for ${candidate.name}`}
                  className="-mt-0.5 -mr-1 opacity-60 group-hover:opacity-100"
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {next ? (
                <DropdownMenuItem onClick={() => onMove(next)}>
                  <ArrowRight />
                  {next === "Hired" ? "Mark hired" : `Move to ${next}`}
                </DropdownMenuItem>
              ) : null}
              {!candidate.aiInterview &&
              (candidate.stage === "Shortlisted" ||
                candidate.stage === "AI Interview" ||
                candidate.interviewToken) ? (
                <DropdownMenuItem onClick={onCopyInterview}>
                  <Link2 />
                  {candidate.interviewToken ? "Copy interview link" : "Create & copy interview link"}
                </DropdownMenuItem>
              ) : null}
              {candidate.stage !== "Applied" && candidate.stage !== "Rejected" ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Move back</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {hiringStages
                      .slice(0, Math.max(0, hiringStages.indexOf(candidate.stage as (typeof hiringStages)[number])))
                      .map((stage) => (
                        <DropdownMenuItem key={stage} onClick={() => onMove(stage)}>
                          {stage}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onMove("Rejected")}>
                <UserX />
                Reject
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {candidate.aiScreen ? (
          <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
            Screen {candidate.aiScreen.score}
          </span>
        ) : null}
        {candidate.aiInterview ? (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
            <Camera className="size-2.5" />
            {candidate.aiInterview.score}
            {(candidate.aiInterview.captures?.length ||
              (candidate.aiInterview.selfieDataUrl ? 1 : 0)) > 0
              ? ` · ${candidate.aiInterview.captures?.length || 1} imgs`
              : ""}
          </span>
        ) : null}
        {candidate.aiInterview?.captures?.length || candidate.aiInterview?.selfieDataUrl ? (
          <span className="flex -space-x-1.5">
            {(
              candidate.aiInterview.captures?.length
                ? candidate.aiInterview.captures
                : candidate.aiInterview.selfieDataUrl
                  ? [
                      {
                        id: "selfie",
                        dataUrl: candidate.aiInterview.selfieDataUrl,
                        kind: "identity" as const,
                        capturedAt: "",
                      },
                    ]
                  : []
            )
              .slice(0, 3)
              .map((cap) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={cap.id}
                  src={cap.dataUrl}
                  alt=""
                  className="size-5 rounded object-cover ring-1 ring-background"
                />
              ))}
          </span>
        ) : null}
        {candidate.rating ? <Stars value={candidate.rating} /> : null}
        {candidate.stage === "AI Interview" && candidate.interviewToken ? (
          <button
            type="button"
            onClick={onCopyInterview}
            className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"
          >
            Copy interview link
          </button>
        ) : null}
      </div>
    </li>
  )
}

function InterviewCaptureReview({ interview }: { interview: AiInterviewResult }) {
  const [active, setActive] = useState<string | null>(null)
  const captures =
    interview.captures?.length
      ? interview.captures
      : interview.selfieDataUrl
        ? [
            {
              id: "selfie",
              dataUrl: interview.selfieDataUrl,
              capturedAt: interview.completedAt,
              kind: "identity" as const,
            },
          ]
        : []
  const selected = captures.find((c) => c.id === active) ?? null

  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="font-medium">
        AI interview · {interview.score}/100 · {interview.pass ? "Pass" : "Fail"}
      </p>
      <p className="mt-1 text-muted-foreground">{interview.summary}</p>
      {captures.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Interview captures ({captures.length})
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {captures.map((cap) => (
              <button
                key={cap.id}
                type="button"
                onClick={() => setActive(cap.id)}
                className="group relative overflow-hidden rounded-lg border bg-muted/30 text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cap.dataUrl}
                  alt={cap.kind === "identity" ? "Identity" : "Random still"}
                  className="aspect-square w-full object-cover transition group-hover:opacity-90"
                />
                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                  {cap.kind === "identity" ? "Identity" : "Random"}
                </span>
              </button>
            ))}
          </div>
          {selected ? (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {selected.kind === "identity" ? "Identity capture" : "Random mid-interview still"}
                  {selected.capturedAt
                    ? ` · ${new Date(selected.capturedAt).toLocaleString()}`
                    : ""}
                </p>
                <Button size="xs" variant="ghost" type="button" onClick={() => setActive(null)}>
                  Close
                </Button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.dataUrl}
                alt="Selected capture"
                className="max-h-80 w-full rounded-md object-contain bg-black/5"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function CandidateDialog({
  candidate,
  job,
  canEdit,
  onClose,
  onMove,
  onNotice,
}: {
  candidate: Candidate
  job: Job
  canEdit: boolean
  onClose: () => void
  onMove: (stage: CandidateStage) => void
  onNotice: (notice: Notice) => void
}) {
  const { updateCandidate, deleteCandidate, sendTechnicalInvite, selectAfterTechnical, hireCandidate } =
    usePeopleOps()
  const [rating, setRating] = useState(candidate.rating)
  const [notes, setNotes] = useState(candidate.notes)
  const [techMode, setTechMode] = useState<"On-site" | "Online">(
    candidate.technicalInvite?.mode ?? "Online"
  )
  const [techNote, setTechNote] = useState(candidate.technicalInvite?.scheduledNote ?? "")
  const [scorecard, setScorecard] = useState<Record<string, string>>({
    ps: "3",
    com: "3",
    cul: "3",
    tech: "3",
  })
  const [scoreNotes, setScoreNotes] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  async function save() {
    setBusy("save")
    try {
      updateCandidate(candidate.id, { rating, notes })
      await flushHiringApiSync()
      onClose()
    } finally {
      setBusy(null)
    }
  }

  async function runDialogAction(key: string, action: () => { ok: boolean; message?: string }, closeOnOk = false) {
    if (busy) return
    setBusy(key)
    try {
      const result = action()
      if (result.ok) await flushHiringApiSync()
      onNotice(
        result.ok
          ? { ok: true, message: result.message ?? "Done." }
          : { ok: false, message: result.message ?? "Failed." }
      )
      if (result.ok && closeOnOk) onClose()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{candidate.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid gap-1 text-muted-foreground">
            <p>
              {candidate.email}
              {candidate.phone ? ` · ${candidate.phone}` : ""}
            </p>
            <p>
              {candidate.source} · Applied {formatDate(candidate.appliedAt)} · {candidate.stage}
            </p>
            {candidate.interviewToken ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Shareable interview link
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-foreground">
                  {interviewUrl(candidate.interviewToken)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="xs"
                    type="button"
                    loading={busy === "copy-link"}
                    onClick={() => {
                      void (async () => {
                        setBusy("copy-link")
                        try {
                          await navigator.clipboard.writeText(interviewUrl(candidate.interviewToken!))
                          onNotice({ ok: true, message: "Interview link copied." })
                        } catch {
                          onNotice({ ok: false, message: "Could not copy link." })
                        } finally {
                          setBusy(null)
                        }
                      })()
                    }}
                  >
                    <ClipboardCopy data-icon="inline-start" />
                    Copy link
                  </Button>
                  <a
                    className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
                    href={interviewUrl(candidate.interviewToken)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                  {candidate.interviewExpiresAt ? (
                    <span className="text-[11px] text-muted-foreground">
                      Expires {new Date(candidate.interviewExpiresAt).toLocaleString()}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : !candidate.aiInterview &&
              (candidate.stage === "Shortlisted" || candidate.stage === "AI Interview") &&
              canEdit ? (
              <Button
                size="sm"
                type="button"
                loading={busy === "create-link"}
                onClick={() =>
                  void runDialogAction("create-link", () => ensureInterviewLink(candidate.id))
                }
              >
                <Link2 data-icon="inline-start" />
                Create interview link to share
              </Button>
            ) : null}
          </div>

          {candidate.resumeFile ? (
            <div className="rounded-lg border px-3 py-2.5">
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">CV attached</p>
              <a
                href={candidate.resumeFile.dataUrl}
                download={candidate.resumeFile.name}
                className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
              >
                <FileText className="size-4 text-muted-foreground" />
                <span className="truncate">{candidate.resumeFile.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  ({Math.max(1, Math.round(candidate.resumeFile.size / 1024))} KB)
                </span>
              </a>
            </div>
          ) : null}

          {candidate.resumeNote ? (
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Resume note</p>
              <p>{candidate.resumeNote}</p>
            </div>
          ) : null}

          {candidate.applicationAnswers.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Application</p>
              {candidate.applicationAnswers.map((answer) => (
                <div key={answer.question} className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{answer.question}</p>
                  <p>{answer.answer}</p>
                </div>
              ))}
            </div>
          ) : null}

          {candidate.aiScreen ? (
            <div className="rounded-lg border px-3 py-2">
              <p className="font-medium">
                AI screen · {candidate.aiScreen.score}/100
                {candidate.aiScreen.score < job.hiring.passScore
                  ? ` · failed (need ≥${job.hiring.passScore})`
                  : " · passed"}
              </p>
              <p className="mt-1 text-muted-foreground">{candidate.aiScreen.summary}</p>
              {candidate.aiScreen.score < job.hiring.passScore && candidate.aiScreen.risks.length ? (
                <p className="mt-2 text-xs text-destructive">
                  Why it failed: {candidate.aiScreen.risks.join("; ")}
                </p>
              ) : null}
              {candidate.aiScreen.strengths.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Strengths: {candidate.aiScreen.strengths.join("; ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {candidate.aiInterview ? (
            <InterviewCaptureReview interview={candidate.aiInterview} />
          ) : null}

          {candidate.stage === "Technical Interview" && canEdit ? (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Technical interview invite
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Mode">
                  <OptionSelect
                    value={techMode}
                    onChange={(value) => setTechMode(value as "On-site" | "Online")}
                    options={["Online", "On-site"]}
                  />
                </Field>
              </div>
              <Field label="Schedule note">
                <Textarea
                  value={techNote}
                  onChange={(e) => setTechNote(e.target.value)}
                  placeholder="e.g. Panel with Maya · Thursday 2pm Zoom"
                  rows={2}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  loading={busy === "tech-invite"}
                  onClick={() =>
                    void runDialogAction("tech-invite", () =>
                      sendTechnicalInvite(candidate.id, techMode, techNote)
                    )
                  }
                >
                  Send technical invite
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === "tech-offer"}
                  onClick={() =>
                    void runDialogAction(
                      "tech-offer",
                      () => selectAfterTechnical(candidate.id, "Offer"),
                      true
                    )
                  }
                >
                  Select → Offer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === "tech-reject"}
                  onClick={() =>
                    void runDialogAction(
                      "tech-reject",
                      () => selectAfterTechnical(candidate.id, "Rejected"),
                      true
                    )
                  }
                >
                  Reject after tech
                </Button>
              </div>
              {candidate.technicalInvite ? (
                <p className="text-xs text-muted-foreground">
                  Last invite: {candidate.technicalInvite.mode} · {candidate.technicalInvite.scheduledNote}
                </p>
              ) : null}

              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Schedule slots (demo)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["Thu 2:00 PM", "Thu 4:00 PM", "Fri 10:00 AM", "Fri 1:30 PM"].map((slot) => (
                    <Button
                      key={slot}
                      size="sm"
                      variant={techNote.includes(slot) ? "default" : "outline"}
                      type="button"
                      onClick={() =>
                        setTechNote(`Panel with hiring manager · ${slot} (calendar sync later)`)
                      }
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Scorecard
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { label: "Problem solving", key: "ps" },
                    { label: "Communication", key: "com" },
                    { label: "Culture add", key: "cul" },
                    { label: "Technical depth", key: "tech" },
                  ].map((dim) => (
                    <label key={dim.key} className="text-xs">
                      <span className="text-muted-foreground">{dim.label}</span>
                      <OptionSelect
                        value={String(scorecard[dim.key] ?? "3")}
                        onChange={(value) =>
                          setScorecard((current) => ({ ...current, [dim.key]: value }))
                        }
                        options={["1", "2", "3", "4", "5"]}
                      />
                    </label>
                  ))}
                </div>
                <Field label="Scorecard notes">
                  <Textarea
                    value={scoreNotes}
                    onChange={(e) => setScoreNotes(e.target.value)}
                    rows={2}
                    placeholder="Strengths, risks, hire recommendation…"
                  />
                </Field>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() =>
                    onNotice({
                      ok: true,
                      message: "Scorecard saved locally (demo — not persisted to a backend).",
                    })
                  }
                >
                  Save scorecard
                </Button>
              </div>
            </div>
          ) : null}

          <Field label="Rating">
            <Stars
              value={rating}
              onChange={canEdit ? setRating : undefined}
            />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} rows={3} />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {canEdit && candidate.stage !== "Hired" ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                deleteCandidate(candidate.id)
                onClose()
              }}
            >
              <Trash2 data-icon="inline-start" />
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            {canEdit && candidate.stage === "Offer" ? (
              <>
                <Button
                  variant="outline"
                  render={<Link href="/dashboard/people-operations/offers" />}
                >
                  Create offer
                </Button>
                <Button
                  loading={busy === "hire"}
                  onClick={() => {
                    void (async () => {
                      setBusy("hire")
                      try {
                        const result = await hireCandidate(candidate.id)
                        if (result.ok) await flushHiringApiSync()
                        onNotice(result.ok ? { ok: true, message: result.message! } : result)
                        if (result.ok) onClose()
                      } finally {
                        setBusy(null)
                      }
                    })()
                  }}
                >
                  Mark hired
                </Button>
              </>
            ) : null}
            {canEdit && nextStage(candidate.stage) && candidate.stage !== "Offer" ? (
              <Button
                variant="outline"
                loading={busy === "advance"}
                onClick={() => {
                  setBusy("advance")
                  onMove(nextStage(candidate.stage)!)
                  setBusy(null)
                }}
              >
                Advance
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose} disabled={!!busy}>
              Close
            </Button>
            {canEdit ? (
              <Button loading={busy === "save"} onClick={() => void save()}>
                Save
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddCandidateDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { addCandidate } = usePeopleOps()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [source, setSource] = useState<Candidate["source"]>("Referral")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const result = addCandidate({ jobId: job.id, name, email, source, notes })
      if (!result.ok) {
        setError(result.message)
        return
      }
      await flushHiringApiSync()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add candidate · {job.title}</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required disabled={saving} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={saving} />
          </Field>
          <Field label="Source">
            <OptionSelect value={source} onChange={(v) => setSource(v as Candidate["source"])} options={candidateSources} />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={saving} />
          </Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function QuestionsDialog({
  job,
  onClose,
  onNotice,
}: {
  job: Job
  onClose: () => void
  onNotice: (notice: Notice) => void
}) {
  const { setInterviewQuestions, approveInterviewQuestions, generateAiInterviewQuestions } = usePeopleOps()
  const [questions, setQuestions] = useState<InterviewQuestion[]>(job.hiring.questions)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState<"save" | "approve" | null>(null)

  async function save(approveAll = false) {
    setSaving(approveAll ? "approve" : "save")
    try {
      const next = approveAll ? questions.map((q) => ({ ...q, approved: true })) : questions
      const result = setInterviewQuestions(job.id, next)
      if (!result.ok) {
        onNotice(result)
        return
      }
      if (approveAll) approveInterviewQuestions(job.id)
      await flushHiringApiSync()
      onNotice({ ok: true, message: approveAll ? "Questions saved and approved." : "Questions saved." })
      onClose()
    } finally {
      setSaving(null)
    }
  }

  async function generate() {
    setGenerating(true)
    try {
      const result = generateAiInterviewQuestions(job.id)
      if (!result.ok) {
        onNotice(result)
        return
      }
      if (result.questions) setQuestions(result.questions)
      await flushHiringApiSync()
      onNotice({ ok: true, message: result.message ?? "AI drafted 5 questions." })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI interview questions</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Click <strong>Generate with AI</strong> to draft five timed questions. Edit anything, then{" "}
          <strong>Save &amp; approve all</strong> so HR can send interview links.
        </p>
        <Button
          type="button"
          variant="outline"
          loading={generating}
          onClick={() => void generate()}
          className="w-full"
        >
          <Sparkles data-icon="inline-start" />
          {generating ? "Generating…" : "Generate with AI"}
        </Button>
        <div className="space-y-3">
          {questions.map((question, index) => (
            <div key={question.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Question {index + 1}
                </p>
                <Badge variant={question.approved ? "default" : "outline"}>
                  {question.approved ? "Approved" : "Needs approval"}
                </Badge>
              </div>
              <Textarea
                value={question.prompt}
                onChange={(e) =>
                  setQuestions((current) =>
                    current.map((item) =>
                      item.id === question.id ? { ...item, prompt: e.target.value, approved: false } : item
                    )
                  )
                }
                rows={2}
              />
              <Field label="Seconds">
                <Input
                  type="number"
                  min={30}
                  max={300}
                  value={question.seconds}
                  onChange={(e) =>
                    setQuestions((current) =>
                      current.map((item) =>
                        item.id === question.id
                          ? { ...item, seconds: Math.max(30, Number(e.target.value) || 90) }
                          : item
                      )
                    )
                  }
                />
              </Field>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={!!saving || generating}>
            Cancel
          </Button>
          <Button
            variant="outline"
            loading={saving === "save"}
            disabled={generating}
            onClick={() => void save(false)}
          >
            Save drafts
          </Button>
          <Button loading={saving === "approve"} disabled={generating} onClick={() => void save(true)}>
            Save & approve all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function JobDialog({
  job,
  onClose,
  onSaved,
}: {
  job: Job | null
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const { saveJob } = usePeopleOps()
  const { departments, employees } = useOrganization()
  const managers = useMemo(
    () => employees.filter((e) => e.status === "Active"),
    [employees]
  )
  const defaults = createHiringConfig(job?.title || "New role")
  const [title, setTitle] = useState(job?.title ?? "")
  const [departmentId, setDepartmentId] = useState(job?.departmentId ?? departments[0]?.id ?? "")
  const [hiringManagerId, setHiringManagerId] = useState(job?.hiringManagerId ?? managers[0]?.id ?? "")
  const [openings, setOpenings] = useState(job?.openings ?? 1)
  const [status, setStatus] = useState<Job["status"]>(job?.status ?? "Open")
  const [description, setDescription] = useState(job?.description ?? "")
  const [location, setLocation] = useState(job?.location ?? "Remote")
  const [employmentType, setEmploymentType] = useState<Job["employmentType"]>(job?.employmentType ?? "Full-time")
  const [expiresAt, setExpiresAt] = useState(job?.hiring.applyForm.expiresAt ?? defaults.applyForm.expiresAt)
  const [slug, setSlug] = useState(job?.hiring.applyForm.slug ?? "")
  const [welcome, setWelcome] = useState(job?.hiring.applyForm.welcomeMessage ?? defaults.applyForm.welcomeMessage)
  const [passScore, setPassScore] = useState(job?.hiring.passScore ?? 70)
  const [captureDelay, setCaptureDelay] = useState(job?.hiring.captureDelaySeconds ?? 5)
  const [linkHours, setLinkHours] = useState(job?.hiring.interviewLinkHours ?? 48)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const hiring = {
        ...(job?.hiring ?? createHiringConfig(title || "New role")),
        passScore,
        captureDelaySeconds: captureDelay,
        interviewLinkHours: linkHours,
        applyForm: {
          ...(job?.hiring.applyForm ?? defaults.applyForm),
          slug: slug || defaults.applyForm.slug,
          expiresAt,
          welcomeMessage: welcome,
          published: true,
        },
      }
      const result = saveJob({
        id: job?.id,
        title,
        departmentId,
        hiringManagerId,
        openings,
        status,
        description,
        location,
        employmentType,
        hiring,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      await flushHiringApiSync()
      onSaved(result.id ?? job?.id ?? "")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{job ? "Edit job" : "New job"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required disabled={saving} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Department">
              <KeyedSelect
                value={departmentId}
                onChange={setDepartmentId}
                options={departments.map((d) => [d.id, d.name] as const)}
              />
            </Field>
            <Field label="Hiring manager">
              <KeyedSelect
                value={hiringManagerId}
                onChange={setHiringManagerId}
                options={managers.map((e) => [e.id, e.name] as const)}
              />
            </Field>
            <Field label="Location">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
            <Field label="Type">
              <OptionSelect
                value={employmentType}
                onChange={(v) => setEmploymentType(v as Job["employmentType"])}
                options={["Full-time", "Part-time", "Contract"]}
              />
            </Field>
            <Field label="Openings">
              <Input
                type="number"
                min={1}
                value={openings}
                onChange={(e) => setOpenings(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
            <Field label="Status">
              <OptionSelect
                value={status}
                onChange={(v) => setStatus(v as Job["status"])}
                options={["Open", "On hold", "Closed"]}
              />
            </Field>
          </div>
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Apply form</p>
            <Field label="URL slug">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="senior-backend-engineer"
              />
            </Field>
            <Field label="Closes on">
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
            <Field label="Welcome message">
              <Textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} rows={2} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Pass score">
              <Input
                type="number"
                min={50}
                max={100}
                value={passScore}
                onChange={(e) => setPassScore(Number(e.target.value) || 70)}
              />
            </Field>
            <Field label="Selfie delay (s)">
              <Input
                type="number"
                min={3}
                max={15}
                value={captureDelay}
                onChange={(e) => setCaptureDelay(Number(e.target.value) || 5)}
              />
            </Field>
            <Field label="Interview link (h)">
              <Input
                type="number"
                min={12}
                max={168}
                value={linkHours}
                onChange={(e) => setLinkHours(Number(e.target.value) || 48)}
              />
            </Field>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {job ? "Save" : "Create job & form"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
