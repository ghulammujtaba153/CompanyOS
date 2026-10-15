"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Cable, Play, Shield } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { useApprovals } from "@/components/dashboard/approvals-store"
import { useGovernance } from "@/components/dashboard/governance-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { aiApi } from "@/lib/auth-api"
import { invokeMcpTool } from "@/lib/mcp-gateway"
import { mcpTools, type McpToolDef } from "@/lib/mcp-tools"
import { cn } from "@/lib/utils"

export default function McpToolsPage() {
  const { passports, rules, defaultAutonomy } = useGovernance()
  const { submit } = useApprovals()
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [toolName, setToolName] = useState(mcpTools[0]?.name ?? "create_issue")
  const tool = useMemo(() => mcpTools.find((t) => t.name === toolName) ?? mcpTools[0], [toolName])
  const [argsJson, setArgsJson] = useState(() => JSON.stringify(mcpTools[0]?.exampleArgs ?? {}, null, 2))
  const [passportId, setPassportId] = useState(mcpTools[0]?.defaultPassportId ?? "pp-delivery")
  const [log, setLog] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function selectTool(next: McpToolDef) {
    setToolName(next.name)
    setArgsJson(JSON.stringify(next.exampleArgs, null, 2))
    setPassportId(next.defaultPassportId)
    setLog(null)
    setError(null)
  }

  async function run() {
    setError(null)
    setLog(null)
    const passport = passports.find((p) => p.id === passportId)
    if (!passport || !tool) {
      setError("Select a valid agent passport.")
      return
    }
    let args: Record<string, unknown>
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>
    } catch {
      setError("Args must be valid JSON.")
      return
    }

    if (useApi && activeOrgId) {
      setBusy(true)
      try {
        const outcome = await aiApi.mcpInvoke(activeOrgId, {
          toolName: tool.name,
          args,
          passportId: passport.id,
        })
        const decision = outcome.decision as { outcome?: string; reasons?: string[]; approver?: string }
        if (decision.outcome === "Needs approval") {
          setLog(
            [
              `Decision: ${decision.outcome} → ${decision.approver ?? "approver"}`,
              ...(decision.reasons || []),
              outcome.approvalId ? `Queued approval ${outcome.approvalId}.` : outcome.result.message,
            ].join("\n")
          )
          return
        }
        setLog(
          [
            `Decision: ${decision.outcome ?? "unknown"}`,
            ...((decision.reasons as string[]) || []),
            outcome.result.message,
            outcome.result.data ? `Data: ${JSON.stringify(outcome.result.data, null, 2)}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invoke failed")
      } finally {
        setBusy(false)
      }
      return
    }

    const outcome = invokeMcpTool({
      toolName: tool.name,
      args,
      passport,
      rules,
      defaultAutonomy,
    })
    if ("error" in outcome) {
      setError(outcome.error)
      return
    }

    if (outcome.decision.outcome === "Needs approval") {
      const action = submit({
        passportId: passport.id,
        capabilityId: tool.capabilityId,
        title: `MCP · ${tool.name}`,
        detail: JSON.stringify(args),
        context: {
          amount: typeof args.salary === "number" ? args.salary : typeof args.amount === "number" ? args.amount : 0,
          external: tool.capabilityId === "offer.send",
          records: 1,
        },
      })
      setLog(
        [
          `Decision: ${outcome.decision.outcome} → ${outcome.decision.approver ?? "approver"}`,
          ...outcome.decision.reasons,
          action ? `Submitted approval ${action.id}.` : "Could not enqueue approval.",
          outcome.result.message,
        ].join("\n")
      )
      return
    }

    setLog(
      [
        `Decision: ${outcome.decision.outcome}`,
        ...outcome.decision.reasons,
        outcome.result.message,
        outcome.result.data ? `Data: ${JSON.stringify(outcome.result.data, null, 2)}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
  }

  return (
    <>
      <DashboardHeader title="MCP tools" parent="AI & automation" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight">MCP tool gateway</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Catalog of tools ChatGPT / Claude will call via MCP. Every mutating call runs through
              governance and Approvals when required.
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <Cable className="size-3" />
            {useApi ? "Live gateway" : "Demo gateway"}
          </Badge>
        </div>

        <div className="grid gap-4 xl:grid-cols-[16rem_1fr]">
          <ul className="space-y-1 rounded-2xl border bg-card p-2">
            {mcpTools.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={() => selectTool(item)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2 text-left text-sm",
                    tool?.name === item.name ? "bg-muted font-medium" : "hover:bg-muted/50"
                  )}
                >
                  <span className="font-mono text-xs">{item.name}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.kind}</span>
                </button>
              </li>
            ))}
          </ul>

          {tool ? (
            <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold font-mono text-sm">{tool.name}</h2>
                  <Badge variant="outline">{tool.kind}</Badge>
                  <Badge variant="secondary">{tool.capabilityId}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Agent passport</label>
                <select
                  className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
                  value={passportId}
                  onChange={(e) => setPassportId(e.target.value)}
                >
                  {passports.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.agent} ({p.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Arguments (JSON)</label>
                <Textarea
                  value={argsJson}
                  onChange={(e) => setArgsJson(e.target.value)}
                  className="min-h-40 font-mono text-xs"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button loading={busy} onClick={() => void run()}>
                  {busy ? null : <Play data-icon="inline-start" />}
                  {busy ? "Invoking…" : "Invoke via gateway"}
                </Button>
                <Button size="sm" variant="outline" render={<Link href="/dashboard/approvals" />}>
                  <Shield data-icon="inline-start" />
                  Open Approvals
                </Button>
              </div>

              {error ? (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {log ? (
                <pre className="overflow-x-auto rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {log}
                </pre>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </>
  )
}
