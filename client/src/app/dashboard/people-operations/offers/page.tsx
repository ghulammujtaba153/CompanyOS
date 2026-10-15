"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, ExternalLink, Plus } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field } from "@/components/dashboard/form-controls"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { peopleOpsApi, type ApiJobOffer } from "@/lib/auth-api"
import {
  formatOfferMoney,
  seedOffers,
  type JobOffer,
  type OfferStatus,
} from "@/lib/offers"
import { useClientPagination } from "@/lib/use-client-pagination"
import { cn } from "@/lib/utils"
import { TablePageSkeleton } from "@/components/dashboard/page-skeletons"

const statusTone: Record<OfferStatus, string> = {
  Draft: "border-muted-foreground/30",
  Sent: "border-sky-500/30 text-sky-700 dark:text-sky-400",
  Viewed: "border-violet-500/30 text-violet-700 dark:text-violet-400",
  Signed: "border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  Declined: "border-destructive/30 text-destructive",
  Expired: "border-amber-500/30 text-amber-700 dark:text-amber-400",
}

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

export default function OffersPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [offers, setOffers] = useState<JobOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [preview, setPreview] = useState<JobOffer | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setOffers(seedOffers)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await peopleOpsApi.listOffers(activeOrgId)
      setOffers(rows.map(mapOffer))
    } catch {
      setOffers([])
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    return {
      open: offers.filter((o) => o.status === "Draft" || o.status === "Sent" || o.status === "Viewed").length,
      signed: offers.filter((o) => o.status === "Signed").length,
    }
  }, [offers])

  const pagination = useClientPagination(offers, { pageSize: 10, resetKey: offers.length })

  async function sendOffer(id: string) {
    if (busy) return
    setBusy(`send:${id}`)
    try {
      if (useApi) {
        try {
          const row = await peopleOpsApi.updateOffer(id, { status: "Sent" })
          setOffers((current) => current.map((offer) => (offer.id === id ? mapOffer(row) : offer)))
          setNotice("Offer marked Sent.")
          return
        } catch {
          setNotice("Could not update offer.")
          return
        }
      }
      setOffers((current) =>
        current.map((offer) => (offer.id === id ? { ...offer, status: "Sent" as const } : offer))
      )
      setNotice("Offer marked Sent.")
    } finally {
      setBusy(null)
    }
  }

  async function copySignLink(token: string, offerId: string) {
    if (busy) return
    setBusy(`copy:${offerId}`)
    try {
      const url = `${window.location.origin}/offer/sign/${token}`
      await navigator.clipboard.writeText(url)
      setNotice("E-sign link copied.")
    } catch {
      setNotice("Could not copy link.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <DashboardHeader title="Offers" parent="People Operations" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Offers</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Draft compensation packages, send for e-sign, and track signatures.
            </p>
          </div>
          <Button size="sm" onClick={() => setComposerOpen(true)}>
            <Plus data-icon="inline-start" />
            New offer
          </Button>
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm">{notice}</div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Active offers</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.open}</p>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Signed</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.signed}</p>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{offers.length}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <TablePageSkeleton rows={6} columns={5} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Comp</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((offer) => (
                    <TableRow key={offer.id}>
                      <TableCell>
                        <p className="font-medium">{offer.candidateName}</p>
                        <p className="text-xs text-muted-foreground">{offer.candidateEmail}</p>
                      </TableCell>
                      <TableCell>{offer.jobTitle}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatOfferMoney(offer.salary, offer.currency)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{offer.startDate}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(statusTone[offer.status])}>
                          {offer.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => setPreview(offer)}>
                            Preview
                          </Button>
                          {offer.status === "Draft" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={busy === `send:${offer.id}`}
                              onClick={() => void sendOffer(offer.id)}
                            >
                              Send
                            </Button>
                          ) : null}
                          {offer.status !== "Draft" ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={busy === `copy:${offer.id}`}
                                onClick={() => void copySignLink(offer.signToken, offer.id)}
                              >
                                <Copy data-icon="inline-start" />
                                Link
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                render={<Link href={`/offer/sign/${offer.signToken}`} target="_blank" />}
                              >
                                <ExternalLink data-icon="inline-start" />
                                Sign
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={pagination.page}
                pageCount={pagination.pageCount}
                total={pagination.total}
                from={pagination.from}
                to={pagination.to}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </>
          )}
        </div>
      </div>

      <OfferComposer
        open={composerOpen}
        useApi={useApi}
        organizationId={activeOrgId}
        onClose={() => setComposerOpen(false)}
        onCreate={(offer) => {
          setOffers((current) => [offer, ...current])
          setComposerOpen(false)
          setNotice("Draft offer created.")
        }}
      />

      {preview ? (
        <Dialog open onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Offer preview · {preview.candidateName}</DialogTitle>
            </DialogHeader>
            <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-relaxed">
              <p className="font-semibold">Offer of employment</p>
              <p className="mt-3 text-muted-foreground">
                We are pleased to offer you the role of <strong className="text-foreground">{preview.jobTitle}</strong>{" "}
                with a base salary of{" "}
                <strong className="text-foreground">
                  {formatOfferMoney(preview.salary, preview.currency)}
                </strong>
                . Equity: {preview.equityNote}. Proposed start date: {preview.startDate}. This offer expires on{" "}
                {preview.expiresOn}.
              </p>
              {preview.signedName ? (
                <p className="mt-4 text-xs text-emerald-700 dark:text-emerald-400">
                  Signed by {preview.signedName} · {preview.signedAt}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}

function OfferComposer({
  open,
  useApi,
  organizationId,
  onClose,
  onCreate,
}: {
  open: boolean
  useApi: boolean
  organizationId: string | null
  onClose: () => void
  onCreate: (offer: JobOffer) => void
}) {
  const [candidateName, setCandidateName] = useState("")
  const [candidateEmail, setCandidateEmail] = useState("")
  const [jobTitle, setJobTitle] = useState("Senior Backend Engineer")
  const [salary, setSalary] = useState("145000")
  const [equityNote, setEquityNote] = useState("0.15% options over 4 years")
  const [startDate, setStartDate] = useState("2026-11-17")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      if (useApi && organizationId) {
        const row = await peopleOpsApi.createOffer(organizationId, {
          candidateName: candidateName.trim(),
          candidateEmail: candidateEmail.trim(),
          jobTitle,
          salary: Number(salary) || 0,
          currency: "USD",
          equityNote,
          startDate,
          expiresOn: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          status: "Draft",
        })
        onCreate(mapOffer(row))
      } else {
        const id = `off-${Date.now()}`
        onCreate({
          id,
          candidateId: `cand-new-${Date.now()}`,
          candidateName: candidateName.trim(),
          candidateEmail: candidateEmail.trim(),
          jobId: "job-backend",
          jobTitle,
          salary: Number(salary) || 0,
          currency: "USD",
          equityNote,
          startDate,
          expiresOn: "2026-10-28",
          status: "Draft",
          signToken: `demo-offer-${id}`,
          createdAt: new Date().toISOString().slice(0, 10),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create offer.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compose offer</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          <Field label="Candidate name">
            <Input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={candidateEmail} onChange={(e) => setCandidateEmail(e.target.value)} required />
          </Field>
          <Field label="Job title">
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required />
          </Field>
          <Field label="Base salary (USD)">
            <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} required />
          </Field>
          <Field label="Equity / notes">
            <Textarea value={equityNote} onChange={(e) => setEquityNote(e.target.value)} rows={2} />
          </Field>
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? "Saving…" : "Save draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
