"""Regex classifier for predictable log patterns."""

from __future__ import annotations

import re

# Ordered: first match wins. Issue-like patterns listed first.
_REGEX_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"Admin access escalation detected", re.I), "Security Alert"),
    (re.compile(r"(potential attack|blocked due to|brute.?force|unauthorized|intrusion)", re.I), "Security Alert"),
    (re.compile(r"Multiple login failures", re.I), "Security Alert"),
    (re.compile(r"(System crashed|critical failure|fatal error|out of memory)", re.I), "Critical Error"),
    (re.compile(r"(escalation.*failed|process aborted|failed because)", re.I), "Workflow Error"),
    (re.compile(r"RCODE\s+(4\d\d|5\d\d)\b", re.I), "HTTP Status"),
    (re.compile(r"API returned (4\d\d|5\d\d)", re.I), "HTTP Status"),
    (re.compile(r"User User\d+ logged (in|out)\.", re.I), "User Action"),
    (re.compile(r"User \d+ logged in\.", re.I), "User Action"),
    (re.compile(r"Account with ID .* created by .*", re.I), "User Action"),
    (re.compile(r"Backup (started|ended) at .*", re.I), "System Notification"),
    (re.compile(r"Backup completed successfully\.", re.I), "System Notification"),
    (re.compile(r"System updated to version .*", re.I), "System Notification"),
    (re.compile(r"File .* uploaded successfully by user .*", re.I), "System Notification"),
    (re.compile(r"Disk cleanup completed successfully\.", re.I), "System Notification"),
    (re.compile(r"System reboot initiated by user .*", re.I), "System Notification"),
    (re.compile(r"(no longer supported|will be retired|deprecated|migrate to)", re.I), "Deprecation Warning"),
]


def classify_with_regex(log_message: str) -> str | None:
    if not log_message or not str(log_message).strip():
        return None
    text = str(log_message).strip()
    for pattern, label in _REGEX_PATTERNS:
        if pattern.search(text):
            return label
    return None
