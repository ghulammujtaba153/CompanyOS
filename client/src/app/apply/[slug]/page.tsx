"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, CheckCircle2, FileText, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { peopleOpsApi, type ApiPublicApplyJob } from "@/lib/auth-api"
import type { ResumeFile } from "@/lib/hiring-pipeline"
import { agencyInitials } from "@/lib/agency"
import { todayIso } from "@/lib/people-ops"
import { formatDate } from "@/lib/work-utils"
import { cn } from "@/lib/utils"

const MAX_CV_BYTES = 2 * 1024 * 1024
const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const fieldClass =
  "border-white/15 bg-white/[0.04] text-white placeholder:text-white/35 focus-visible:border-sky-300/50 focus-visible:ring-sky-400/25"

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function readResumeFile(file: File): Promise<ResumeFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        dataUrl: String(reader.result ?? ""),
      })
    }
    reader.onerror = () => reject(new Error("Could not read that file."))
    reader.readAsDataURL(file)
  })
}

export default function ApplyPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const fileRef = useRef<HTMLInputElement>(null)

  const [job, setJob] = useState<ApiPublicApplyJob | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing">("loading")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [resumeNote, setResumeNote] = useState("")
  const [experience, setExperience] = useState("")
  const [motivation, setMotivation] = useState("")
  const [resumeFile, setResumeFile] = useState<ResumeFile | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadState("loading")
    setJob(null)
    setDone(false)
    setError("")

    void peopleOpsApi
      .publicGetJobBySlug(slug)
      .then((next) => {
        if (cancelled) return
        setJob(next)
        setLoadState("ready")
      })
      .catch(() => {
        if (cancelled) return
        setJob(null)
        setLoadState("missing")
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  async function attachFile(file: File | undefined | null) {
    if (!file) return
    setError("")
    const lower = file.name.toLowerCase()
    const okType =
      file.type.includes("pdf") ||
      file.type.includes("word") ||
      file.type.includes("document") ||
      lower.endsWith(".pdf") ||
      lower.endsWith(".doc") ||
      lower.endsWith(".docx")
    if (!okType) {
      setError("Upload a PDF or Word document (.pdf, .doc, .docx).")
      return
    }
    if (file.size > MAX_CV_BYTES) {
      setError("CV must be 2 MB or smaller for this demo.")
      return
    }
    try {
      setBusy(true)
      setResumeFile(await readResumeFile(file))
    } catch {
      setError("Could not read that file. Try another CV.")
    } finally {
      setBusy(false)
    }
  }

  if (loadState === "loading") {
    return (
      <Shell>
        <Card>
          <p className="text-sm text-white/60">Loading application form…</p>
        </Card>
      </Shell>
    )
  }

  if (loadState === "missing" || !job) {
    return (
      <Shell>
        <Card>
          <h1 className="font-display text-2xl font-semibold text-white">Role not found</h1>
          <p className="mt-2 text-sm text-white/60">This apply link is invalid or the job was removed.</p>
          <Link href="/" className="mt-6 inline-flex text-sm text-sky-300 hover:text-sky-200">
            Back home
          </Link>
        </Card>
      </Shell>
    )
  }

  const org = job.organization
  const expired = job.applyForm.expiresAt < todayIso() || job.status === "Closed"
  const unpublished = !job.applyForm.published

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!resumeFile) {
      setError("Attach your CV / resume to continue.")
      return
    }
    setBusy(true)
    try {
      await peopleOpsApi.publicApplyToJob(slug, {
        name,
        email,
        phone,
        resumeNote,
        resumeFile,
        answers: [
          { question: "Relevant experience", answer: experience },
          { question: "Why this role", answer: motivation },
        ],
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not submit application.")
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Shell>
        <Card className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
            <CheckCircle2 className="size-7" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold text-white">Application received</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/65">
            Thanks for applying to <span className="text-white">{job.title}</span>. After the form closes on{" "}
            {formatDate(job.applyForm.expiresAt)}, our team will run AI screening and contact shortlisted
            candidates with a timed interview link.
          </p>
          {resumeFile ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/70">
              <FileText className="size-3.5" />
              {resumeFile.name} attached
            </p>
          ) : null}
        </Card>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/55 transition hover:text-white"
        >
          <span className="flex size-7 items-center justify-center overflow-hidden rounded-lg bg-white/10 text-[10px] font-semibold text-white">
            {org.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt="" className="size-full object-cover" />
            ) : (
              agencyInitials(org.name)
            )}
          </span>
          <ArrowLeft className="size-3.5" />
          {org.name}
        </Link>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-wide text-white/55 uppercase">
          Careers
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="lg:sticky lg:top-10">
          <p className="text-xs font-semibold tracking-[0.22em] text-sky-300/80 uppercase">
            {org.name} · Now hiring
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
            {job.title}
          </h1>
          <p className="mt-3 text-sm text-white/55">
            {job.location}
            <span className="mx-2 text-white/25">·</span>
            {job.employmentType}
            <span className="mx-2 text-white/25">·</span>
            Closes {formatDate(job.applyForm.expiresAt)}
          </p>
          {org.tagline ? (
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55">{org.tagline}</p>
          ) : null}
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
            {job.applyForm.welcomeMessage}
          </p>
          {job.description ? (
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/50">{job.description}</p>
          ) : null}
          {org.about ? (
            <p className="mt-4 max-w-md text-xs leading-relaxed text-white/40">{org.about}</p>
          ) : null}
          <ul className="mt-8 space-y-2 text-sm text-white/45">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-400/80" />
              Attach your CV (PDF or Word)
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-400/80" />
              Applications reviewed after the form closes
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-400/80" />
              Shortlisted candidates get a timed AI interview link
            </li>
          </ul>
        </div>

        <Card>
          {expired || unpublished ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/55">
              {unpublished
                ? "This apply form is not published yet."
                : "This application form has closed. We are no longer accepting new responses."}
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-semibold text-white">Apply now</h2>
                <p className="mt-1 text-sm text-white/50">All fields marked required must be completed.</p>
              </div>

              <Field label="Full name" htmlFor="name">
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={fieldClass}
                  placeholder="Your name"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={fieldClass}
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="Phone" htmlFor="phone">
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={fieldClass}
                    placeholder="+1 …"
                  />
                </Field>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-white/80">
                  CV / resume <span className="text-sky-300">*</span>
                </Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={(e) => void attachFile(e.target.files?.[0])}
                />
                {resumeFile ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{resumeFile.name}</p>
                      <p className="text-xs text-white/50">{formatBytes(resumeFile.size)}</p>
                    </div>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="text-white/60 hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        setResumeFile(null)
                        if (fileRef.current) fileRef.current.value = ""
                      }}
                      aria-label="Remove CV"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOver(false)
                      void attachFile(e.dataTransfer.files?.[0])
                    }}
                    className={cn(
                      "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition",
                      dragOver
                        ? "border-sky-300/60 bg-sky-400/10"
                        : "border-white/20 bg-white/[0.03] hover:border-white/35 hover:bg-white/[0.05]"
                    )}
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-white/10 text-sky-300">
                      <Upload className="size-4" />
                    </span>
                    <span className="text-sm font-medium text-white">Drop your CV here or browse</span>
                    <span className="text-xs text-white/45">PDF or Word · max 2 MB</span>
                  </button>
                )}
              </div>

              <Field label="Background summary" htmlFor="resume">
                <Textarea
                  id="resume"
                  value={resumeNote}
                  onChange={(e) => setResumeNote(e.target.value)}
                  rows={3}
                  placeholder="Years of experience, stack, notable wins…"
                  required
                  className={cn(fieldClass, "min-h-24")}
                />
              </Field>

              <Field label="Relevant experience for this role" htmlFor="experience">
                <Textarea
                  id="experience"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  rows={3}
                  required
                  className={cn(fieldClass, "min-h-24")}
                  placeholder="What have you built or owned that maps to this role?"
                />
              </Field>

              <Field label="Why do you want this role?" htmlFor="motivation">
                <Textarea
                  id="motivation"
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  rows={3}
                  required
                  className={cn(fieldClass, "min-h-24")}
                  placeholder="What draws you to this team and problem space?"
                />
              </Field>

              {error ? (
                <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                loading={busy}
                className="h-10 w-full bg-white text-zinc-950 hover:bg-white/90"
              >
                {busy ? "Submitting…" : "Submit application"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </Shell>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-white/80">
        {label}
      </Label>
      {children}
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/10 bg-[#12171f]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md sm:p-7",
        className
      )}
    >
      {children}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#07090c] text-white">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,_rgba(56,140,210,0.22),_transparent_60%)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">{children}</div>
    </div>
  )
}
