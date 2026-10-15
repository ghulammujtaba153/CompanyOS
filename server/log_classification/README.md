# Log classification (hybrid)

Separate backend package for CompanyOS, inspired by the hybrid framework in
[codebasics/project-nlp-log-classification](https://github.com/codebasics/project-nlp-log-classification).

## Run from

Always start the API from the `server/` directory so both `app` and `log_classification` import:

```bash
cd server
.\.venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Pipeline

1. **Regex** — predictable patterns (user actions, backups, security keywords, HTTP errors)
2. **BERT** — `all-MiniLM-L6-v2` embeddings + `models/log_classifier.joblib`
3. **LLM** — CompanyOS Gemini/OpenAI providers (LegacyCRM-style sources try LLM first, then regex/BERT)

Issue labels (`Security Alert`, `Workflow Error`, `Critical Error`, and `HTTP Status` only for 4xx/5xx)
trigger **one batched Brevo digest** to `BREVO_ALERT_TO`.

## API (JWT required)

- `POST /api/v1/log-classification/classify` — JSON `{ "logs": [{ "source", "log_message" }], "alert": true }`
- `POST /api/v1/log-classification/classify-csv` — upload CSV with `source` + `log_message`
- `GET /api/v1/log-classification/status` — BERT / Brevo readiness

## Env

```
# At least one AI provider for LLM fallback / LegacyCRM
GEMINI_API_KEY=
# or OPENAI_API_KEY=
AI_DEFAULT_PROVIDER=gemini

BREVO_API_KEY=
BREVO_SENDER_EMAIL=noreply@yourdomain.com   # must be a verified Brevo sender
BREVO_SENDER_NAME=CompanyOS Alerts
BREVO_ALERT_TO=ghulammujtaba.dro@gmail.com
```

## BERT deps

```bash
pip install sentence-transformers scikit-learn joblib
```

First BERT call downloads `all-MiniLM-L6-v2`. Without these packages, regex + LLM still run.
