"""Sentence-transformer embeddings + logistic regression classifier.

Uses the trained joblib model from the hybrid log-classification dataset.
Loads lazily so the API can start without heavy ML deps installed.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_MODELS_DIR = Path(__file__).resolve().parent / "models"
_MODEL_PATH = _MODELS_DIR / "log_classifier.joblib"

_lock = threading.Lock()
_embedding_model: Any = None
_classifier: Any = None
_load_error: str | None = None


def bert_available() -> bool:
    _ensure_loaded()
    return _classifier is not None and _embedding_model is not None


def bert_status() -> dict[str, Any]:
    _ensure_loaded()
    return {
        "available": bert_available(),
        "model_path": str(_MODEL_PATH),
        "model_present": _MODEL_PATH.is_file(),
        "error": _load_error,
    }


def _ensure_loaded() -> None:
    global _embedding_model, _classifier, _load_error
    if _classifier is not None or _load_error is not None:
        return
    with _lock:
        if _classifier is not None or _load_error is not None:
            return
        if not _MODEL_PATH.is_file():
            _load_error = f"Missing classifier at {_MODEL_PATH}"
            logger.warning(_load_error)
            return
        try:
            import joblib
            from sentence_transformers import SentenceTransformer

            _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
            _classifier = joblib.load(_MODEL_PATH)
            logger.info("Loaded log BERT classifier from %s", _MODEL_PATH)
        except Exception as exc:  # noqa: BLE001 — surface as soft failure
            _load_error = str(exc)
            _embedding_model = None
            _classifier = None
            logger.warning("BERT log classifier unavailable: %s", exc)


def classify_with_bert(log_message: str, *, min_confidence: float = 0.5) -> str | None:
    _ensure_loaded()
    if _classifier is None or _embedding_model is None:
        return None
    text = (log_message or "").strip()
    if not text:
        return None
    try:
        embeddings = _embedding_model.encode([text])
        probabilities = _classifier.predict_proba(embeddings)[0]
        if float(max(probabilities)) < min_confidence:
            return "Unclassified"
        predicted = _classifier.predict(embeddings)[0]
        return str(predicted)
    except Exception as exc:  # noqa: BLE001
        logger.warning("BERT classify failed: %s", exc)
        return None
