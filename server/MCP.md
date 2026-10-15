# CompanyOS MCP server

Stdio MCP server that exposes CompanyOS tools to Cursor / Claude Desktop. Every call is proxied to `POST /api/v1/ai/mcp/invoke` and gated by governance passports.

## Prerequisites

1. API running: `uvicorn app.main:app --reload --port 8000`
2. Python deps installed in `server/.venv` (includes `mcp`)
3. Org UUID + login (demo: `ghulam@acmelabs.io` / `demo1234`)

## Attach link (HTTP)

```
http://127.0.0.1:8765/mcp
```

Start the MCP HTTP server (API must already be on `:8000`):

```powershell
cd server
$env:COMPANYOS_MCP_TRANSPORT="http"
$env:COMPANYOS_API_URL="http://127.0.0.1:8000"
$env:COMPANYOS_ORG_ID="5f13f592-1e8e-4022-832b-aa61236583d3"
$env:COMPANYOS_EMAIL="ghulam@acmelabs.io"
$env:COMPANYOS_PASSWORD="demo1234"
.\.venv\Scripts\python.exe -m app.mcp_server
```

Then in Cursor → Settings → MCP → Add server → paste that URL (or use `.cursor/mcp.json`).

## Attach in Cursor (stdio fallback)

Project config is at [`.cursor/mcp.json`](../.cursor/mcp.json) (`companyos-stdio`).

1. Keep the FastAPI server running on port 8000
2. Cursor → Settings → MCP → enable **companyos** or **companyos-stdio**
3. Reload the window if tools don’t appear

## Run manually (stdio)

```powershell
cd server
.\.venv\Scripts\python.exe -m app.mcp_server
```

Env vars (see `.env.mcp.example`):

| Var | Purpose |
|---|---|
| `COMPANYOS_API_URL` | API base (default `http://127.0.0.1:8000`) |
| `COMPANYOS_ORG_ID` | Organization UUID |
| `COMPANYOS_EMAIL` / `COMPANYOS_PASSWORD` | Login |
| `COMPANYOS_TOKEN` | Or paste a JWT instead of email/password |
| `COMPANYOS_PASSPORT_ID` | Optional forced passport |

## Tools

- `ask_company_brain`, `search_documents`
- `create_project`, `create_issue`, `update_issue_status`, `assign_issue`
- `list_candidates`, `move_candidate_stage`, `draft_offer`
- `start_onboarding_checklist`
- `create_client_note`, `summarize_engagement`
- `companyos_status`
