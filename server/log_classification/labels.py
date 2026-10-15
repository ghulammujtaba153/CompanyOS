"""Known labels and which ones count as operational issues."""

from __future__ import annotations

import re

# Labels produced by regex / BERT / LLM paths.
KNOWN_LABELS = frozenset(
    {
        "User Action",
        "System Notification",
        "Security Alert",
        "HTTP Status",
        "Workflow Error",
        "Deprecation Warning",
        "Critical Error",
        "Unclassified",
    }
)

# Always-issue labels (HTTP Status is handled separately — only 4xx/5xx).
ISSUE_LABELS = frozenset(
    {
        "Security Alert",
        "Workflow Error",
        "Critical Error",
    }
)

ALERT_RECIPIENT_DEFAULT = "ghulammujtaba.dro@gmail.com"

_HTTP_ERROR_RE = re.compile(r"(?:RCODE\s+|API returned |status[=:\s])(4\d\d|5\d\d)\b", re.I)


def is_issue_label(label: str | None, log_message: str | None = None) -> bool:
    if not label:
        return False
    normalized = label.strip()
    if normalized in ISSUE_LABELS:
        return True
    # HTTP Status only alerts for client/server error codes in the message.
    if normalized == "HTTP Status":
        return bool(_HTTP_ERROR_RE.search(log_message or ""))
    return False


def issue_labels_for_status() -> list[str]:
    return sorted([*ISSUE_LABELS, "HTTP Status (4xx/5xx only)"])
