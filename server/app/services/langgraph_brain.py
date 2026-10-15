"""
LangGraph answer pipeline for Company Brain.

Retrieval stays in ai_platform / llama_retrieval. This graph owns answer
generation: build context → LLM generate (or local synthesize) → finalize.
"""

from __future__ import annotations

import logging
from typing import Any, Literal, TypedDict

from app.config import get_settings
from app.services import llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are Company Brain for an agency OS. Answer using only the provided document "
    "excerpts (including Markdown tables). When citing tabular data, quote the relevant "
    "rows/columns. Be concise. If unsure, say what is missing. Use markdown lightly."
)


class BrainAnswerState(TypedDict, total=False):
    question: str
    provider: str | None
    retrieval: str
    top_k: int
    vector_hits: list[dict[str, Any]]
    doc_snippets: list[dict[str, Any]]  # {name, id, body}
    context: str
    citations: list[dict[str, str]]
    answer: str
    confidence: str
    mode: str
    llm_provider: str
    llm_model: str
    error: str
    tip: str


def enabled() -> bool:
    settings = get_settings()
    engine = (settings.rag_answer_engine or "langgraph").strip().lower()
    return engine in {"langgraph", "graph", "lg"}


def ready() -> bool:
    if not enabled():
        return False
    try:
        import langgraph  # noqa: F401
    except ImportError:
        return False
    return True


def _build_context(state: BrainAnswerState) -> dict[str, Any]:
    question = (state.get("question") or "").strip()
    top_k = max(1, min(8, int(state.get("top_k") or 5)))
    hits = list(state.get("vector_hits") or [])
    docs = list(state.get("doc_snippets") or [])
    citations: list[dict[str, str]] = []
    seen: set[str] = set()

    if hits:
        for hit in hits:
            doc_id = str(hit.get("document_id") or "")
            if not doc_id or doc_id in seen:
                continue
            seen.add(doc_id)
            citations.append(
                {
                    "title": str(hit.get("name") or "Document"),
                    "docId": doc_id,
                    "excerpt": str(hit.get("text") or "")[:200],
                }
            )
            if len(citations) >= top_k:
                break
        context = (
            "\n\n".join(f"### {hit.get('name')}\n{hit.get('text')}" for hit in hits[:8])
            or "No documents found."
        )
    else:
        for doc in docs:
            citations.append(
                {
                    "title": str(doc.get("name") or "Document"),
                    "docId": str(doc.get("id") or ""),
                    "excerpt": str(doc.get("excerpt") or doc.get("body") or "")[:200],
                }
            )
        context = (
            "\n\n".join(
                f"### {doc.get('name')}\n{str(doc.get('body') or '')[:1200]}" for doc in docs
            )
            or "No documents found."
        )

    has_context = bool(hits or docs)
    tip = ""
    if not has_context:
        settings = get_settings()
        if not settings.ai_configured:
            tip = " Configure OPENAI_API_KEY or GEMINI_API_KEY for richer answers."
        elif not settings.pinecone_configured:
            tip = " Configure PINECONE_API_KEY to enable vector search."

    return {
        "context": context,
        "citations": citations,
        "confidence": "high" if has_context else "low",
        "tip": tip,
        "error": "",
    }


def _generate(state: BrainAnswerState) -> dict[str, Any]:
    question = (state.get("question") or "").strip()
    context = state.get("context") or "No documents found."
    try:
        result = llm.chat(
            system=SYSTEM_PROMPT,
            user=f"Question: {question}\n\nDocuments:\n{context}",
            provider=state.get("provider"),
            temperature=0.2,
        )
        return {
            "answer": result["text"],
            "mode": "rag-langgraph" if ready() else "rag-llm",
            "llm_provider": result.get("provider") or "",
            "llm_model": result.get("model") or "",
            "confidence": state.get("confidence") or "medium",
            "error": "",
        }
    except Exception as exc:
        logger.warning("LangGraph generate node failed: %s", exc)
        return {"error": str(exc), "mode": "rag-local"}


def _synthesize(state: BrainAnswerState) -> dict[str, Any]:
    question = (state.get("question") or "").strip()
    hits = list(state.get("vector_hits") or [])
    docs = list(state.get("doc_snippets") or [])
    tip = state.get("tip") or ""
    err = state.get("error") or ""
    note = f"\n\n_(LLM unavailable: {err})_" if err else ""

    if not hits and not docs:
        return {
            "answer": "I could not find matching material in the document vault." + tip,
            "citations": [],
            "confidence": "low",
            "mode": "rag-local",
            "llm_provider": "",
            "llm_model": "",
        }

    if hits:
        bits = " ".join(str(hit.get("text") or "")[:240] for hit in hits[:3])
    else:
        bits = " ".join(str(doc.get("body") or "")[:240] for doc in docs)
    answer = (
        f"Here’s what I found related to “{question}”: "
        f"{bits[:420]}{'…' if len(bits) > 420 else ''}"
    )
    confidence = "medium" if (len(docs) >= 2 or len(hits) >= 2) else "low"
    return {
        "answer": answer + note,
        "confidence": confidence,
        "mode": "rag-local",
        "llm_provider": "",
        "llm_model": "",
    }


