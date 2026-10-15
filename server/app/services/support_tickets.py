"""AI-assisted platform support tickets from log classification alerts."""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    SupportTicket,
    SupportTicketPriority,
    SupportTicketStatus,
    User,
)

logger = logging.getLogger(__name__)

_PRIORITY_MAP = {
    "low": SupportTicketPriority.low,
    "medium": SupportTicketPriority.medium,
    "high": SupportTicketPriority.high,
    "critical": SupportTicketPriority.critical,
}


def _next_ticket_key(db: Session) -> str:
    count = db.query(func.count(SupportTicket.id)).scalar() or 0
    return f"SUP-{int(count) + 1:04d}"


def _parse_ai_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        if not match:
            return {}
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}


def draft_ticket_with_ai(*, source: str, log_message: str, label: str, method: str) -> dict[str, Any]:
    """Use CompanyOS LLM to draft a support ticket. Falls back to heuristics."""
    fallback = {
        "title": f"[{label}] Issue from {source or 'unknown source'}",
        "description": (
            f"Automated support ticket from log classification.\n\n"
            f"Source: {source}\n"
            f"Label: {label}\n"
            f"Method: {method}\n\n"
            f"Log message:\n{log_message}"
        ),
        "priority": "high"
        if label in {"Security Alert", "Critical Error"}
        else "medium"
        if label in {"Workflow Error", "HTTP Status"}
        else "low",
        "category": label or "Unclassified",
        "summary": f"{label} detected in {source or 'system'} logs.",
        "suggested_actions": [
            "Confirm whether this is a false positive",
            "Inspect related service health and recent deploys",
            "Notify the owning team and track resolution",
        ],
    }

    prompt = f"""Create a support ticket for this classified application log.
Return JSON only with keys:
title (short),
description (actionable, markdown-friendly),
priority (low|medium|high|critical),
category (short label),
summary (1 sentence),
suggested_actions (array of 2-5 concrete next steps).

Source: {source}
Classification label: {label}
Classification method: {method}
Log message: {log_message}
"""
    try:
        from app.services.llm import chat

        result = chat(
            system="You are a platform ops assistant. Draft clear support tickets from log alerts.",
            user=prompt,
            temperature=0.2,
            json_mode=True,
        )
        data = _parse_ai_json(str(result.get("text") or ""))
        if not data:
            return fallback
        actions = data.get("suggested_actions") or fallback["suggested_actions"]
        if isinstance(actions, str):
            actions = [actions]
        priority = str(data.get("priority") or fallback["priority"]).strip().lower()
        if priority not in _PRIORITY_MAP:
            priority = fallback["priority"]
        return {
            "title": str(data.get("title") or fallback["title"]).strip()[:255],
            "description": str(data.get("description") or fallback["description"]).strip(),
            "priority": priority,
            "category": str(data.get("category") or fallback["category"]).strip()[:80],
            "summary": str(data.get("summary") or fallback["summary"]).strip(),
            "suggested_actions": [str(item).strip() for item in actions if str(item).strip()][:8],
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("AI ticket draft failed: %s", exc)
        return fallback


def create_ticket_from_log_issue(
    db: Session,
    *,
    source: str,
    log_message: str,
    label: str,
    method: str,
    created_by_user_id: UUID | None = None,
) -> SupportTicket:
    draft = draft_ticket_with_ai(
        source=source,
        log_message=log_message,
        label=label,
        method=method,
    )
    ticket = SupportTicket(
        ticket_key=_next_ticket_key(db),
        title=draft["title"],
        description=draft["description"],
        status=SupportTicketStatus.open,
        priority=_PRIORITY_MAP.get(draft["priority"], SupportTicketPriority.medium),
        category=draft["category"],
        source=source or "",
        log_message=log_message or "",
        classification_label=label or "",
        classification_method=method or "",
        ai_summary=draft["summary"],
        ai_suggested_actions=json.dumps(draft["suggested_actions"]),
        created_by_user_id=created_by_user_id,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    try:
        from app.config import get_settings
        from app.services.mailer import send_ticket_email

        alert_to = (get_settings().brevo_alert_to or "").strip()
        if alert_to:
            send_ticket_email(
                to=alert_to,
                ticket_key=ticket.ticket_key,
                title=ticket.title,
                event="New support ticket",
                summary=ticket.ai_summary or "",
                priority=ticket.priority.value if hasattr(ticket.priority, "value") else str(ticket.priority),
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Ticket create email failed: %s", exc)
    return ticket


def create_tickets_from_log_issues(
    db: Session,
    issues: list[dict[str, Any]],
    *,
    created_by_user_id: UUID | None = None,
) -> list[SupportTicket]:
    created: list[SupportTicket] = []
    for row in issues:
        ticket = create_ticket_from_log_issue(
            db,
            source=str(row.get("source") or ""),
            log_message=str(row.get("log_message") or ""),
            label=str(row.get("target_label") or row.get("label") or ""),
            method=str(row.get("method") or "hybrid"),
            created_by_user_id=created_by_user_id,
        )
        created.append(ticket)
    return created


def ticket_to_dict(ticket: SupportTicket) -> dict[str, Any]:
    try:
        actions = json.loads(ticket.ai_suggested_actions or "[]")
        if not isinstance(actions, list):
            actions = []
    except json.JSONDecodeError:
        actions = []
    assignee = ticket.assigned_to
    creator = ticket.created_by
    return {
        "id": str(ticket.id),
        "ticket_key": ticket.ticket_key,
        "title": ticket.title,
        "description": ticket.description,
        "status": ticket.status.value if hasattr(ticket.status, "value") else str(ticket.status),
        "priority": ticket.priority.value if hasattr(ticket.priority, "value") else str(ticket.priority),
        "category": ticket.category,
        "source": ticket.source,
        "log_message": ticket.log_message,
        "classification_label": ticket.classification_label,
        "classification_method": ticket.classification_method,
        "ai_summary": ticket.ai_summary,
        "ai_suggested_actions": actions,
        "assigned_to_user_id": str(ticket.assigned_to_user_id) if ticket.assigned_to_user_id else None,
        "assigned_to_name": assignee.full_name if assignee else None,
        "assigned_to_email": assignee.email if assignee else None,
        "created_by_user_id": str(ticket.created_by_user_id) if ticket.created_by_user_id else None,
        "created_by_name": creator.full_name if creator else None,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
    }


def load_ticket(db: Session, ticket_id: UUID) -> SupportTicket | None:
    return (
        db.query(SupportTicket)
        .options(
            joinedload(SupportTicket.assigned_to),
            joinedload(SupportTicket.created_by),
        )
        .filter(SupportTicket.id == ticket_id)
        .first()
    )
