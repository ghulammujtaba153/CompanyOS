"""Hybrid orchestrator: regex → BERT → LLM (LegacyCRM-style sources go to LLM first)."""

from __future__ import annotations

from typing import Any, Iterable, Sequence

from log_classification.brevo_alerts import alert_issues
from log_classification.labels import is_issue_label
from log_classification.processor_bert import classify_with_bert
from log_classification.processor_llm import classify_with_llm
from log_classification.processor_regex import classify_with_regex

# Sources that are poorly structured / lightly labeled → prefer LLM.
_LLM_FIRST_SOURCES = frozenset({"LegacyCRM", "legacycrm", "legacy_crm"})


def _is_llm_first_source(source: str) -> bool:
    source_norm = (source or "").strip()
    return source_norm in _LLM_FIRST_SOURCES or source_norm.lower() in _LLM_FIRST_SOURCES


def classify_log(source: str, log_msg: str) -> tuple[str, str]:
    """
    Classify a single log.
    Returns (label, method) where method is regex | bert | llm | unclassified.
    """
    message = (log_msg or "").strip()

    if _is_llm_first_source(source):
        label = classify_with_llm(message)
        if label and label != "Unclassified":
            return label, "llm"
        # Fall through when LLM is unsure or unavailable.
        regex_label = classify_with_regex(message)
        if regex_label:
            return regex_label, "regex"
        bert_label = classify_with_bert(message)
        if bert_label and bert_label != "Unclassified":
            return bert_label, "bert"
        return label or bert_label or "Unclassified", "llm" if label else "unclassified"

    label = classify_with_regex(message)
    if label:
        return label, "regex"

    label = classify_with_bert(message)
    if label and label != "Unclassified":
        return label, "bert"

    # Low-confidence BERT or no BERT → try LLM before giving up.
    if not label or label == "Unclassified":
        llm_label = classify_with_llm(message)
        if llm_label and llm_label != "Unclassified":
            return llm_label, "llm"
        if label == "Unclassified":
            return "Unclassified", "bert"

    return label or "Unclassified", "unclassified"


def classify(logs: Sequence[tuple[str, str]]) -> list[str]:
    """Compatibility helper matching the educational project's API."""
    return [classify_log(source, message)[0] for source, message in logs]


def classify_records(
    records: Iterable[dict[str, Any]],
    *,
    alert: bool = True,
) -> list[dict[str, Any]]:
    """
    Classify dict rows with keys source + log_message.
    Adds target_label, method, is_issue. Optionally emails via Brevo for issues (batched).
    """
    rows: list[dict[str, Any]] = []
    for item in records:
        source = str(item.get("source") or "")
        message = str(item.get("log_message") or item.get("message") or "")
        label, method = classify_log(source, message)
        row = {
            **item,
            "source": source,
            "log_message": message,
            "target_label": label,
            "method": method,
            "is_issue": is_issue_label(label, message),
        }
        rows.append(row)

    if alert:
        digest = alert_issues(rows)
        for row in rows:
            if row["is_issue"]:
                row["alert"] = digest
    return rows
