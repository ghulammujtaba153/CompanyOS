"use client"

import { useEffect, useMemo, useState } from "react"
import { Sparkles } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { KeyedSelect } from "@/components/dashboard/form-controls"
import { useProjectWorkspace } from "@/components/dashboard/project-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { aiApi, type AiProviderInfo } from "@/lib/auth-api"
import { draftIssueFromBrief, standupSummary, triageBacklog, type IssueDraft, type TriageSuggestion } from "@/lib/work-ai"

export default function WorkCopilotPage() {
  const { projects, issues, createIssue } = useProjectWorkspace()
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [brief, setBrief] = useState(
    "Subject: Portal login errors\n\nHi team — several Northwind managers cannot open the client portal after the Friday deploy. Urgent — blocking their inventory review. Can you investigate today?"
  )
  const [draft, setDraft] = useState<IssueDraft | null>(null)
  const [standup, setStandup] = useState("")
  const [triage, setTriage] = useState<TriageSuggestion[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [providers, setProviders] = useState<AiProviderInfo[]>([])
  const [provider, setProvider] = useState("auto")
  const [busy, setBusy] = useState<string | null>(null)
  const project = projects[0]

  const assignees = useMemo(
    () =>
      Array.from(
        new Set(issues.map((issue) => issue.assignee).filter((name) => name && name !== "Unassigned"))
      ),
    [issues]
  )

  const localTriage = useMemo(
    () => triageBacklog(project ? issues.filter((i) => i.projectId === project.id) : issues, assignees),
    [issues, project, assignees]
  )

  useEffect(() => {
    setTriage(localTriage)
  }, [localTriage])

  useEffect(() => {
    if (!useApi) return
    void aiApi
      .providers()
      .then((res) => {
        setProviders(res.providers)
        if (res.defaultProvider) setProvider(res.defaultProvider)
      })
      .catch(() => undefined)
  }, [useApi])

  async function generateDraft() {
    setNotice(null)
    if (useApi && activeOrgId) {
      setBusy("draft")
      try {
        const result = await aiApi.workDraft(activeOrgId, {
          kind: "issue",
          prompt: brief,
          projectId: project?.id ?? "",
          projectName: project?.name ?? "",
          provider: provider === "auto" ? undefined : provider,
        })
        setDraft({
          title: result.title || "Untitled issue",
          description: result.description || "",
          type: (result.type as IssueDraft["type"]) || "Task",
          priority: (result.priority as IssueDraft["priority"]) || "Medium",
          labels: result.labels || [],
          estimate: result.estimate || "",
          rationale:
            result.rationale ||
            (result.provider ? `Drafted via ${result.provider}/${result.model}` : "Local draft"),
        })
      } catch {
        setDraft(draftIssueFromBrief(brief))
        setNotice("LLM unavailable — used local heuristic draft.")
      } finally {
        setBusy(null)
      }
      return
    }
    setDraft(draftIssueFromBrief(brief))
  }

  async function applyDraft() {
    if (!draft || !project) {
      setNotice("No project available to attach the issue.")
      return
    }
    const created = await createIssue(project.id, {
      title: draft.title,
      description: draft.description,
      priority: draft.priority,
      type: draft.type,
      labels: draft.labels,
      estimate: draft.estimate,
    })
    setNotice(
      created
        ? `Created ${created.id} on ${project.key} (from AI draft).`
        : "Could not create issue — check project membership."
    )
  }

  async function generateStandup() {
    if (!project) {
      setStandup("No projects in workspace.")
      return
    }
    const related = issues.filter((issue) => issue.projectId === project.id)
    if (useApi && activeOrgId) {
      setBusy("standup")
      try {
        const result = await aiApi.workDraft(activeOrgId, {
          kind: "standup",
          projectId: project.id,
          projectName: project.name,
          issues: related.map((issue) => ({
            title: issue.title,
            status: issue.status,
            assignee: issue.assignee,
          })),
          provider: provider === "auto" ? undefined : provider,
        })
        setStandup(result.body || standupSummary(project, related))
      } catch {
        setStandup(standupSummary(project, related))
      } finally {
        setBusy(null)
      }
      return
    }
    setStandup(standupSummary(project, related))
  }

  async function generateTriage() {
    const scoped = project ? issues.filter((i) => i.projectId === project.id) : issues
    if (useApi && activeOrgId) {
      setBusy("triage")
      try {
        const result = await aiApi.workDraft(activeOrgId, {
          kind: "triage",
          projectId: project?.id ?? "",
          projectName: project?.name ?? "",
          issues: scoped.map((issue) => ({
            id: issue.id,
            title: issue.title,
            status: issue.status,
            priority: issue.priority,
            assignee: issue.assignee,
            dueDate: issue.dueDate,
            type: issue.type,
          })),
          assignees,
          provider: provider === "auto" ? undefined : provider,
        })
        if (result.suggestions?.length) {
          setTriage(
            result.suggestions.map((item) => ({
              issueId: String(item.issueId ?? item.id ?? ""),
              title: String(item.title ?? ""),
              suggestedPriority: (item.suggestedPriority as TriageSuggestion["suggestedPriority"]) || "Medium",
              suggestedAssignee: String(item.suggestedAssignee ?? "Unassigned"),
              suggestedDue: String(item.suggestedDue ?? ""),
              rationale: String(item.rationale ?? ""),
            }))
          )
        } else {
          setTriage(localTriage)
        }
      } catch {
        setTriage(localTriage)
      } finally {
        setBusy(null)
      }
      return
    }
    setTriage(localTriage)
  }

  return (
    <>
      <DashboardHeader title="AI copilot" parent="Work Management" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Sparkles className="size-5" />
              Work AI copilot
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Draft issues from client briefs, triage the backlog, and generate standup narratives via OpenAI or Gemini.
            </p>
          </div>
          {useApi ? (
            <KeyedSelect
              value={provider}
              onChange={setProvider}
              className="w-48"
              options={[
                ["auto", "Auto (default)"],
                ...providers.map(
                  (item) =>
                    [
                      item.id,
                      item.configured
                        ? `${item.label} · ${item.model}`
                        : `${item.label} (not configured)`,
                    ] as const
                ),
              ]}
            />
          ) : null}
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm">
            {notice}
          </div>
        ) : null}

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">Issue draft from brief</h2>
          <p className="text-sm text-muted-foreground">Paste a client email — GenAI proposes title, type, priority.</p>
          <Textarea
            className="mt-3 min-h-32"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button loading={busy === "draft"} onClick={() => void generateDraft()}>
              {busy === "draft" ? "Generating…" : "Generate draft"}
            </Button>
            <Button variant="outline" disabled={!draft} onClick={() => void applyDraft()}>
              Create on {project?.key ?? "project"}
            </Button>
          </div>
          {draft ? (
            <div className="mt-4 space-y-2 rounded-xl border bg-muted/20 p-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>{draft.type}</Badge>
                <Badge variant="outline">{draft.priority}</Badge>
                {draft.labels.map((label) => (
                  <Badge key={label} variant="secondary">
                    {label}
                  </Badge>
                ))}
              </div>
              <p className="text-lg font-semibold">{draft.title}</p>
              <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{draft.description}</pre>
              <p className="text-xs text-muted-foreground">Estimate {draft.estimate} · {draft.rationale}</p>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Backlog triage</h2>
              <p className="text-sm text-muted-foreground">
                Suggestions for {project?.name ?? "open issues"}.
              </p>
            </div>
            <Button size="sm" variant="outline" loading={busy === "triage"} onClick={() => void generateTriage()}>
              {busy === "triage" ? "Triaging…" : "Refresh triage"}
            </Button>
          </div>
          <ul className="mt-4 divide-y text-sm">
            {triage.map((item) => (
              <li key={item.issueId} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    <span className="font-mono text-xs text-muted-foreground">{item.issueId}</span>{" "}
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.rationale}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{item.suggestedPriority}</Badge>
                  <Badge variant="secondary">{item.suggestedAssignee}</Badge>
                  <Badge variant="outline">due {item.suggestedDue}</Badge>
                </div>
              </li>
            ))}
            {!triage.length ? (
              <li className="py-6 text-center text-muted-foreground">No open issues to triage.</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Standup summary</h2>
              <p className="text-sm text-muted-foreground">Narrative for the active project</p>
            </div>
            <Button size="sm" variant="outline" loading={busy === "standup"} onClick={() => void generateStandup()}>
              {busy === "standup" ? "Generating…" : "Generate"}
            </Button>
          </div>
          {standup ? (
            <pre className="mt-4 whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 font-sans text-sm leading-relaxed">
              {standup}
            </pre>
          ) : null}
        </section>
      </div>
    </>
  )
}
