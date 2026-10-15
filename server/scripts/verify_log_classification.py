"""Smoke-test hybrid log classification (auth, samples, optional Brevo)."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from app.main import app
from log_classification.classify import classify_records


def main() -> None:
    path = ROOT / "log_classification" / "resources" / "sample_logs.csv"
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    out = classify_records(rows, alert=False)
    print("--- sample_logs (alert=False) ---")
    for row in out:
        print(
            f"{row['source'][:14]:14} | {row['target_label']:22} | "
            f"{row['method']:8} | issue={row['is_issue']}"
        )
    print("issues", sum(1 for row in out if row["is_issue"]))

    client = TestClient(app)
    assert client.get("/api/v1/log-classification/status").status_code == 401

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "ghulam@acmelabs.io", "password": "demo1234"},
    )
    print("login", login.status_code)
    if login.status_code != 200:
        print(login.text)
        raise SystemExit(1)
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    status = client.get("/api/v1/log-classification/status", headers=headers)
    payload = status.json()
    print(
        "status",
        status.status_code,
        "bert=",
        payload.get("bert", {}).get("available"),
        "alert_to=",
        payload.get("alert_to"),
        "brevo=",
        payload.get("brevo_configured"),
    )

    body = {
        "logs": [
            {"source": "ModernCRM", "log_message": "IP 1.2.3.4 blocked due to potential attack"},
            {"source": "BillingSystem", "log_message": "User 12345 logged in."},
            {"source": "ModernHR", "log_message": "GET /v2/x HTTP/1.1 RCODE 200 len: 1"},
        ],
        "alert": False,
    }
    classified = client.post(
        "/api/v1/log-classification/classify",
        headers=headers,
        json=body,
    )
    data = classified.json()
    print("classify", classified.status_code, "issues", data.get("issues"))
    for row in data.get("results", []):
        print(" ", row["target_label"], row["method"], row["is_issue"])

    # Digest path without necessarily sending if Brevo misconfigured — still exercises code.
    digest_body = {
        "logs": [
            {"source": "ModernCRM", "log_message": "IP 1.2.3.4 blocked due to potential attack"},
        ],
        "alert": True,
    }
    digest = client.post(
        "/api/v1/log-classification/classify",
        headers=headers,
        json=digest_body,
    )
    print("classify+alert", digest.status_code, digest.json().get("alert"))


if __name__ == "__main__":
    main()
