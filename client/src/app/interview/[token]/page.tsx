"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Shield,
  Sparkles,
  Video,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAgencyProfile } from "@/components/dashboard/agency-store"
import { ApiError } from "@/lib/api"
import { peopleOpsApi, type ApiPublicInterviewSession } from "@/lib/auth-api"
import { completeAiInterview } from "@/lib/hiring-actions"
import type { InterviewCapture } from "@/lib/hiring-pipeline"
import { useHiringState } from "@/lib/hiring-store"
import { agencyInitials } from "@/lib/agency"
import { cn } from "@/lib/utils"

const MAX_RANDOM_CAPTURES = 8

function grabVideoFrame(video: HTMLVideoElement | null, quality = 0.72): string | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null
  const maxW = 640
  const scale = Math.min(1, maxW / video.videoWidth)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", quality)
}

type Phase = "gate" | "camera" | "questions" | "done"

const fieldClass =
  "h-11 border-white/12 bg-white/[0.04] text-white placeholder:text-white/35 focus-visible:border-sky-300/45 focus-visible:ring-sky-400/20"

const STEPS = [
  { id: "gate", label: "Confirm" },
  { id: "camera", label: "Identity" },
  { id: "questions", label: "Questions" },
  { id: "done", label: "Results" },
] as const

function formatExpiry(iso?: string) {
  if (!iso) return null
  const ends = Date.parse(iso)
  if (Number.isNaN(ends)) return null
  const ms = ends - Date.now()
  if (ms <= 0) return { expired: true as const, label: "Link expired — ask HR to resend" }
  const hours = Math.floor(ms / 3_600_000)
  const mins = Math.floor((ms % 3_600_000) / 60_000)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return { expired: false as const, label: `${days}d ${hours % 24}h remaining` }
  }
  if (hours >= 1) return { expired: false as const, label: `${hours}h ${mins}m remaining` }
  return { expired: false as const, label: `${mins}m remaining` }
}

function stepIndex(phase: Phase) {
  return STEPS.findIndex((step) => step.id === phase)
}

