# CompanyOS API (FastAPI + Neon Postgres)

Backend for CompanyOS: **platform admin**, **society owner** (purchaser + invited members), and **client** portal users.

## Roles

| Persona | Where it lives | Meaning |
|---------|----------------|---------|
| Platform admin | `users.account_type = platform_admin` | Sees all societies |
| Owner | `organization_members.role = owner` | Bought the society; billing/control |
| Admin / Member | `organization_members.role` | Invited into the society |
| Client | `client_users` | External client portal login |

## Neon setup

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. Copy the connection string (prefer **pooled** + `sslmode=require`).
3. Put it in `server/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
JWT_SECRET=change-me
AUTO_CREATE_SCHEMA=true
SEED_ON_STARTUP=true
```

Schema SQL (optional manual apply): `sql/001_schema.sql`. With `AUTO_CREATE_SCHEMA=true`, tables are created on startup.

## Setup

```bash
cd server
python -m venv .venv
.\.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env            # then paste DATABASE_URL
```

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Docs: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

## Seed accounts (when SEED_ON_STARTUP=true)

Platform admin is taken from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` (defaults below).
After login, platform admins land on `/admin`.

| Email | Password | Role |
|-------|----------|------|
| `ADMIN_EMAIL` (default `admin@companyos.io`) | `ADMIN_PASSWORD` (default `admin1234`) | Platform admin → `/admin` |
| `ghulam@acmelabs.io` | `demo1234` | Owner (Acme Labs) |
| `maya@acmelabs.io` | `demo1234` | Society admin |
| `daniel@acmelabs.io` | `demo1234` | Society member |
| `sara@auroraretail.com` | `demo1234` | Client |

## Auth & org API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register-owner` | Create owner + society |
| POST | `/api/v1/auth/login` | JWT login |
| GET | `/api/v1/auth/me` | Profile + memberships + client links |
| GET | `/api/v1/auth/invites/{token}` | Peek invite |
| POST | `/api/v1/auth/accept-invite` | Join society |
| GET | `/api/v1/organizations` | List societies |
| GET | `/api/v1/organizations/{id}/members` | Members |
| POST | `/api/v1/organizations/{id}/invites` | Invite admin/member |
| GET/POST | `/api/v1/clients?organization_id=` | Clients for a society |

## Agency settings + Cloudinary logos

| Method | Path | Description |
|--------|------|-------------|
| GET/PATCH | `/api/v1/organizations/{id}` | Load / save agency profile |
| POST | `/api/v1/organizations/{id}/logo` | Upload logo (`multipart/form-data` field `file`) |
| DELETE | `/api/v1/organizations/{id}/logo` | Remove logo from Cloudinary + DB |

Set in `server/.env`:

```env
CLOUDINARY_CLOUD_NAME=your_cloud
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
CLOUDINARY_FOLDER=companyos
```

If uploads fail with `missing permissions (actions=["create"])`:

1. Console → **Settings → API Keys** → create/use a key with Upload / Assets **create** permission, **or**
2. Console → **Settings → Upload → Upload presets** → create an **Unsigned** preset, then set `CLOUDINARY_UPLOAD_PRESET=that_preset_name` and restart the API.

Frontend: set `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` in `client/.env`.

## Log classification (hybrid + Brevo alerts)

Package: `server/log_classification/` (regex → BERT → LLM). Issue labels send **one batched Brevo digest** to `BREVO_ALERT_TO`. JWT auth required.
UI: **AI & automation → Log classification**. Run uvicorn from `server/`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/log-classification/status` | BERT / Brevo readiness (auth) |
| POST | `/api/v1/log-classification/classify` | JSON classify + optional digest (auth) |
| POST | `/api/v1/log-classification/classify-csv` | CSV upload (`source`, `log_message`) (auth) |

```env
GEMINI_API_KEY=                    # or OPENAI_API_KEY
BREVO_API_KEY=
BREVO_SENDER_EMAIL=noreply@yourdomain.com   # verified Brevo sender
BREVO_SENDER_NAME=CompanyOS Alerts
BREVO_ALERT_TO=ghulammujtaba.dro@gmail.com
```

BERT path: `pip install sentence-transformers scikit-learn joblib`. See `log_classification/README.md`.
