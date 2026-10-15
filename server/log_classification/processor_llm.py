"""LLM fallback for messy / unlabeled logs (uses CompanyOS AI providers)."""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

_CATEGORY_RE = re.compile(r"<category>\s*(.*?)\s*</category>", re.I | re.DOTALL)

_ALLOWED = {
    "Workflow Error",
    "Deprecation Warning",
    "Security Alert",
    "Critical Error",
    "HTTP Status",
    "User Action",
    "System Notification",
    "Unclassified",
}


def classify_with_llm(log_msg: str) -> str:
    text = (log_msg or "").strip()
    if not text:
        return "Unclassified"

    prompt = f"""Classify the log message into exactly one of these categories:
(1) Workflow Error
(2) Deprecation Warning
(3) Security Alert
(4) Critical Error
(5) HTTP Status
(6) User Action
(7) System Notification
(8) Unclassified

Put the category inside <category></category> tags.
Log message: {text}"""

    try:
        from app.services.llm import chat

        result = chat(
            system="You classify application log lines. Reply with a single category tag only.",
            user=prompt,
            temperature=0.2,
        )
        content = str(result.get("text") or "")
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM log classify failed: %s", exc)
        return _heuristic_fallback(text)

    match = _CATEGORY_RE.search(content)
    if not match:
        return _heuristic_fallback(text)
    category = match.group(1).strip()
    # Normalize common variants
    for allowed in _ALLOWED:
        if allowed.lower() == category.lower():
            return allowed
    return "Unclassified"


def _heuristic_fallback(text: str) -> str:
    lower = text.lower()
    if any(k in lower for k in ("attack", "unauthorized", "escalation detected", "login failure")):
        return "Security Alert"
    if any(k in lower for k in ("failed", "aborted", "unable to", "error")):
        return "Workflow Error"
    if any(k in lower for k in ("deprecated", "retired", "no longer supported", "migrate")):
        return "Deprecation Warning"
    if any(k in lower for k in ("crash", "fatal", "critical")):
        return "Critical Error"
    return "Unclassified"
