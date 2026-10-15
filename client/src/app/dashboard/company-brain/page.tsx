"use client"

import { useCallback, useEffect, useState } from "react"
import { BookOpen, Sparkles } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { KeyedSelect } from "@/components/dashboard/form-controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  aiApi,
  documentsApi,
  type AiProviderInfo,
  type ApiVaultDocument,
} from "@/lib/auth-api"
import { askCompanyBrain, searchKnowledge, type BrainAnswer } from "@/lib/company-brain"
import {
  seedDocuments,
  type DocumentCategory,
  type VaultDocument,
} from "@/lib/documents"

const examples = [
  "How many PTO days do employees get?",
  "What is our 401(k) match?",
  "Summarize the Northwind MSA",
  "How does NDA confidentiality work?",
]

function mapDoc(row: ApiVaultDocument): VaultDocument {
  return {
    id: row.id,
    name: row.name,
    category: row.category as DocumentCategory,
    ownerName: row.ownerName,
    sizeLabel: row.sizeLabel,
    uploadedAt: row.uploadedAt,
    sharedWith: row.sharedWith,
    status: row.status as VaultDocument["status"],
    body: row.body,
    fileUrl: row.fileUrl || undefined,
  }
}

export default function CompanyBrainPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [corpus, setCorpus] = useState<VaultDocument[]>(seedDocuments)
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState<BrainAnswer | null>(null)
  const [hitsPreview, setHitsPreview] = useState<ReturnType<typeof searchKnowledge>>([])
  const [providers, setProviders] = useState<AiProviderInfo[]>([])
  const [provider, setProvider] = useState<string>("auto")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vectorReady, setVectorReady] = useState(false)
  const [reindexNotice, setReindexNotice] = useState<string | null>(null)

  const loadCorpus = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setCorpus(seedDocuments)
      return
    }
    try {
      const rows = await documentsApi.list(activeOrgId)
      const mapped = rows.map(mapDoc).filter((doc) => doc.status !== "Archived")
      setCorpus(mapped.length ? mapped : seedDocuments)
    } catch {
      setCorpus(seedDocuments)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void loadCorpus()
  }, [loadCorpus])

  useEffect(() => {
    if (!useApi) return
    void aiApi
      .providers()
      .then((res) => {
        setProviders(res.providers)
        if (res.defaultProvider) setProvider(res.defaultProvider)
      })
      .catch(() => undefined)
    void aiApi
      .vectorsStatus()
      .then((res) => setVectorReady(Boolean(res.ready)))
      .catch(() => setVectorReady(false))
  }, [useApi])

  async function reindexVectors() {
    if (!useApi || !activeOrgId) return
    setBusy(true)
    setReindexNotice(null)
    try {
      const result = await aiApi.vectorsReindex(activeOrgId)
      setReindexNotice(`Indexed ${result.indexed} of ${result.total} documents into Pinecone.`)
      setVectorReady(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reindex failed")
    } finally {
      setBusy(false)
    }
  }

  async function ask(q?: string) {
    const next = (q ?? question).trim()
    if (!next) return
    setQuestion(next)
    setHitsPreview(searchKnowledge(next, 4, corpus))
    setError(null)

    if (useApi && activeOrgId) {
      setBusy(true)
      try {
        const result = await aiApi.brainAsk(activeOrgId, {
          question: next,
          top_k: 4,
          provider: provider === "auto" ? undefined : provider,
        })
        setAnswer({
          answer: result.answer,
          citations: result.citations,
          confidence: (result.confidence as BrainAnswer["confidence"]) || "medium",
          mode: (result.mode as BrainAnswer["mode"]) || "rag-local",
          provider: result.provider,
          model: result.model,
          retrieval: result.retrieval,
          traceId: result.traceId,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ask failed")
        setAnswer(askCompanyBrain(next, corpus))
      } finally {
        setBusy(false)
      }
      return
    }

    setAnswer(askCompanyBrain(next, corpus))
  }

  return (
    <>
      <DashboardHeader title="Company Brain" parent="AI & automation" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Company Brain</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Answers grounded in the Documents vault via Pinecone vectors when configured; OpenAI or Gemini for synthesis.
            </p>
            {useApi ? (
              <Badge variant="outline">{vectorReady ? "Pinecone ready" : "Keyword fallback"}</Badge>
            ) : null}
            {useApi ? (
              <Button size="sm" variant="outline" loading={busy} onClick={() => void reindexVectors()}>
                Reindex vault
              </Button>
            ) : null}
          </div>
          {reindexNotice ? <p className="mt-2 text-sm text-muted-foreground">{reindexNotice}</p> : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4" />
                Ask with citations
              </CardTitle>
              <CardDescription>
                Retrieval over handbook, PTO, benefits, contracts, and more — then an LLM synthesis when a provider key is set.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {useApi ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Provider</span>
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
                </div>
              ) : null}
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="How does our employee onboarding / PTO policy work?"
                className="min-h-28"
              />
              <div className="flex flex-wrap gap-2">
                {examples.map((example) => (
                  <Button key={example} size="sm" variant="outline" onClick={() => void ask(example)}>
                    {example}
                  </Button>
                ))}
              </div>
              <Button loading={busy} onClick={() => void ask()}>
                {busy ? "Thinking…" : "Ask Company Brain"}
              </Button>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              {answer ? (
                <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm leading-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{answer.confidence} confidence</Badge>
                    <span className="text-xs text-muted-foreground">{answer.mode}</span>
                    {answer.retrieval ? (
                      <span className="text-xs text-muted-foreground">· {answer.retrieval}</span>
                    ) : null}
                    {answer.provider ? (
                      <span className="text-xs text-muted-foreground">
                        · {answer.provider}
                        {answer.model ? `/${answer.model}` : ""}
                      </span>
                    ) : null}
                    {answer.traceId ? (
                      <span className="text-xs text-muted-foreground">· trace {answer.traceId}</span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">· {corpus.length} docs in corpus</span>
                  </div>
                  <p className="whitespace-pre-wrap">{answer.answer}</p>
                  {answer.citations.length ? (
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Citations</p>
                      <ul className="space-y-2">
                        {answer.citations.map((cite) => (
                          <li key={cite.docId} className="rounded-md border bg-background px-3 py-2">
                            <p className="font-medium">{cite.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{cite.excerpt}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="size-4" />
                Retrieved chunks
              </CardTitle>
              <CardDescription>Top matches from the vault for your last question.</CardDescription>
            </CardHeader>
            <CardContent>
              {hitsPreview.length ? (
                <ul className="space-y-3 text-sm">
                  {hitsPreview.map((hit) => (
                    <li key={hit.docId} className="rounded-lg border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{hit.title}</p>
                        <Badge variant="outline">{hit.score}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{hit.snippet}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ask a question to see retrieval hits.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