export default function InterviewPage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const { jobs, candidates } = useHiringState()
  const agency = useAgencyProfile()
  const [remote, setRemote] = useState<ApiPublicInterviewSession | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing">("loading")

  const localCandidate = useMemo(
    () => candidates.find((item) => item.interviewToken === token),
    [candidates, token]
  )
  const localJob = useMemo(
    () => jobs.find((item) => item.id === localCandidate?.jobId),
    [jobs, localCandidate]
  )

  useEffect(() => {
    let cancelled = false
    setLoadState("loading")
    void peopleOpsApi
      .publicGetInterview(token)
      .then((session) => {
        if (cancelled) return
        setRemote(session)
        setLoadState("ready")
      })
      .catch(() => {
        if (cancelled) return
        if (localCandidate && localJob) {
          setRemote(null)
          setLoadState("ready")
          return
        }
        setRemote(null)
        setLoadState("missing")
      })
    return () => {
      cancelled = true
    }
    // localCandidate/job only used as offline fallback when API fails
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const candidateName = remote?.candidateName ?? localCandidate?.name ?? ""
  const jobTitleValue = remote?.jobTitle ?? localJob?.title ?? ""
  const alreadyDone = Boolean(
    remote?.completed || localCandidate?.aiInterview
  )
  const doneScore = remote?.score ?? localCandidate?.aiInterview?.score
  const donePass = remote?.passed ?? localCandidate?.aiInterview?.pass
  const expiresAt = remote?.expiresAt || localCandidate?.interviewExpiresAt
  const hasSession = Boolean(remote || (localCandidate && localJob))

  const [phase, setPhase] = useState<Phase>("gate")
  const [name, setName] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [error, setError] = useState("")
  const [selfie, setSelfie] = useState<string>()
  const [captures, setCaptures] = useState<InterviewCapture[]>([])
  const [flash, setFlash] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [answer, setAnswer] = useState("")
  const [answers, setAnswers] = useState<{ questionId: string; answer: string }[]>([])
  const [resultMessage, setResultMessage] = useState("")
  const [passed, setPassed] = useState(false)
  const [score, setScore] = useState<number>()
  const [cameraReady, setCameraReady] = useState(false)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const mainVideoRef = useRef<HTMLVideoElement>(null)
  const pipVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const prefilled = useRef(false)
  const captured = useRef(false)
  const capturesRef = useRef<InterviewCapture[]>([])
  const questionIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    capturesRef.current = captures
  }, [captures])

  function pushCapture(kind: InterviewCapture["kind"], dataUrl: string, questionId?: string) {
    const next: InterviewCapture = {
      id: `cap-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      dataUrl,
      capturedAt: new Date().toISOString(),
      kind,
      questionId,
    }
    setCaptures((prev) => {
      if (kind === "random" && prev.filter((c) => c.kind === "random").length >= MAX_RANDOM_CAPTURES) {
        return prev
      }
      const merged = [...prev, next]
      capturesRef.current = merged
      return merged
    })
    if (kind === "random") {
      setFlash(true)
      window.setTimeout(() => setFlash(false), 220)
    }
  }

  function takeRandomStill() {
    const video = pipVideoRef.current?.srcObject ? pipVideoRef.current : mainVideoRef.current
    const frame = grabVideoFrame(video)
    if (!frame) return
    pushCapture("random", frame, questionIdRef.current)
  }

  useEffect(() => {
    if (!hasSession || prefilled.current) return
    setName(candidateName)
    setJobTitle(jobTitleValue)
    prefilled.current = true
  }, [hasSession, candidateName, jobTitleValue])

  const questions = useMemo(() => {
    if (remote?.questions?.length) {
      return remote.questions.map((q) => ({ ...q, approved: true }))
    }
    return (
      localJob?.hiring.questions.filter((q) => q.approved) ??
      localJob?.hiring.questions ??
      []
    ).slice(0, 5)
  }, [remote, localJob])
  const current = questions[questionIndex]
  const captureDelay = remote?.captureDelaySeconds ?? localJob?.hiring.captureDelaySeconds ?? 5
  const expiry = formatExpiry(expiresAt)
  const showPip = phase === "questions" && cameraReady
  const activeStep = stepIndex(phase)
  const brandName = remote?.organization.name || agency.name
  const brandLogo = remote?.organization.logoUrl || agency.logoDataUrl

  useEffect(() => {
    questionIdRef.current = current?.id
  }, [current?.id])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraReady(false)
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  // Random mid-interview stills while questions are active.
  useEffect(() => {
    if (phase !== "questions" || !cameraReady) return
    let cancelled = false
    let timer = 0
    const schedule = () => {
      const delay = 5_000 + Math.random() * 10_000
      timer = window.setTimeout(() => {
        if (cancelled) return
        takeRandomStill()
        schedule()
      }, delay)
    }
    // First random still shortly after questions start.
    timer = window.setTimeout(() => {
      if (cancelled) return
      takeRandomStill()
      schedule()
    }, 2_500 + Math.random() * 2_500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cameraReady])

  useEffect(() => {
    if (phase !== "camera") return
    if (streamRef.current) {
      if (mainVideoRef.current) {
        mainVideoRef.current.srcObject = streamRef.current
        void mainVideoRef.current.play()
      }
      setCountdown(captureDelay)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        setCameraReady(true)
        if (mainVideoRef.current) {
          mainVideoRef.current.srcObject = stream
          await mainVideoRef.current.play()
        }
        setCountdown(captureDelay)
      } catch {
        setError("Camera access is required. Allow the camera and try again.")
        setPhase("gate")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [phase, captureDelay])

  useEffect(() => {
    if (phase !== "questions" || !streamRef.current || !pipVideoRef.current) return
    pipVideoRef.current.srcObject = streamRef.current
    void pipVideoRef.current.play().catch(() => undefined)
  }, [phase, questionIndex, cameraReady])

  useEffect(() => {
    if (phase !== "camera" || countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [phase, countdown])

  useEffect(() => {
    if (phase !== "camera" || countdown !== 0 || captured.current) return
    const frame = grabVideoFrame(mainVideoRef.current, 0.82)
    if (!frame || !streamRef.current) return
    setSelfie(frame)
    pushCapture("identity", frame)
    captured.current = true
    setQuestionIndex(0)
    setSecondsLeft(questions[0]?.seconds ?? 90)
    setAnswer("")
    setPhase("questions")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown, questions])

  useEffect(() => {
    if (phase !== "questions" || !current) return
    if (secondsLeft <= 0) {
      advance(answer)
      return
    }
    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft, current?.id])

  function startInterview(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!hasSession) return
    if (alreadyDone) {
      setError("This interview was already completed.")
      return
    }
    if (expiresAt && Date.parse(expiresAt) < Date.now()) {
      setError("This interview link has expired. Ask HR to resend it.")
      return
    }
    if (name.trim().toLowerCase() !== candidateName.trim().toLowerCase()) {
      setError("Use the same full name from your application.")
      return
    }
    if (!jobTitle.trim()) {
      setError("Confirm the role you applied for.")
      return
    }
    setStarting(true)
    captured.current = false
    setSelfie(undefined)
    setCaptures([])
    capturesRef.current = []
    setPhase("camera")
    // Camera phase mounts immediately; clear the brief start spinner.
    window.setTimeout(() => setStarting(false), 400)
  }

  function advance(text: string) {
    if (!current) return
    // Chance to grab a still when leaving a question.
    if (Math.random() < 0.55) takeRandomStill()
    const nextAnswers = [...answers, { questionId: current.id, answer: text }]
    setAnswers(nextAnswers)
    const nextIndex = questionIndex + 1
    if (nextIndex >= questions.length) {
      void finish(nextAnswers)
      return
    }
    setQuestionIndex(nextIndex)
    setSecondsLeft(questions[nextIndex]?.seconds ?? 90)
    setAnswer("")
  }

  async function finish(finalAnswers: { questionId: string; answer: string }[]) {
    takeRandomStill()
    const snapshot = [...capturesRef.current]
    stopCamera()
    setSubmitting(true)
    try {
      const remoteResult = await peopleOpsApi.publicCompleteInterview(token, {
        name,
        jobTitleConfirm: jobTitle,
        selfieDataUrl: selfie,
        captures: snapshot,
        answers: finalAnswers,
      })
      setPassed(remoteResult.passed)
      setScore(remoteResult.score)
      setResultMessage(remoteResult.message)
      setPhase("done")
    } catch (err) {
      // Fallback for local-only demos when public API isn’t available.
      const result = completeAiInterview({
        token,
        name,
        jobTitleConfirm: jobTitle,
        selfieDataUrl: selfie,
        captures: snapshot,
        answers: finalAnswers,
      })
      if (result.ok) {
        setPassed(Boolean("pass" in result && result.pass))
        setResultMessage(result.message ?? "Submitted.")
        const match = result.message?.match(/(\d+)\s*\/\s*100/)
        if (match) setScore(Number(match[1]))
        setPhase("done")
      } else {
        setError(
          err instanceof ApiError
            ? err.detail
            : result.message || "Could not submit interview."
        )
        setPhase("gate")
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loadState === "loading") {
    return (
      <Shell brandName={brandName} brandLogo={brandLogo}>
        <StatusCard
          tone="neutral"
          icon={<Clock className="size-7" />}
          title="Loading interview…"
          body="Preparing your timed AI interview session."
        />
      </Shell>
    )
  }

  if (loadState === "missing" || !hasSession) {
    return (
      <Shell brandName={brandName} brandLogo={brandLogo}>
        <StatusCard
          tone="danger"
          icon={<XCircle className="size-7" />}
          title="Invalid interview link"
          body="This invitation is missing or no longer valid. Please contact People Operations for a new link."
        />
      </Shell>
    )
  }

  if (alreadyDone && phase === "gate") {
    return (
      <Shell jobTitle={jobTitleValue} brandName={brandName} brandLogo={brandLogo}>
        <StatusCard
          tone="success"
          icon={<CheckCircle2 className="size-7" />}
          title="Interview already submitted"
          body={`Your responses are on file. Score ${doneScore ?? "—"}/100 · ${
            donePass ? "Advanced to next stage" : "Did not meet the pass bar"
          }.`}
        />
      </Shell>
    )
  }

  const timerPct = current ? Math.max(0, Math.min(100, (secondsLeft / (current.seconds || 90)) * 100)) : 0
  const overallPct =
    phase === "done"
      ? 100
      : phase === "questions"
        ? Math.round(((questionIndex + (1 - secondsLeft / Math.max(1, current?.seconds || 90))) / questions.length) * 100)
        : phase === "camera"
          ? 28
          : 8

  return (
    <Shell jobTitle={jobTitleValue} expiry={expiry} brandName={brandName} brandLogo={brandLogo}>
      <ProgressRail active={activeStep} overall={overallPct} />

      <div key={phase} className="interview-enter mt-8">
        {phase === "gate" ? (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <section className="space-y-6">
              <div>
                <p className="text-xs font-semibold tracking-[0.22em] text-sky-300/85 uppercase">
                  Structured AI interview
                </p>
                <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white md:text-[2.35rem] md:leading-tight">
                  {jobTitleValue}
                </h1>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/58">
                  A short, timed session. Confirm your details, complete a quick identity capture, then answer{" "}
                  {questions.length} approved questions while your camera stays on.
                </p>
              </div>

              <ul className="space-y-3">
                {[
                  {
                    icon: Shield,
                    title: "Identity capture",
                    body: `${captureDelay}-second selfie before questions begin`,
                  },
                  {
                    icon: Video,
                    title: "Live camera",
                    body: "Preview stays visible in the corner throughout",
                  },
                  {
                    icon: Clock,
                    title: "Timed answers",
                    body: "Each question has its own countdown set by HR",
                  },
                  {
                    icon: Sparkles,
                    title: "Instant scoring",
                    body: `Pass bar is ${remote?.passScore ?? localJob?.hiring.passScore ?? 70}/100 for this role`,
                  },
                ].map((item) => (
                  <li
                    key={item.title}
                    className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3"
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300">
                      <item.icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-white/50">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <Card>
              <div className="mb-5 border-b border-white/8 pb-4">
                <p className="text-sm font-medium text-white">Confirm your identity</p>
                <p className="mt-1 text-xs text-white/45">
                  Use the same name from your application, then enable your camera.
                </p>
              </div>
              <form onSubmit={startInterview} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-white/78">
                    Full name
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={candidateName}
                    required
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role" className="text-sm font-medium text-white/78">
                    Role applied for
                  </Label>
                  <Input
                    id="role"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder={jobTitleValue}
                    required
                    className={fieldClass}
                  />
                </div>
                {error ? (
                  <p className="rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  loading={starting}
                  disabled={expiry?.expired}
                  className="h-11 w-full bg-white text-zinc-950 hover:bg-white/92"
                >
                  Begin interview
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <p className="text-center text-[11px] leading-relaxed text-white/35">
                  By continuing you consent to identity and random mid-interview camera stills for reviewer audit.
                </p>
              </form>
            </Card>
          </div>
        ) : null}

        {phase === "camera" ? (
          <Card className="overflow-hidden p-0">
            <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
              <div className="relative min-h-[280px] bg-black sm:min-h-[360px]">
                <video
                  ref={mainVideoRef}
                  muted
                  playsInline
                  autoPlay
                  className="absolute inset-0 size-full scale-x-[-1] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative flex size-28 items-center justify-center rounded-full border border-white/25 bg-black/35 backdrop-blur-sm sm:size-32">
                    <span className="font-display text-5xl font-semibold tabular-nums text-white sm:text-6xl">
                      {countdown}
                    </span>
                    <span
                      className="absolute inset-0 rounded-full border-2 border-sky-300/70"
                      style={{
                        maskImage: `conic-gradient(#000 ${(countdown / captureDelay) * 100}%, transparent 0)`,
                        WebkitMaskImage: `conic-gradient(#000 ${(countdown / captureDelay) * 100}%, transparent 0)`,
                      }}
                    />
                  </div>
                </div>
                <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/85 backdrop-blur">
                  <span className="size-1.5 animate-pulse rounded-full bg-red-400" />
                  Camera live · capturing shortly
                </div>
              </div>
              <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-sky-400/12 text-sky-300">
                  <Camera className="size-5" />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-semibold text-white">Identity capture</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">
                    Face the camera in good light. After {captureDelay} seconds we save your identity frame,
                    then random stills are taken during questions for reviewer audit.
                  </p>
                </div>
                <ul className="space-y-2 text-sm text-white/50">
                  <li className="flex items-center gap-2">
                    <Check className="size-3.5 text-emerald-300" /> Center your face in frame
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-3.5 text-emerald-300" /> Stay still until the countdown ends
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-3.5 text-emerald-300" /> Random captures continue during answers
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        ) : null}

        {phase === "questions" && current ? (
          <div className="mx-auto max-w-2xl">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {questions.map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      index < questionIndex
                        ? "w-6 bg-emerald-400"
                        : index === questionIndex
                          ? "w-8 bg-white"
                          : "w-4 bg-white/20"
                    )}
                  />
                ))}
              </div>
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium tabular-nums",
                  secondsLeft <= 15
                    ? "bg-amber-400/15 text-amber-200"
                    : "bg-white/8 text-white/75"
                )}
              >
                <Clock className="size-3.5" />
                {secondsLeft}s left
              </div>
            </div>

            <Card>
              <div className="flex items-center justify-between gap-3 text-xs tracking-wide text-white/45 uppercase">
                <span>
                  Question {questionIndex + 1} of {questions.length}
                </span>
                <span>{Math.round(timerPct)}% of time remaining</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-1000 ease-linear",
                    secondsLeft <= 15 ? "bg-amber-300" : "bg-sky-300"
                  )}
                  style={{ width: `${timerPct}%` }}
                />
              </div>

              <h2 className="mt-7 font-display text-2xl font-semibold leading-snug text-white md:text-[1.75rem]">
                {current.prompt}
              </h2>
              <p className="mt-2 text-sm text-white/45">
                Write a clear, specific answer. You can submit early when you are ready.
              </p>

              <Textarea
                className={cn(fieldClass, "mt-6 min-h-44 resize-none text-base leading-relaxed")}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer here…"
                autoFocus
              />

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-white/35">
                  {answer.trim().length ? `${answer.trim().split(/\s+/).length} words` : "No answer yet"}
                </p>
                <Button
                  className="h-11 min-w-40 bg-white text-zinc-950 hover:bg-white/92"
                  loading={submitting}
                  onClick={() => advance(answer)}
                  disabled={submitting || (!answer.trim() && secondsLeft > 8)}
                >
                  {questionIndex + 1 >= questions.length
                    ? submitting
                      ? "Submitting…"
                      : "Submit interview"
                    : "Next question"}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </Card>
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="mx-auto max-w-lg">
            <Card className="text-center">
              <div
                className={cn(
                  "mx-auto flex size-16 items-center justify-center rounded-full",
                  passed ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-200"
                )}
              >
                {passed ? <CheckCircle2 className="size-8" /> : <XCircle className="size-8" />}
              </div>
              <p className="mt-5 text-xs font-semibold tracking-[0.2em] text-white/40 uppercase">
                {passed ? "Advanced" : "Not advanced"}
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-white">
                {passed ? "Strong interview signal" : "Interview complete"}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/55">{resultMessage}</p>

              {typeof score === "number" ? (
                <div className="mx-auto mt-6 grid max-w-xs grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                    <p className="text-[11px] tracking-wide text-white/40 uppercase">Score</p>
                    <p className="mt-1 font-display text-2xl font-semibold text-white">{score}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                    <p className="text-[11px] tracking-wide text-white/40 uppercase">Pass bar</p>
                    <p className="mt-1 font-display text-2xl font-semibold text-white">
                      {remote?.passScore ?? localJob?.hiring.passScore ?? 70}
                    </p>
                  </div>
                </div>
              ) : null}

              {captures.length ? (
                <div className="mt-6">
                  <p className="mb-2 text-[11px] text-white/40">
                    {captures.length} camera still{captures.length === 1 ? "" : "s"} saved for review
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {captures.slice(0, 8).map((cap) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={cap.id}
                        src={cap.dataUrl}
                        alt={cap.kind === "identity" ? "Identity" : "Random capture"}
                        className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/15"
                      />
                    ))}
                  </div>
                </div>
              ) : selfie ? (
                <div className="mt-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selfie}
                    alt="Identity capture"
                    className="mx-auto h-24 w-24 rounded-2xl object-cover ring-2 ring-white/10"
                  />
                  <p className="mt-2 text-[11px] text-white/35">Identity capture on file</p>
                </div>
              ) : null}

              <p className="mt-8 text-xs text-white/40">
                {passed
                  ? "People Operations will follow up about the technical interview."
                  : "Thank you for your time. HR has received your session."}
              </p>
            </Card>
          </div>
        ) : null}
      </div>

      <aside
        className={cn(
          "fixed bottom-5 left-5 z-50 overflow-hidden rounded-2xl border border-white/18 bg-zinc-950 shadow-[0_18px_50px_rgba(0,0,0,0.55)] transition-all duration-300",
          showPip ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        )}
        aria-hidden={!showPip}
      >
        <div className="relative">
          <video
            ref={pipVideoRef}
            muted
            playsInline
            autoPlay
            className="h-28 w-40 scale-x-[-1] object-cover sm:h-[7.5rem] sm:w-52"
          />
          <div
            className={cn(
              "pointer-events-none absolute inset-0 bg-white transition-opacity duration-150",
              flash ? "opacity-70" : "opacity-0"
            )}
          />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-2.5 py-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-white uppercase">
              <span className="size-1.5 animate-pulse rounded-full bg-red-400" />
              Live
            </span>
            <span className="text-[10px] tabular-nums text-white/70">
              {captures.filter((c) => c.kind === "random").length}/{MAX_RANDOM_CAPTURES}
            </span>
          </div>
        </div>
      </aside>
    </Shell>
  )
}

