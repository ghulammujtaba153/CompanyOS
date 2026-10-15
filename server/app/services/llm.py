from __future__ import annotations

import json
from typing import Any, Literal

import httpx

from app.config import get_settings

Provider = Literal["openai", "gemini"]


def available_providers() -> list[dict[str, Any]]:
    settings = get_settings()
    rows: list[dict[str, Any]] = []
    if settings.openai_configured:
        rows.append(
            {
                "id": "openai",
                "label": "OpenAI",
                "model": settings.ai_openai_model,
                "configured": True,
            }
        )
    else:
        rows.append({"id": "openai", "label": "OpenAI", "model": settings.ai_openai_model, "configured": False})
    if settings.gemini_configured:
        rows.append(
            {
                "id": "gemini",
                "label": "Google Gemini",
                "model": settings.ai_gemini_model,
                "configured": True,
            }
        )
    else:
        rows.append(
            {
                "id": "gemini",
                "label": "Google Gemini",
                "model": settings.ai_gemini_model,
                "configured": False,
            }
        )
    return rows


def resolve_provider(requested: str | None = None) -> Provider | None:
    settings = get_settings()
    choice = (requested or settings.ai_default_provider or "openai").strip().lower()
    if choice not in {"openai", "gemini"}:
        choice = "openai"
    if choice == "openai" and settings.openai_configured:
        return "openai"
    if choice == "gemini" and settings.gemini_configured:
        return "gemini"
    if settings.openai_configured:
        return "openai"
    if settings.gemini_configured:
        return "gemini"
    return None


def chat(
    *,
    system: str,
    user: str,
    provider: str | None = None,
    temperature: float = 0.3,
    json_mode: bool = False,
) -> dict[str, Any]:
    """
    Returns { text, provider, model }.
    Raises RuntimeError when no provider is configured or the upstream call fails.
    """
    resolved = resolve_provider(provider)
    if not resolved:
        raise RuntimeError(
            "No AI provider configured. Set OPENAI_API_KEY and/or GEMINI_API_KEY in server/.env"
        )
    if resolved == "openai":
        return _openai_chat(system=system, user=user, temperature=temperature, json_mode=json_mode)
    return _gemini_chat(system=system, user=user, temperature=temperature, json_mode=json_mode)


def _openai_chat(*, system: str, user: str, temperature: float, json_mode: bool) -> dict[str, Any]:
    settings = get_settings()
    model = settings.ai_openai_model.strip() or "gpt-4o-mini"
    body: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    with httpx.Client(timeout=60.0) as client:
        res = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key.strip()}",
                "Content-Type": "application/json",
            },
            json=body,
        )
    if res.status_code >= 400:
        raise RuntimeError(f"OpenAI error {res.status_code}: {res.text[:300]}")
    data = res.json()
    text = (
        ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
        or ""
    ).strip()
    return {"text": text, "provider": "openai", "model": model}


def _gemini_chat(*, system: str, user: str, temperature: float, json_mode: bool) -> dict[str, Any]:
    settings = get_settings()
    model = settings.ai_gemini_model.strip() or "gemini-2.0-flash"
    key = settings.gemini_api_key.strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    prompt = f"{system}\n\nUser:\n{user}"
    if json_mode:
        prompt += "\n\nRespond with valid JSON only."
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            **({"responseMimeType": "application/json"} if json_mode else {}),
        },
    }
    with httpx.Client(timeout=60.0) as client:
        res = client.post(url, json=body)
    if res.status_code >= 400:
        raise RuntimeError(f"Gemini error {res.status_code}: {res.text[:300]}")
    data = res.json()
    candidates = data.get("candidates") or []
    parts = (((candidates[0] if candidates else {}).get("content") or {}).get("parts") or [])
    text = "".join(str(part.get("text") or "") for part in parts).strip()
    return {"text": text, "provider": "gemini", "model": model}


def parse_json_object(text: str) -> dict[str, Any]:
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:].strip()
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {"value": data}
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            data = json.loads(raw[start : end + 1])
            if isinstance(data, dict):
                return data
        raise