def _finalize(state: BrainAnswerState) -> dict[str, Any]:
    return {
        "answer": (state.get("answer") or "").strip(),
        "citations": list(state.get("citations") or []),
        "confidence": state.get("confidence") or "low",
        "mode": state.get("mode") or "rag-local",
        "retrieval": state.get("retrieval") or "keyword",
        "llm_provider": state.get("llm_provider") or "",
        "llm_model": state.get("llm_model") or "",
    }


def _route_after_context(state: BrainAnswerState) -> Literal["generate", "synthesize"]:
    if not (state.get("vector_hits") or state.get("doc_snippets")):
        return "synthesize"
    if llm.resolve_provider(state.get("provider")):
        return "generate"
    return "synthesize"


def _route_after_generate(state: BrainAnswerState) -> Literal["synthesize", "finalize"]:
    if state.get("error"):
        return "synthesize"
    if not (state.get("answer") or "").strip():
        return "synthesize"
    return "finalize"


def _compile_graph() -> Any:
    from langgraph.graph import END, START, StateGraph

    graph = StateGraph(BrainAnswerState)
    graph.add_node("build_context", _build_context)
    graph.add_node("generate", _generate)
    graph.add_node("synthesize", _synthesize)
    graph.add_node("finalize", _finalize)

    graph.add_edge(START, "build_context")
    graph.add_conditional_edges(
        "build_context",
        _route_after_context,
        {"generate": "generate", "synthesize": "synthesize"},
    )
    graph.add_conditional_edges(
        "generate",
        _route_after_generate,
        {"synthesize": "synthesize", "finalize": "finalize"},
    )
    graph.add_edge("synthesize", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()


_GRAPH: Any | None = None


def _graph() -> Any:
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = _compile_graph()
    return _GRAPH


def answer(
    *,
    question: str,
    retrieval: str,
    vector_hits: list[dict[str, Any]] | None = None,
    doc_snippets: list[dict[str, Any]] | None = None,
    provider: str | None = None,
    top_k: int = 5,
) -> dict[str, Any]:
    """
    Run the LangGraph answer pipeline.
    Returns { answer, citations, confidence, mode, retrieval, provider, model }.
    Falls back to a linear path if langgraph is not installed.
    """
    initial: BrainAnswerState = {
        "question": question,
        "provider": provider,
        "retrieval": retrieval,
        "top_k": top_k,
        "vector_hits": list(vector_hits or []),
        "doc_snippets": list(doc_snippets or []),
    }

    if ready():
        try:
            final = _graph().invoke(initial)
            return {
                "answer": final.get("answer") or "",
                "citations": final.get("citations") or [],
                "confidence": final.get("confidence") or "low",
                "mode": final.get("mode") or "rag-langgraph",
                "retrieval": final.get("retrieval") or retrieval,
                "provider": final.get("llm_provider") or "",
                "model": final.get("llm_model") or "",
                "engine": "langgraph",
            }
        except Exception as exc:
            logger.warning("LangGraph invoke failed, using linear fallback: %s", exc)

    # Linear fallback (same nodes, no LangGraph runtime).
    state: BrainAnswerState = {**initial, **_build_context(initial)}
    if _route_after_context(state) == "generate":
        state.update(_generate(state))
        if _route_after_generate(state) == "synthesize":
            state.update(_synthesize(state))
    else:
        state.update(_synthesize(state))
    state.update(_finalize(state))
    return {
        "answer": state.get("answer") or "",
        "citations": state.get("citations") or [],
        "confidence": state.get("confidence") or "low",
        "mode": state.get("mode") or "rag-local",
        "retrieval": state.get("retrieval") or retrieval,
        "provider": state.get("llm_provider") or "",
        "model": state.get("llm_model") or "",
        "engine": "linear-fallback",
    }


def status() -> dict[str, Any]:
    settings = get_settings()
    return {
        "engine": (settings.rag_answer_engine or "langgraph").strip().lower(),
        "enabled": enabled(),
        "ready": ready(),
        "library": "langgraph",
        "graph": "build_context -> generate|synthesize -> finalize",
    }
