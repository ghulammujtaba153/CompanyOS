"""Lightweight RAG eval harness: golden questions + retrieval/faithfulness checks."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.services import llama_retrieval, llm

# Default golden set — org-agnostic patterns; retrieval quality still depends on indexed docs.
DEFAULT_GOLDEN: list[dict[str, Any]] = [
    {
        "id": "g1",
        "question": "How many PTO days do employees get?",
        "must_include_any": ["pto", "leave", "vacation", "days"],
        "expect_citation": True,
    },
    {
        "id": "g2",
        "question": "What does the NDA cover?",
        "must_include_any": ["confidential", "nda", "disclosure"],
        "expect_citation": True,
    },
    {
        "id": "g3",
        "question": "Summarize parental leave policy",
        "must_include_any": ["parental", "leave", "weeks", "maternity", "paternity"],
        "expect_citation": False,
    },
]


def _tokenize(text: str) -> set[str]:
    return {t for t in re.sub(r"[^a-z0-9\s]", " ", (text or "").lower()).split() if len(t) > 2}


def _faithfulness_heuristic(answer: str, contexts: list[str]) -> float:
    """Fraction of answer content words that appear in retrieved context (0-1)."""
    ans_tokens = _tokenize(answer)
    if not ans_tokens:
        return 0.0
    ctx = " ".join(contexts).lower()
    grounded = sum(1 for t in ans_tokens if t in ctx)
    return grounded / max(1, len(ans_tokens))


def run_eval(
    *,
    db: Session,
    organization_id: UUID,
    provider: str | None = None,
    project_id: str | None = None,
    golden: list[dict[str, Any]] | None = None,
    answer_fn: Any | None = None,
) -> dict[str, Any]:
    cases = golden or DEFAULT_GOLDEN
    results: list[dict[str, Any]] = []
    retrieval_hits = 0
    citation_ok = 0
    faithfulness_scores: list[float] = []

    for case in cases:
        q = str(case.get("question") or "").strip()
        hits = llama_retrieval.retrieve(
            organization_id=organization_id,
            question=q,
            top_k=6,
            project_id=project_id,
            db=db,
            hybrid=True,
        )
        contexts = [str(h.get("text") or "") for h in hits]
        retrieved = bool(hits)
        if retrieved:
            retrieval_hits += 1

        answer_text = ""
        citations: list[dict[str, Any]] = []
        if answer_fn:
            out = answer_fn(q, hits)
            answer_text = str(out.get("answer") or "")
            citations = list(out.get("citations") or [])
        elif hits and llm.resolve_provider(provider):
            try:
                ctx = "\n\n".join(contexts[:5])
                chat = llm.chat(
                    system="Answer only from the documents. Be brief.",
                    user=f"Question: {q}\n\nDocuments:\n{ctx}",
                    provider=provider,
                    temperature=0.1,
                )
                answer_text = chat.get("text") or ""
            except Exception as exc:
                answer_text = f"(llm error: {exc})"
        else:
            answer_text = " ".join(contexts)[:400]

        must_any = [str(x).lower() for x in (case.get("must_include_any") or [])]
        blob = f"{answer_text} {' '.join(contexts)}".lower()
        keyword_ok = (not must_any) or any(token in blob for token in must_any)
        cite_ok = (not case.get("expect_citation")) or bool(citations or hits)
        if cite_ok:
            citation_ok += 1
        faith = _faithfulness_heuristic(answer_text, contexts) if answer_text and contexts else 0.0
        faithfulness_scores.append(faith)

        results.append(
            {
                "id": case.get("id"),
                "question": q,
                "retrieved": retrieved,
                "hitCount": len(hits),
                "keywordOk": keyword_ok,
                "citationOk": cite_ok,
                "faithfulness": round(faith, 3),
                "answerPreview": answer_text[:180],
            }
        )

    n = max(1, len(cases))
    return {
        "ok": True,
        "total": len(cases),
        "retrievalHitRate": round(retrieval_hits / n, 3),
        "citationRate": round(citation_ok / n, 3),
        "avgFaithfulness": round(sum(faithfulness_scores) / n, 3),
        "cases": results,
    }
