"""HTTP API for hybrid log classification + Brevo issue alerts + AI tickets."""

from __future__ import annotations

import csv
import io
import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.services.support_tickets import create_tickets_from_log_issues, ticket_to_dict
from log_classification.brevo_alerts import alert_recipient, brevo_configured
from log_classification.classify import classify_records
from log_classification.labels import issue_labels_for_status
from log_classification.processor_bert import bert_status

router = APIRouter(
    prefix="/log-classification",
    tags=["log-classification"],
    dependencies=[Depends(get_current_user)],
)


class LogItem(BaseModel):
    source: str = Field(default="", description="System / service that emitted the log")
    log_message: str = Field(..., min_length=1, description="Raw log line")


class ClassifyRequest(BaseModel):
    logs: list[LogItem]
    alert: bool = Field(default=True, description="Email Brevo for issue labels")
    create_tickets: bool = Field(
        default=True,
        description="Create AI support tickets for each issue label",
    )


class ClassifyResponse(BaseModel):
    count: int
    issues: int
    results: list[dict[str, Any]]
    alert: dict[str, Any] | None = None
    tickets: list[dict[str, Any]] = Field(default_factory=list)


def _unlink(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


def _create_tickets_for_rows(
    db: Session,
    rows: list[dict[str, Any]],
    *,
    enabled: bool,
    user_id,
) -> list[dict[str, Any]]:
    if not enabled:
        return []
    issues = [row for row in rows if row.get("is_issue")]
    if not issues:
        return []
    tickets = create_tickets_from_log_issues(db, issues, created_by_user_id=user_id)
    ticket_dicts = [ticket_to_dict(ticket) for ticket in tickets]
    # Attach first matching ticket key onto each issue row for UI convenience.
    for row, ticket in zip(issues, ticket_dicts):
        row["ticket"] = {
            "id": ticket["id"],
            "ticket_key": ticket["ticket_key"],
            "title": ticket["title"],
            "priority": ticket["priority"],
        }
    return ticket_dicts


@router.get("/status")
def status(_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "bert": bert_status(),
        "brevo_configured": brevo_configured(),
        "alert_to": alert_recipient(),
        "issue_labels": issue_labels_for_status(),
        "tickets_enabled": True,
    }


@router.post("/classify", response_model=ClassifyResponse)
def classify_json(
    body: ClassifyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClassifyResponse:
    if not body.logs:
        raise HTTPException(status_code=400, detail="Provide at least one log.")
    rows = classify_records(
        [{"source": item.source, "log_message": item.log_message} for item in body.logs],
        alert=body.alert,
    )
    tickets = _create_tickets_for_rows(
        db,
        rows,
        enabled=body.create_tickets,
        user_id=user.id,
    )
    digest = None
    for row in rows:
        if row.get("is_issue") and isinstance(row.get("alert"), dict):
            digest = row["alert"]
            break
    return ClassifyResponse(
        count=len(rows),
        issues=sum(1 for row in rows if row.get("is_issue")),
        results=rows,
        alert=digest,
        tickets=tickets,
    )


@router.post("/classify-csv")
async def classify_csv(
    file: UploadFile = File(...),
    alert: bool = True,
    create_tickets: bool = True,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV.")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8.") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "source" not in reader.fieldnames or "log_message" not in reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must contain 'source' and 'log_message' columns.")

    records = [dict(row) for row in reader]
    if not records:
        raise HTTPException(status_code=400, detail="CSV has no data rows.")

    rows = classify_records(records, alert=alert)
    tickets = _create_tickets_for_rows(db, rows, enabled=create_tickets, user_id=user.id)

    out = io.StringIO()
    fieldnames = list(rows[0].keys())
    if "ticket" not in fieldnames and tickets:
        fieldnames.append("ticket")
    writer = csv.DictWriter(out, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        flat = {key: row.get(key) for key in fieldnames}
        if isinstance(flat.get("alert"), dict):
            flat["alert"] = str(flat["alert"])
        if isinstance(flat.get("ticket"), dict):
            flat["ticket"] = flat["ticket"].get("ticket_key") or str(flat["ticket"])
        writer.writerow(flat)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv", prefix="classified_logs_")
    path = tmp.name
    tmp.close()
    Path(path).write_text(out.getvalue(), encoding="utf-8")
    return FileResponse(
        path,
        media_type="text/csv",
        filename="classified_logs.csv",
        background=BackgroundTask(_unlink, path),
    )
