from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from app.config import get_settings
from app.services import embeddings
from app.services.document_extract import chunk_for_rag

logger = logging.getLogger(__name__)

_CHUNK_CHARS = 900
_CHUNK_OVERLAP = 120


def configured() -> bool:
    settings = get_settings()
    return bool(settings.pinecone_api_key.strip() and settings.pinecone_index.strip())


def ready() -> bool:
    return configured() and embeddings.can_embed()


def namespace_for(org_id: UUID | str) -> str:
    return str(org_id).replace("-", "")[:64]


def chunk_text(text: str, *, size: int = _CHUNK_CHARS, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    """Back-compat: return text strings only (tables preserved via chunk_for_rag)."""
    return [item["text"] for item in chunk_for_rag(text, size=size, overlap=overlap)]


def _client():
    from pinecone import Pinecone

    settings = get_settings()
    return Pinecone(api_key=settings.pinecone_api_key.strip())


def ensure_index() -> Any:
    """Create the serverless index if missing; return an Index handle."""
    if not configured():
        raise RuntimeError("Pinecone is not configured. Set PINECONE_API_KEY and PINECONE_INDEX.")
    settings = get_settings()
    name = settings.pinecone_index.strip()
    pc = _client()
    existing = {item["name"] for item in pc.list_indexes()}
    if name not in existing:
        from pinecone import ServerlessSpec

        dimension = settings.pinecone_dimension or embeddings.embedding_dimension()
        pc.create_index(
            name=name,
            dimension=dimension,
            metric=settings.pinecone_metric or "cosine",
            spec=ServerlessSpec(
                cloud=settings.pinecone_cloud or "aws",
                region=settings.pinecone_region or "us-east-1",
            ),
        )
        logger.info("Created Pinecone index %s (dim=%s)", name, dimension)
    # Prefer modern helper; fall back for older SDKs.
    if hasattr(pc, "Index"):
        return pc.Index(name)
    return pc.index(name)


def upsert_document(
    *,
    organization_id: UUID | str,
    document_id: UUID | str,
    name: str,
    category: str,
    body: str,
    status: str = "Active",
    project_id: UUID | str | None = None,
) -> dict[str, Any]:
    """Embed + upsert document chunks into the org namespace. No-op when not ready."""
    if not ready():
        return {"ok": False, "skipped": True, "reason": "pinecone_or_embeddings_not_configured"}
    if status == "Archived":
        delete_document(organization_id=organization_id, document_id=document_id)
        return {"ok": True, "deleted": True, "reason": "archived"}

    text = f"{name}\nCategory: {category}\n\n{body or ''}".strip()
    chunk_rows = chunk_for_rag(text, size=_CHUNK_CHARS, overlap=_CHUNK_OVERLAP)
    if not chunk_rows:
        chunk_rows = [{"text": name or str(document_id), "kind": "text"}]

    try:
        chunk_texts = [row["text"] for row in chunk_rows]
        vectors = embeddings.embed_texts(chunk_texts)
        index = ensure_index()
        ns = namespace_for(organization_id)
        doc_key = str(document_id)
        # Replace prior chunks for this document.
        delete_document(organization_id=organization_id, document_id=document_id)
        payload = []
        for i, (row, values) in enumerate(zip(chunk_rows, vectors)):
            chunk = row["text"]
            meta: dict[str, Any] = {
                "organization_id": str(organization_id),
                "kind": "document",
                "document_id": doc_key,
                "name": (name or "")[:200],
                "category": (category or "")[:80],
                "status": status or "Active",
                "chunk_index": i,
                "chunk_kind": row.get("kind") or "text",
                "text": chunk[:1600],
            }
            if project_id:
                meta["project_id"] = str(project_id)
            payload.append(
                {
                    "id": f"{doc_key}::c{i}",
                    "values": values,
                    "metadata": meta,
                }
            )
        index.upsert(vectors=payload, namespace=ns)
        return {
            "ok": True,
            "chunks": len(payload),
            "table_chunks": sum(1 for row in chunk_rows if row.get("kind") == "table"),
            "namespace": ns,
        }
    except Exception as exc:
        logger.warning("Pinecone upsert failed for %s: %s", document_id, exc)
        return {"ok": False, "error": str(exc)}


def upsert_audit_event(
    *,
    organization_id: UUID | str,
    event_id: UUID | str,
    at: str,
    actor: str,
    action: str,
    target: str,
    area: str,
) -> dict[str, Any]:
    """Embed a single audit event for semantic search over the compliance trail."""
    if not ready():
        return {"ok": False, "skipped": True, "reason": "pinecone_or_embeddings_not_configured"}
    text = f"Audit · {area}\nWhen: {at}\nActor: {actor}\nAction: {action}\nTarget: {target}".strip()
    try:
        values = embeddings.embed_query(text)
        index = ensure_index()
        ns = namespace_for(organization_id)
        event_key = str(event_id)
        vector_id = f"audit::{event_key}"
        index.upsert(
            vectors=[
                {
                    "id": vector_id,
                    "values": values,
                    "metadata": {
                        "organization_id": str(organization_id),
                        "kind": "audit",
                        "document_id": event_key,
                        "name": f"{action} · {target}"[:200],
                        "category": (area or "Organization")[:80],
                        "status": "Active",
                        "chunk_index": 0,
                        "text": text[:1200],
                        "actor": (actor or "")[:200],
                        "at": (at or "")[:40],
                    },
                }
            ],
            namespace=ns,
        )
        return {"ok": True, "chunks": 1, "namespace": ns}
    except Exception as exc:
        logger.warning("Pinecone audit upsert failed for %s: %s", event_id, exc)
        return {"ok": False, "error": str(exc)}


def delete_document(*, organization_id: UUID | str, document_id: UUID | str) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "skipped": True}
    try:
        index = ensure_index()
        ns = namespace_for(organization_id)
        doc_key = str(document_id)
        # Prefer metadata filter delete when supported; otherwise delete known chunk ids.
        try:
            index.delete(filter={"document_id": {"$eq": doc_key}}, namespace=ns)
        except Exception:
            ids = [f"{doc_key}::c{i}" for i in range(64)]
            index.delete(ids=ids, namespace=ns)
        return {"ok": True, "namespace": ns}
    except Exception as exc:
        logger.warning("Pinecone delete failed for %s: %s", document_id, exc)
        return {"ok": False, "error": str(exc)}


