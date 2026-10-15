"""Send Brevo transactional email when classified logs are issues."""

from __future__ import annotations

import logging
from html import escape
from typing import Any

from log_classification.labels import ALERT_RECIPIENT_DEFAULT, is_issue_label

logger = logging.getLogger(__name__)


def _settings_snapshot() -> dict[str, str]:
    try:
        from app.config import get_settings

        settings = get_settings()
        return {
            "recipient": (settings.brevo_alert_to or ALERT_RECIPIENT_DEFAULT).strip()
            or ALERT_RECIPIENT_DEFAULT,
        }
    except Exception:  # noqa: BLE001
        import os

        return {
            "recipient": (os.getenv("BREVO_ALERT_TO") or ALERT_RECIPIENT_DEFAULT).strip()
            or ALERT_RECIPIENT_DEFAULT,
        }


def alert_recipient() -> str:
    return _settings_snapshot()["recipient"]


def brevo_configured() -> bool:
    try:
        from app.services.mailer import mail_configured

        return mail_configured()
    except Exception:  # noqa: BLE001
        return False


def send_issue_digest(issues: list[dict[str, Any]]) -> dict[str, Any]:
    """Send one digest email for a batch of issue rows."""
    if not issues:
        return {"sent": False, "skipped": True, "reason": "no_issues"}

    recipient = alert_recipient()
    if not brevo_configured():
        logger.warning(
            "Brevo not configured — would alert %s about %s issue(s)",
            recipient,
            len(issues),
        )
        return {
            "sent": False,
            "skipped": True,
            "reason": "brevo_not_configured",
            "issue_count": len(issues),
            "to": recipient,
        }

    labels = sorted({str(row.get("target_label") or "") for row in issues})
    subject = f"[CompanyOS] {len(issues)} log issue(s): {', '.join(labels[:3])}"
    if len(labels) > 3:
        subject += "…"

    rows_html: list[str] = []
    rows_text: list[str] = []
    for index, row in enumerate(issues, start=1):
        label = escape(str(row.get("target_label") or ""))
        source = escape(str(row.get("source") or "unknown"))
        method = escape(str(row.get("method") or "hybrid"))
        message = escape(str(row.get("log_message") or ""))
        rows_html.append(
            f"<li><strong>{label}</strong> · {source} · {method}"
            f"<pre style=\"background:#f4f4f5;padding:8px;border-radius:6px;"
            f"white-space:pre-wrap;margin:6px 0 12px\">{message}</pre></li>"
        )
        rows_text.append(
            f"{index}. [{row.get('target_label')}] {row.get('source')} ({row.get('method')})\n"
            f"   {row.get('log_message')}\n"
        )

    html = f"""
    <h2>Log classification digest</h2>
    <p><strong>{len(issues)}</strong> log line(s) were classified as issues.</p>
    <ol>{"".join(rows_html)}</ol>
    <p style="color:#71717a;font-size:12px">Sent by CompanyOS hybrid log classifier via Brevo.</p>
    """
    text = f"{len(issues)} log issue(s)\n\n" + "\n".join(rows_text)

    from app.services.mailer import send_email

    result = send_email(to=recipient, subject=subject, html=html, text=text)
    result["issue_count"] = len(issues)
    return result


def alert_issues(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Send one digest for all issue rows. Returns a single mail result shared by issues."""
    issues = [
        row
        for row in rows
        if is_issue_label(
            str(row.get("target_label") or row.get("label") or ""),
            str(row.get("log_message") or ""),
        )
    ]
    if not issues:
        return {"sent": False, "skipped": True, "reason": "no_issues", "issue_count": 0}
    return send_issue_digest(issues)


def send_issue_alert(
    *,
    source: str,
    log_message: str,
    label: str,
    method: str,
) -> dict[str, Any]:
    return send_issue_digest(
        [
            {
                "source": source,
                "log_message": log_message,
                "target_label": label,
                "method": method,
            }
        ]
    )
