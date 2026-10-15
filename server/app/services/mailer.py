"""Shared Brevo mailer (SMTP key or API key) for invites, tickets, and alerts."""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def mail_settings() -> dict[str, Any]:
    from app.config import get_settings

    settings = get_settings()
    return {
        "api_key": (settings.brevo_api_key or "").strip(),
        "smtp_login": (settings.brevo_smtp_login or "").strip(),
        "smtp_host": (settings.brevo_smtp_host or "smtp-relay.brevo.com").strip(),
        "smtp_port": int(settings.brevo_smtp_port or 587),
        "sender_email": (settings.brevo_sender_email or "").strip(),
        "sender_name": (settings.brevo_sender_name or "CompanyOS").strip() or "CompanyOS",
        "site_url": (settings.site_url or "http://localhost:3000").rstrip("/"),
    }


def mail_configured() -> bool:
    snap = mail_settings()
    if not snap["api_key"] or not snap["sender_email"]:
        return False
    key = str(snap["api_key"])
    if key.startswith("xsmtpsib-"):
        return bool(snap["smtp_login"])
    return True


def absolute_app_url(path: str) -> str:
    base = mail_settings()["site_url"]
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{base}{path}"


def _transport_mode(api_key: str, smtp_login: str) -> str:
    if api_key.startswith("xsmtpsib-"):
        return "smtp"
    if api_key.startswith("xkeysib-"):
        return "api"
    return "smtp" if smtp_login else "api"


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
) -> dict[str, Any]:
    """Send one transactional email. Returns {sent, reason?, detail?, transport?}."""
    to_addr = (to or "").strip().lower()
    if not to_addr:
        return {"sent": False, "skipped": True, "reason": "missing_recipient"}

    snap = mail_settings()
    if not snap["api_key"] or not snap["sender_email"]:
        logger.warning("Mail not configured — would send '%s' to %s", subject, to_addr)
        return {"sent": False, "skipped": True, "reason": "mail_not_configured", "to": to_addr}

    plain = text if text is not None else _html_to_text(html)
    mode = _transport_mode(str(snap["api_key"]), str(snap["smtp_login"]))
    if mode == "smtp":
        return _send_smtp(snap=snap, to=to_addr, subject=subject, html=html, text=plain)
    return _send_api(snap=snap, to=to_addr, subject=subject, html=html, text=plain)


def _html_to_text(html: str) -> str:
    import re

    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"</p>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _send_smtp(
    *,
    snap: dict[str, Any],
    to: str,
    subject: str,
    html: str,
    text: str,
) -> dict[str, Any]:
    login = str(snap["smtp_login"] or "").strip()
    if not login:
        return {
            "sent": False,
            "skipped": True,
            "reason": "brevo_smtp_login_missing",
            "to": to,
        }
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f'{snap["sender_name"]} <{snap["sender_email"]}>'
    message["To"] = to
    message.attach(MIMEText(text, "plain", "utf-8"))
    message.attach(MIMEText(html, "html", "utf-8"))
    try:
        with smtplib.SMTP(str(snap["smtp_host"]), int(snap["smtp_port"]), timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(login, str(snap["api_key"]))
            server.sendmail(str(snap["sender_email"]), [to], message.as_string())
        logger.info("Email sent via SMTP to %s (%s)", to, subject)
        return {"sent": True, "skipped": False, "transport": "smtp", "to": to}
    except Exception as exc:  # noqa: BLE001
        logger.exception("SMTP send failed to %s", to)
        return {"sent": False, "skipped": False, "reason": "smtp_error", "detail": str(exc), "to": to}


def _send_api(
    *,
    snap: dict[str, Any],
    to: str,
    subject: str,
    html: str,
    text: str,
) -> dict[str, Any]:
    payload = {
        "sender": {"name": snap["sender_name"], "email": snap["sender_email"]},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text,
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(
                BREVO_API_URL,
                headers={
                    "api-key": snap["api_key"],
                    "accept": "application/json",
                    "content-type": "application/json",
                },
                json=payload,
            )
        if response.status_code >= 400:
            logger.error("Brevo API send failed (%s): %s", response.status_code, response.text[:500])
            return {
                "sent": False,
                "skipped": False,
                "reason": "brevo_error",
                "status_code": response.status_code,
                "detail": response.text[:500],
                "to": to,
            }
        data = response.json() if response.content else {}
        logger.info("Email sent via Brevo API to %s (%s)", to, subject)
        return {
            "sent": True,
            "skipped": False,
            "transport": "api",
            "message_id": data.get("messageId"),
            "to": to,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Brevo API request failed to %s", to)
        return {"sent": False, "skipped": False, "reason": "request_failed", "detail": str(exc), "to": to}


def send_invite_email(
    *,
    to: str,
    organization_name: str,
    role: str,
    invite_path: str,
    inviter_name: str = "",
    user_exists: bool = False,
) -> dict[str, Any]:
    link = absolute_app_url(invite_path)
    org = escape(organization_name)
    who = escape(inviter_name) if inviter_name else "A teammate"
    action = "sign in to join" if user_exists else "create your account"
    subject = f"You're invited to {organization_name} on CompanyOS"
    html = f"""
    <h2>Join {org}</h2>
    <p>{who} invited you as <strong>{escape(role)}</strong>.</p>
    <p>Open this link to {escape(action)}:</p>
    <p><a href="{escape(link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;
      border-radius:8px;text-decoration:none">Accept invite</a></p>
    <p style="color:#71717a;font-size:12px">Or paste: {escape(link)}</p>
    """
    text = (
        f"Join {organization_name} on CompanyOS\n\n"
        f"{inviter_name or 'A teammate'} invited you as {role}.\n"
        f"Accept: {link}\n"
    )
    return send_email(to=to, subject=subject, html=html, text=text)


def send_welcome_email(*, to: str, full_name: str, organization_name: str) -> dict[str, Any]:
    link = absolute_app_url("/login")
    subject = f"Welcome to {organization_name}"
    html = f"""
    <h2>Welcome{', ' + escape(full_name) if full_name else ''}</h2>
    <p>You&apos;re in <strong>{escape(organization_name)}</strong> on CompanyOS.</p>
    <p><a href="{escape(link)}">Sign in anytime</a></p>
    """
    text = f"Welcome to {organization_name}. Sign in: {link}\n"
    return send_email(to=to, subject=subject, html=html, text=text)


def send_ticket_email(
    *,
    to: str,
    ticket_key: str,
    title: str,
    event: str,
    summary: str = "",
    priority: str = "",
    admin_path: str = "/admin/tickets",
) -> dict[str, Any]:
    link = absolute_app_url(admin_path)
    subject = f"[CompanyOS] {ticket_key}: {event}"
    html = f"""
    <h2>{escape(ticket_key)}</h2>
    <p><strong>{escape(event)}</strong></p>
    <p>{escape(title)}</p>
    {f'<p>{escape(summary)}</p>' if summary else ''}
    {f'<p>Priority: <strong>{escape(priority)}</strong></p>' if priority else ''}
    <p><a href="{escape(link)}">Open support tickets</a></p>
    """
    text = f"{ticket_key} — {event}\n{title}\n{summary}\n{link}\n"
    return send_email(to=to, subject=subject, html=html, text=text)