def query_similar(
    *,
    organization_id: UUID | str,
    question: str,
    top_k: int = 5,
    kind: str = "document",
    project_id: str | UUID | None = None,
) -> list[dict[str, Any]]:
    """
    Return ranked chunk hits:
    [{ document_id, name, category, text, score, chunk_index }]
    kind: document | audit | any
    """
    if not ready():
        return []
    question = (question or "").strip()
    if not question:
        return []
    try:
        vector = embeddings.embed_query(question)
        index = ensure_index()
        ns = namespace_for(organization_id)
        filters: dict[str, Any] = {"status": {"$ne": "Archived"}}
        if kind == "audit":
            filters["kind"] = {"$eq": "audit"}
        elif kind == "document":
            # Exclude audit vectors; older doc vectors may omit kind and still match.
            filters["kind"] = {"$ne": "audit"}
        if project_id:
            filters["project_id"] = {"$eq": str(project_id)}
        result = index.query(
            vector=vector,
            top_k=max(1, min(20, top_k)),
            namespace=ns,
            include_metadata=True,
            filter=filters,
        )
        matches = getattr(result, "matches", None)
        if matches is None and isinstance(result, dict):
            matches = result.get("matches") or []
        hits: list[dict[str, Any]] = []
        for match in matches or []:
            meta = getattr(match, "metadata", None)
            if meta is None and isinstance(match, dict):
                meta = match.get("metadata") or {}
            score = getattr(match, "score", None)
            if score is None and isinstance(match, dict):
                score = match.get("score")
            hits.append(
                {
                    "document_id": str((meta or {}).get("document_id") or ""),
                    "name": str((meta or {}).get("name") or ""),
                    "category": str((meta or {}).get("category") or ""),
                    "text": str((meta or {}).get("text") or ""),
                    "chunk_index": int((meta or {}).get("chunk_index") or 0),
                    "chunk_kind": str((meta or {}).get("chunk_kind") or "text"),
                    "project_id": str((meta or {}).get("project_id") or ""),
                    "score": float(score or 0),
                }
            )
        return hits
    except Exception as exc:
        logger.warning("Pinecone query failed: %s", exc)
        return []


def status() -> dict[str, Any]:
    settings = get_settings()
    return {
        "configured": configured(),
        "ready": ready(),
        "index": settings.pinecone_index,
        "dimension": settings.pinecone_dimension,
        "metric": settings.pinecone_metric,
        "cloud": settings.pinecone_cloud,
        "region": settings.pinecone_region,
        "embeddingsAvailable": embeddings.can_embed(),
        "embeddingProvider": settings.ai_embedding_provider or settings.ai_default_provider,
        "retrievalEngine": (settings.rag_retrieval_engine or "llamaindex").strip().lower(),
    }
