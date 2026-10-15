"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Mail, ShieldAlert, Sparkles } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { logClassificationApi, type ClassifiedLog } from "@/lib/auth-api"

const SAMPLE = `ModernCRM|IP 192.168.133.114 blocked due to potential attack
BillingSystem|User 12345 logged in.
ModernHR|Admin access escalation detected for user 9429
LegacyCRM|Case escalation for ticket ID 7324 failed because the assigned support agent is no longer active.
AnalyticsEngine|Backup completed successfully.`

function parseLines(raw: string): Array<{ source: string; log_message: string }> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.includes("|") ? "|" : line.includes("\t") ? "\t" : null
      if (!sep) return { source: "CompanyOS", log_message: line }
      const idx = line.indexOf(sep)
      return { source: line.slice(0, idx).trim() || "CompanyOS", log_message: line.slice(idx + 1).trim() }
    })
    .filter((row) => row.log_message)
}

export default function LogClassificationPage() {
  const [raw, setRaw] = useState(SAMPLE)
  const [alert, setAlert] = useState(true)
  const [createTickets, setCreateTickets] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [results, setResults] = useState<ClassifiedLog[]>([])
  const [issues, setIssues] = useState(0)
  const [ticketCount, setTicketCount] = useState(0)
  const [digest, setDigest] = useState<ClassifiedLog["alert"] | null>(null)
  const [status, setStatus] = useState<{
    brevo_configured: boolean
    alert_to: string
    issue_labels: string[]
    bert: { available: boolean; model_present: boolean }
  } | null>(null)

  useEffect(() => {
    void logClassificationApi.status().then(setStatus).catch(() => setStatus(null))
  }, [])

  async function run() {
    const logs = parseLines(raw)
    if (!logs.length) return setError("Add at least one log line (source|message).")
    setBusy(true)
    setError("")
    try {
      const res = await logClassificationApi.classify(logs, alert, createTickets)
      setResults(res.results)
      setIssues(res.issues)
      setTicketCount(res.tickets?.length ?? 0)
      setDigest(res.alert ?? res.results.find((row) => row.alert)?.alert ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classification failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DashboardHeader title="Log classification" parent="AI & automation" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl space-y-1">
            <p className="text-sm text-muted-foreground">
              Hybrid pipeline: regex → BERT embeddings → LLM. Issue labels email{" "}
              <span className="font-medium text-foreground">
                {status?.alert_to ?? "ghulammujtaba.dro@gmail.com"}
              </span>{" "}
              via Brevo.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant={status?.bert.available ? "secondary" : "outline"}>
                <Sparkles data-icon="inline-start" />
                BERT {status?.bert.available ? "ready" : status?.bert.model_present ? "deps missing" : "model missing"}
              </Badge>
              <Badge variant={status?.brevo_configured ? "secondary" : "outline"}>
                <Mail data-icon="inline-start" />
                Brevo {status?.brevo_configured ? "configured" : "not configured"}
              </Badge>
              {(status?.issue_labels ?? ["Security Alert", "Workflow Error", "Critical Error", "HTTP Status"]).map(
                (label) => (
                  <Badge key={label} variant="outline">
                    <ShieldAlert data-icon="inline-start" />
                    {label}
                  </Badge>
                )
              )}
            </div>
          </div>
          <Button loading={busy} onClick={() => void run()}>
            {busy ? "Classifying…" : "Classify logs"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={alert}
              onChange={(e) => setAlert(e.target.checked)}
            />
            Email Brevo alerts for issue labels
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={createTickets}
              onChange={(e) => setCreateTickets(e.target.checked)}
            />
            Create AI support tickets for issues
          </label>
        </div>

        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="min-h-40 font-mono text-xs"
          placeholder="source|log message (one per line)"
        />
        {error ? (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" />
            {error}
          </p>
        ) : null}

        {results.length ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {results.length} classified · {issues} issue{issues === 1 ? "" : "s"}
              {ticketCount
                ? ` · ${ticketCount} ticket${ticketCount === 1 ? "" : "s"} created`
                : ""}
              {digest?.sent
                ? ` · digest emailed to ${digest.to ?? status?.alert_to ?? "inbox"}`
                : digest?.reason === "brevo_not_configured"
                  ? " · Brevo not configured"
                  : digest && !digest.skipped && digest.reason
                    ? ` · alert: ${digest.reason}`
                    : ""}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Ticket</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row, index) => (
                    <TableRow key={`${row.source}-${index}`}>
                      <TableCell className="whitespace-nowrap font-medium">{row.source}</TableCell>
                      <TableCell className="max-w-md text-sm text-muted-foreground">{row.log_message}</TableCell>
                      <TableCell>
                        <Badge variant={row.is_issue ? "destructive" : "secondary"}>{row.target_label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.method}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.ticket?.ticket_key ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
