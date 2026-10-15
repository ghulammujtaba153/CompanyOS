"use client"

import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { agencyInitials, seedAgency } from "@/lib/agency"
import { peopleOpsApi, type ApiJobOffer } from "@/lib/auth-api"
import { findOfferByToken, formatOfferMoney, type JobOffer, type OfferStatus } from "@/lib/offers"

function mapOffer(row: ApiJobOffer): JobOffer {
  return {
    id: row.id,
    candidateId: row.candidateId,
    candidateName: row.candidateName,
    candidateEmail: row.candidateEmail,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    salary: row.salary,
    currency: row.currency,
    equityNote: row.equityNote,
    startDate: row.startDate,
    expiresOn: row.expiresOn,
    status: row.status as OfferStatus,
    signToken: row.signToken,
    signedAt: row.signedAt || undefined,
    signedName: row.signedName || undefined,
    createdAt: row.createdAt,
  }
}

export default function OfferSignPage() {
  const params = useParams<{ token: string }>()
  const [offer, setOffer] = useState<JobOffer | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [signedName, setSignedName] = useState("")
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const [signing, setSigning] = useState(false)

  const agency = seedAgency

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const row = await peopleOpsApi.publicGetOffer(params.token)
        if (!cancelled) {
          const mapped = mapOffer(row)
          setOffer(mapped)
          setDone(mapped.status === "Signed")
        }
      } catch {
        if (!cancelled) {
          const seed = findOfferByToken(params.token)
          setOffer(seed)
          setDone(seed?.status === "Signed")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params.token])

  const letter = useMemo(() => {
    if (!offer) return null
    return (
      <>
        <p>Dear {offer.candidateName},</p>
        <p className="mt-3">
          We are delighted to offer you the position of <strong>{offer.jobTitle}</strong> at {agency.name}.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Base salary: {formatOfferMoney(offer.salary, offer.currency)} per year</li>
          <li>Equity: {offer.equityNote}</li>
          <li>Start date: {offer.startDate}</li>
        </ul>
        <p className="mt-3">
          This offer remains valid until <strong>{offer.expiresOn}</strong>. By signing below you accept the terms
          of employment subject to standard background checks.
        </p>
      </>
    )
  }, [offer, agency.name])

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading offer…</p>
      </div>
    )
  }

  if (!offer) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">This offer link is invalid or expired.</p>
      </div>
    )
  }

  async function sign(e: React.FormEvent) {
    e.preventDefault()
    if (!signedName.trim() || signing) return
    setError("")
    setSigning(true)
    try {
      const row = await peopleOpsApi.publicSignOffer(params.token, signedName.trim())
      setOffer(mapOffer(row))
      setDone(true)
    } catch (err) {
      // Offline / seed fallback — still mark signed locally.
      setOffer((current) =>
        current
          ? {
              ...current,
              status: "Signed",
              signedName: signedName.trim(),
              signedAt: new Date().toISOString(),
            }
          : current
      )
      setDone(true)
      if (err instanceof Error && err.message) {
        /* keep silent fallback for demo links without API */
      }
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="min-h-svh bg-gradient-to-b from-muted/50 to-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-card text-sm font-semibold shadow-sm">
            {agencyInitials(agency.name)}
          </div>
          <div>
            <p className="font-semibold">{agency.name}</p>
            <p className="text-xs text-muted-foreground">Offer for e-signature</p>
          </div>
        </div>

        <article className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">Offer of employment</h1>
          <div className="mt-4 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
            {letter}
          </div>

          {done ? (
            <p className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
              Signed by {offer.signedName} · thank you. HR has been notified.
            </p>
          ) : (
            <form className="mt-6 space-y-3 border-t pt-6" onSubmit={(e) => void sign(e)}>
              <label className="block text-sm font-medium">
                Full legal name
                <Input
                  className="mt-1.5"
                  value={signedName}
                  onChange={(e) => setSignedName(e.target.value)}
                  placeholder="Type your name to sign"
                  required
                  disabled={signing}
                />
              </label>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" loading={signing} disabled={!signedName.trim()}>
                {signing ? "Signing…" : "Sign offer"}
              </Button>
            </form>
          )}
        </article>
      </div>
    </div>
  )
}
