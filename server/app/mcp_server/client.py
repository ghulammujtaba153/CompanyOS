from __future__ import annotations

import json
import os
from typing import Any

import httpx

from app.mcp_server.catalog import TOOL_DEFAULT_PASSPORT


class CompanyOsClient:
    def __init__(self) -> None:
        self.api_url = (os.environ.get("COMPANYOS_API_URL") or "http://127.0.0.1:8000").rstrip("/")
        self.org_id = (os.environ.get("COMPANYOS_ORG_ID") or "").strip()
        self.default_passport = (os.environ.get("COMPANYOS_PASSPORT_ID") or "").strip()
        self._token = (os.environ.get("COMPANYOS_TOKEN") or "").strip()
        self.email = (os.environ.get("COMPANYOS_EMAIL") or "").strip()
        self.password = (os.environ.get("COMPANYOS_PASSWORD") or "").strip()

    def ensure_config(self) -> None:
        if not self.org_id:
            raise RuntimeError("Set COMPANYOS_ORG_ID to your organization UUID.")
        if not self._token and not (self.email and self.password):
            raise RuntimeError(
                "Set COMPANYOS_TOKEN, or COMPANYOS_EMAIL + COMPANYOS_PASSWORD for login."
            )

    def token(self) -> str:
        if self._token:
            return self._token
        with httpx.Client(timeout=30.0) as client:
            res = client.post(
                f"{self.api_url}/api/v1/auth/login",
                json={"email": self.email, "password": self.password},
            )
        if res.status_code >= 400:
            raise RuntimeError(f"Login failed ({res.status_code}): {res.text[:300]}")
        data = res.json()
        self._token = str(data.get("access_token") or "")
        if not self._token:
            raise RuntimeError("Login succeeded but no access_token returned.")
        return self._token

    def invoke(
        self,
        tool_name: str,
        args: dict[str, Any],
        *,
        passport_id: str | None = None,
        provider: str | None = None,
    ) -> dict[str, Any]:
        self.ensure_config()
        passport = (
            (passport_id or "").strip()
            or self.default_passport
            or TOOL_DEFAULT_PASSPORT.get(tool_name)
            or "pp-delivery"
        )
        body: dict[str, Any] = {
            "toolName": tool_name,
            "args": args,
            "passportId": passport,
        }
        if provider:
            body["provider"] = provider
        headers = {
            "Authorization": f"Bearer {self.token()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        with httpx.Client(timeout=180.0) as client:
            res = client.post(
                f"{self.api_url}/api/v1/ai/mcp/invoke",
                params={"organization_id": self.org_id},
                headers=headers,
                json=body,
            )
        if res.status_code >= 400:
            raise RuntimeError(f"MCP invoke failed ({res.status_code}): {res.text[:400]}")
        return res.json()

    def format_result(self, payload: dict[str, Any]) -> str:
        return json.dumps(payload, indent=2, default=str)


_client: CompanyOsClient | None = None


def get_client() -> CompanyOsClient:
    global _client
    if _client is None:
        _client = CompanyOsClient()
    return _client
