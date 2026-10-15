"""
LlamaIndex-backed hybrid retrieval over Pinecone org namespaces.

Dense (LlamaIndex/Pinecone) + lexical (vault keyword) fused with RRF, then
light lexical rerank. Optional project_id metadata filter.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import VaultDocumentRow
from app.services import embeddings, pinecone_store, rag_hybrid

logger = logging.getLogger(__name__)


def enabled() -> bool:
    settings = get_settings()
    engine = (settings.rag_retrieval_engine or "llamaindex").strip().lower()
    return engine in {"llamaindex", "llama", "llama-index"}


def ready() -> bool:
    if not enabled():
        return False
    if not pinecone_store.ready():
        return False
    try:
        import llama_index.core  # noqa: F401
        import llama_index.vector_stores.pinecone  # noqa: F401
    except ImportError:
        return False
    return True


def _embed_model() -> Any:
    try:
        from llama_index.core.embeddings import BaseEmbedding
    except ImportError:  # pragma: no cover
        from llama_index.core.base.embeddings.base import BaseEmbedding

    try:
        from llama_index.core.bridge.pydantic import PrivateAttr
    except ImportError:  # pragma: no cover
        from pydantic import PrivateAttr

    class CompanyOSEmbedding(BaseEmbedding):
        _dim: int = PrivateAttr(default=1536)

        def __init__(self, **kwargs: Any) -> None:
            super().__init__(**kwargs)
            object.__setattr__(self, "_dim", embeddings.embedding_dimension() or 1536)

        @classmethod
        def class_name(cls) -> str:
            return "CompanyOSEmbedding"

        def _get_query_embedding(self, query: str) -> list[float]:
            return embeddings.embed_query(query)

        def _get_text_embedding(self, text: str) -> list[float]:
            return embeddings.embed_texts([text])[0]

        def _get_text_embeddings(self, texts: list[str]) -> list[list[float]]:
            return embeddings.embed_texts(texts)

        async def _aget_query_embedding(self, query: str) -> list[float]:
            return self._get_query_embedding(query)

        async def _aget_text_embedding(self, text: str) -> list[float]:
            return self._get_text_embedding(text)

        async def _aget_text_embeddings(self, texts: list[str]) -> list[list[float]]:
            return self._get_text_embeddings(texts)

    return CompanyOSEmbedding()


def _metadata_filters(kind: str, project_id: str | None = None) -> Any:
    from llama_index.core.vector_stores import (
        FilterOperator,
        MetadataFilter,
        MetadataFilters,
    )

    filters: list[Any] = [
        MetadataFilter(key="status", operator=FilterOperator.NE, value="Archived"),
    ]
    if kind == "audit":
        filters.append(MetadataFilter(key="kind", operator=FilterOperator.EQ, value="audit"))
    elif kind == "document":
        filters.append(MetadataFilter(key="kind", operator=FilterOperator.NE, value="audit"))
    if project_id:
        filters.append(MetadataFilter(key="project_id", operator=FilterOperator.EQ, value=str(project_id)))
    return MetadataFilters(filters=filters)


def _build_retriever(
    *,
    organization_id: UUID | str,
    top_k: int,
    kind: str,
    project_id: str | None = None,
) -> Any:
    from llama_index.core import VectorStoreIndex
    from llama_index.core.vector_stores.types import VectorStoreQueryMode
    from llama_index.vector_stores.pinecone import PineconeVectorStore

    index_handle = pinecone_store.ensure_index()
    ns = pinecone_store.namespace_for(organization_id)
    vector_store = PineconeVectorStore(
        pinecone_index=index_handle,
        namespace=ns,
    )
    store_index = VectorStoreIndex.from_vector_store(
        vector_store=vector_store,
        embed_model=_embed_model(),
    )
    return store_index.as_retriever(
        similarity_top_k=max(1, min(20, top_k)),
        filters=_metadata_filters(kind, project_id=project_id),
        vector_store_query_mode=VectorStoreQueryMode.DEFAULT,
    )


def _node_to_hit(node_with_score: Any) -> dict[str, Any]:
    node = getattr(node_with_score, "node", node_with_score)
    score = float(getattr(node_with_score, "score", None) or 0)
    meta = dict(getattr(node, "metadata", None) or {})
    text = ""
    if hasattr(node, "get_content"):
        try:
            text = node.get_content() or ""
        except Exception:
            text = ""
    if not text:
        text = str(meta.get("text") or getattr(node, "text", "") or "")
    return {
        "document_id": str(meta.get("document_id") or ""),
        "name": str(meta.get("name") or ""),
        "category": str(meta.get("category") or ""),
        "text": text[:1600],
        "chunk_index": int(meta.get("chunk_index") or 0),
        "chunk_kind": str(meta.get("chunk_kind") or "text"),
        "project_id": str(meta.get("project_id") or ""),
        "score": score,
        "retrieval": "llamaindex",
    }


def _lexical_hits_from_db(
    db: Session,
    organization_id: UUID | str,
    question: str,
    *,
    top_k: int,
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    org = UUID(str(organization_id)) if not isinstance(organization_id, UUID) else organization_id
    q = db.query(VaultDocumentRow).filter(
        VaultDocumentRow.organization_id == org,
        VaultDocumentRow.status != "Archived",
    )
    if project_id:
        try:
            q = q.filter(VaultDocumentRow.project_id == UUID(str(project_id)))
        except Exception:
            return []
    rows = q.order_by(VaultDocumentRow.uploaded_at.desc()).limit(200).all()
    scored: list[tuple[float, VaultDocumentRow]] = []
    for row in rows:
        score = rag_hybrid.lexical_score(question, row.body or "", row.name or "")
        if score > 0:
            scored.append((score, row))
    scored.sort(key=lambda item: item[0], reverse=True)
    hits: list[dict[str, Any]] = []
    for score, row in scored[:top_k]:
        hits.append(
            {
                "document_id": str(row.id),
                "name": row.name,
                "category": row.category,
                "text": (row.body or "")[:1600],
                "chunk_index": 0,
                "chunk_kind": "text",
                "project_id": str(row.project_id) if row.project_id else "",
                "score": score,
                "retrieval": "lexical",
            }
        )
    return hits


def retrieve(
    *,
    organization_id: UUID | str,
    question: str,
    top_k: int = 5,
    kind: str = "document",
    project_id: str | None = None,
    db: Session | None = None,
    hybrid: bool = True,
) -> list[dict[str, Any]]:
    """
    Retrieve ranked chunk hits (hybrid by default).
    Falls back to raw Pinecone when LlamaIndex is unavailable.
    """
    question = (question or "").strip()
    if not question:
        return []
    fetch_k = max(top_k * 3, top_k)

    dense: list[dict[str, Any]] = []
    if ready():
        try:
            retriever = _build_retriever(
                organization_id=organization_id,
                top_k=fetch_k,
                kind=kind,
                project_id=project_id,
            )
            dense = [_node_to_hit(item) for item in (retriever.retrieve(question) or [])]
        except Exception as exc:
            logger.warning("LlamaIndex retrieval failed: %s", exc)
            dense = pinecone_store.query_similar(
                organization_id=organization_id,
                question=question,
                top_k=fetch_k,
                kind=kind,
                project_id=project_id,
            )
            for hit in dense:
                hit.setdefault("retrieval", "pinecone-fallback")
    else:
        dense = pinecone_store.query_similar(
            organization_id=organization_id,
            question=question,
            top_k=fetch_k,
            kind=kind,
            project_id=project_id,
        )
        for hit in dense:
            hit.setdefault("retrieval", "pinecone")

    lexical: list[dict[str, Any]] = []
    if hybrid and db is not None and kind == "document":
        lexical = _lexical_hits_from_db(
            db,
            organization_id,
            question,
            top_k=fetch_k,
            project_id=project_id,
        )

    if dense and lexical:
        merged = rag_hybrid.rrf_merge(dense, lexical, top_k=fetch_k)
        return rag_hybrid.rerank(question, merged, top_k=top_k)
    if dense:
        return rag_hybrid.rerank(question, dense, top_k=top_k)
    if lexical:
        return rag_hybrid.rerank(question, lexical, top_k=top_k)
    return []


def status() -> dict[str, Any]:
    settings = get_settings()
    return {
        "engine": (settings.rag_retrieval_engine or "llamaindex").strip().lower(),
        "enabled": enabled(),
        "ready": ready(),
        "library": "llama-index",
        "vectorStore": "pinecone",
        "embedAdapter": "CompanyOSEmbedding",
        "hybrid": True,
        "rerank": "lexical-boost",
    }
