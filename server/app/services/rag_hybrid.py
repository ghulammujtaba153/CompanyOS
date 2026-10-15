"""Hybrid dense + lexical retrieval merge and light reranking."""

from __future__ import annotations

import re
from typing import Any


def _tokenize(text: str) -> list[str]:
    return [t for t in re.sub(r"[^a-z0-9\s]", " ", (text or "").lower()).split() if len(t) > 2]


def lexical_score(question: str, text: str, name: str = "") -> float:
    tokens = _tokenize(question)
    if not tokens:
        return 0.0
    hay = f"{name} {text}".lower()
    hits = sum(1 for t in tokens if t in hay)
    name_hits = sum(1 for t in tokens if t in (name or "").lower())
    return hits / max(1, len(tokens)) + 0.35 * (name_hits / max(1, len(tokens)))


def rrf_merge(
    dense_hits: list[dict[str, Any]],
    lexical_hits: list[dict[str, Any]],
    *,
    top_k: int = 8,
    k: int = 60,
) -> list[dict[str, Any]]:
    """Reciprocal Rank Fusion over dense + lexical lists."""
    scores: dict[str, float] = {}
    payload: dict[str, dict[str, Any]] = {}

    def key_of(hit: dict[str, Any]) -> str:
        return f"{hit.get('document_id') or ''}::{hit.get('chunk_index', 0)}::{(hit.get('text') or '')[:40]}"

    for rank, hit in enumerate(dense_hits):
        key = key_of(hit)
        scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
        row = dict(hit)
        row["retrieval"] = "hybrid"
        payload[key] = row

    for rank, hit in enumerate(lexical_hits):
        key = key_of(hit)
        scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
        if key not in payload:
            row = dict(hit)
            row["retrieval"] = "hybrid"
            payload[key] = row

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    out: list[dict[str, Any]] = []
    for key, fused in ranked[: max(1, top_k)]:
        row = payload[key]
        row["score"] = float(fused)
        row["fused_score"] = float(fused)
        out.append(row)
    return out


def rerank(question: str, hits: list[dict[str, Any]], *, top_k: int = 8) -> list[dict[str, Any]]:
    """Boost vector/hybrid hits with lexical overlap (no extra model)."""
    scored: list[tuple[float, dict[str, Any]]] = []
    for hit in hits:
        base = float(hit.get("score") or hit.get("fused_score") or 0)
        lex = lexical_score(question, str(hit.get("text") or ""), str(hit.get("name") or ""))
        # Normalize dense scores (~0-1 cosine) with lexical boost.
        combined = 0.7 * base + 0.3 * lex if base <= 1.5 else base + lex
        row = dict(hit)
        row["rerank_score"] = combined
        row["lexical_score"] = lex
        scored.append((combined, row))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [row for _, row in scored[: max(1, top_k)]]