function ProgressRail({ active, overall }: { active: number; overall: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 sm:px-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium tracking-wide text-white/40 uppercase">Session progress</p>
        <p className="text-[11px] tabular-nums text-white/45">{Math.min(100, Math.max(0, overall))}%</p>
      </div>
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((step, index) => {
          const done = index < active
          const current = index === active
          return (
            <li key={step.id} className="min-w-0">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl px-2 py-2",
                  current && "bg-white/8",
                  done && "opacity-80"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    done && "bg-emerald-400 text-zinc-950",
                    current && "bg-white text-zinc-950",
                    !done && !current && "bg-white/10 text-white/50"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "truncate text-xs font-medium",
                    current ? "text-white" : "text-white/45"
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function StatusCard({
  tone,
  icon,
  title,
  body,
}: {
  tone: "success" | "danger" | "neutral"
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <Card className="mx-auto mt-10 max-w-md text-center">
      <div
        className={cn(
          "mx-auto flex size-14 items-center justify-center rounded-full",
          tone === "success"
            ? "bg-emerald-400/15 text-emerald-300"
            : tone === "danger"
              ? "bg-red-400/15 text-red-300"
              : "bg-sky-400/15 text-sky-300"
        )}
      >
        {icon}
      </div>
      <h1 className="mt-5 font-display text-2xl font-semibold text-white">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/55">{body}</p>
      {tone !== "neutral" ? (
        <Link href="/" className="mt-6 inline-flex text-sm text-sky-300 transition hover:text-sky-200">
          Back to home
        </Link>
      ) : null}
    </Card>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[1.6rem] border border-white/10 bg-[#10151d]/92 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.4)] backdrop-blur-md sm:p-7",
        className
      )}
    >
      {children}
    </div>
  )
}

function Shell({
  children,
  jobTitle,
  expiry,
  brandName,
  brandLogo,
}: {
  children: React.ReactNode
  jobTitle?: string
  expiry?: ReturnType<typeof formatExpiry>
  brandName?: string
  brandLogo?: string
}) {
  const agency = useAgencyProfile()
  const name = brandName || agency.name
  const logo = brandLogo || agency.logoDataUrl

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#07090c] text-white">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,_rgba(56,140,210,0.2),_transparent_58%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.7)_1px,transparent_1px)",
          backgroundSize: "64px 64px",
        }}
        aria-hidden
      />

      <header className="relative border-b border-white/6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 md:px-8">
          <Link href="/" className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-white/90 hover:text-white">
            <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10 text-[10px]">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="size-full object-cover" />
              ) : (
                agencyInitials(name)
              )}
            </span>
            <span className="truncate">{name}</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-xs text-white/45">
            {jobTitle ? <span className="hidden truncate sm:inline">{jobTitle}</span> : null}
            {expiry ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium",
                  expiry.expired ? "bg-red-400/15 text-red-200" : "bg-white/8 text-white/65"
                )}
              >
                {expiry.label}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-10">{children}</main>
    </div>
  )
}
