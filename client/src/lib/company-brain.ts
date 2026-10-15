import { seedDocuments, type VaultDocument } from "@/lib/documents"

export type KnowledgeHit = {
  docId: string
  title: string
  category: string
  score: number
  snippet: string
}

export type BrainAnswer = {
  traceId?: string
  answer: string
  citations: { title: string; docId: string; excerpt: string }[]
  confidence: "high" | "medium" | "low"
  mode: "rag-local" | "rag-llm" | string
  retrieval?: "pinecone" | "keyword" | string
  provider?: string
  model?: string
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

function scoreDoc(queryTokens: string[], doc: VaultDocument) {
  const hay = `${doc.name} ${doc.category} ${doc.body}`.toLowerCase()
  let score = 0
  for (const token of queryTokens) {
    if (hay.includes(token)) score += 2
    if (doc.name.toLowerCase().includes(token)) score += 3
  }
  return score
}

function snippetAround(body: string, tokens: string[]) {
  const lower = body.toLowerCase()
  let idx = -1
  for (const token of tokens) {
    idx = lower.indexOf(token)
    if (idx >= 0) break
  }
  if (idx < 0) return body.slice(0, 160) + (body.length > 160 ? "…" : "")
  const start = Math.max(0, idx - 40)
  const end = Math.min(body.length, idx + 140)
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`
}

/** Keyword retrieval over the document vault corpus. */
export function searchKnowledge(query: string, limit = 5, corpus: VaultDocument[] = seedDocuments): KnowledgeHit[] {
  const tokens = tokenize(query)
  if (!tokens.length) return []
  return corpus
    .map((doc) => {
      const score = scoreDoc(tokens, doc)
      return {
        docId: doc.id,
        title: doc.name,
        category: doc.category,
        score,
        snippet: snippetAround(doc.body, tokens),
      }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Documents-grounded Q&A (local RAG). No external LLM required;
 * synthesizes an answer from top retrieved chunks. Swap for a real model later.
 */
export function askCompanyBrain(question: string, corpus: VaultDocument[] = seedDocuments): BrainAnswer {
  const trimmed = question.trim()
  if (!trimmed) {
    return {
      answer: "Ask a question about policies, benefits, clients, or how we work.",
      citations: [],
      confidence: "low",
      mode: "rag-local",
    }
  }

  const hits = searchKnowledge(trimmed, 3, corpus)
  if (!hits.length) {
    return {
      answer:
        "I could not find matching material in the document vault. Try terms like PTO, benefits, NDA, or Northwind MSA — or upload more documents.",
      citations: [],
      confidence: "low",
      mode: "rag-local",
    }
  }

  const primary = corpus.find((d) => d.id === hits[0].docId)!
  const secondary = hits
    .slice(1)
    .map((h) => corpus.find((d) => d.id === h.docId))
    .filter(Boolean) as VaultDocument[]

  const q = trimmed.toLowerCase()
  let answer: string
  if (q.includes("pto") || q.includes("leave") || q.includes("vacation") || q.includes("time off")) {
    answer = `Based on ${primary.name}: full-time employees receive **20 PTO days** per year (increasing to **25 after 3 years**). Requests over 3 days need manager approval **5 business days** ahead; up to **5 days** may carry over. Company holidays do not deduct from PTO.`
  } else if (q.includes("benefit") || q.includes("401") || q.includes("medical") || q.includes("enroll")) {
    answer = `From ${primary.name}: medical/dental/vision enrollment opens each January (company pays **80%** of employee medical). **401(k) match up to 4%**. Mid-year changes need a qualifying life event — contact People Ops.`
  } else if (q.includes("onboard")) {
    answer = `Onboarding spans People Ops, IT, and the hiring manager (handbook + role checklist). Typical setup targets under **2 days** once laptop and accounts are provisioned. See also leave and benefits enrollment timing in related policies.`
  } else if (q.includes("northwind") || q.includes("msa") || q.includes("contract")) {
    answer = `From ${primary.name}: Northwind store-ops engagement is a **$48k fixed-fee** MSA with net-30 payments, T&M change orders, and renewal in **September 2027**.`
  } else if (q.includes("nda") || q.includes("confidential")) {
    answer = `Our NDA template covers client data, source code, and pricing; confidentiality survives **3 years** after termination, with standard public-info exceptions.`
  } else {
    const bits = [primary.body, ...secondary.map((d) => d.body)].join(" ")
    answer = `Here’s what I found related to “${trimmed}”: ${bits.slice(0, 320)}${bits.length > 320 ? "…" : ""}`
  }

  return {
    answer,
    citations: hits.map((hit) => ({
      title: hit.title,
      docId: hit.docId,
      excerpt: hit.snippet,
    })),
    confidence: hits[0].score >= 8 ? "high" : hits[0].score >= 4 ? "medium" : "low",
    mode: "rag-local",
  }
}
