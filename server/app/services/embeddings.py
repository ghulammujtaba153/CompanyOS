from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings


def embedding_dimension() -> int:
    return get_settings().pinecone_dimension


def can_embed() -> bool:
    settings = get_settings()
    return settings.openai_configured or settings.gemini_configured


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed one or more texts. Uses OpenAI when available, else Gemini."""
    cleaned = [t.strip() if t and t.strip() else " " for t in texts]
    if not cleaned:
        return []
    settings = get_settings()
    prefer = (settings.ai_embedding_provider or settings.ai_default_provider or "openai").strip().lower()
    if prefer == "gemini" and settings.gemini_configured:
        return _gemini_embed(cleaned)
    if settings.openai_configured:
        return _openai_embed(cleaned)
    if settings.gemini_configured:
        return _gemini_embed(cleaned)
    raise RuntimeError("No embedding provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY.")


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]


def _openai_embed(texts: list[str]) -> list[list[float]]:
    settings = get_settings()
    model = settings.ai_openai_embedding_model.strip() or "text-embedding-3-small"
    body: dict[str, Any] = {"model": model, "input": texts}
    dim = settings.pinecone_dimension
    if dim and model.startswith("text-embedding-3"):
        body["dimensions"] = dim
    with httpx.Client(timeout=60.0) as client:
        res = client.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key.strip()}",
                "Content-Type": "application/json",
            },
            json=body,
        )
    if res.status_code >= 400:
        raise RuntimeError(f"OpenAI embeddings error {res.status_code}: {res.text[:300]}")
    data = res.json()
    rows = sorted(data.get("data") or [], key=lambda item: item.get("index", 0))
    return [list(item.get("embedding") or []) for item in rows]


def _gemini_embed(texts: list[str]) -> list[list[float]]:
    settings = get_settings()
    model = settings.ai_gemini_embedding_model.strip() or "text-embedding-004"
    key = settings.gemini_api_key.strip()
    dim = settings.pinecone_dimension
    vectors: list[list[float]] = []
    with httpx.Client(timeout=60.0) as client:
        for text in texts:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={key}"
            body: dict[str, Any] = {
                "model": f"models/{model}",
                "content": {"parts": [{"text": text}]},
            }
            if dim:
                body["outputDimensionality"] = dim
            res = client.post(url, json=body)
            if res.status_code >= 400:
                raise RuntimeError(f"Gemini embeddings error {res.status_code}: {res.text[:300]}")
            values = ((res.json().get("embedding") or {}).get("values")) or []
            vectors.append(list(values))
    return vectors
