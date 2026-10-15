from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "CompanyOS API"
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    host: str = "0.0.0.0"
    port: int = 8000

    # Neon Postgres — paste the pooled or direct connection string from the Neon console.
    database_url: str = ""
    auto_create_schema: bool = True
    seed_on_startup: bool = True

    # Platform admin console credentials (seeded / upserted on startup).
    admin_email: str = "admin@companyos.io"
    admin_password: str = "admin1234"

    jwt_secret: str = "dev-change-me-companyos-jwt-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7

    # Cloudinary (Dashboard → Settings → API Keys)
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    cloudinary_folder: str = "companyos"
    # Optional: unsigned Upload Preset name (Settings → Upload → Upload presets).
    # Use this if your API key lacks "create" permission.
    cloudinary_upload_preset: str = ""

    # Public site URL (Checkout success/cancel + Customer Portal return)
    site_url: str = "http://localhost:3000"

    # Stripe Billing — https://dashboard.stripe.com/apikeys
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    # Optional: pre-created Price IDs. When empty, Checkout uses inline price_data.
    stripe_price_starter: str = ""
    stripe_price_growth: str = ""
    stripe_price_scale: str = ""

    # AI providers — OpenAI and/or Google Gemini
    openai_api_key: str = ""
    gemini_api_key: str = ""
    ai_default_provider: str = "openai"  # openai | gemini
    ai_openai_model: str = "gpt-4o-mini"
    ai_gemini_model: str = "gemini-2.5-flash"
    ai_embedding_provider: str = "openai"  # openai | gemini
    ai_openai_embedding_model: str = "text-embedding-3-small"
    ai_gemini_embedding_model: str = "gemini-embedding-001"

    # Pinecone vector store for Company Brain RAG
    pinecone_api_key: str = ""
    pinecone_index: str = "companyos-docs"
    pinecone_cloud: str = "aws"
    pinecone_region: str = "us-east-1"
    pinecone_dimension: int = 1536
    pinecone_metric: str = "cosine"
    # Query engine: llamaindex (default) | pinecone (raw client fallback)
    rag_retrieval_engine: str = "llamaindex"
    # Answer engine: langgraph (default) | direct (legacy linear path via same fallback)
    rag_answer_engine: str = "langgraph"

    # Brevo transactional email — SMTP key (xsmtpsib-…) or API key (xkeysib-…).
    # Used by log_classification alerts (and future mailers).
    brevo_api_key: str = ""
    brevo_smtp_login: str = ""  # e.g. ****@smtp-brevo.com (required for SMTP keys)
    brevo_smtp_host: str = "smtp-relay.brevo.com"
    brevo_smtp_port: int = 587
    brevo_sender_email: str = ""
    brevo_sender_name: str = "CompanyOS Alerts"
    brevo_alert_to: str = "ghulammujtaba.dro@gmail.com"

    # Optional Groq key if you prefer Groq for LegacyCRM-style LLM classify
    groq_api_key: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def cloudinary_configured(self) -> bool:
        if not self.cloudinary_cloud_name.strip():
            return False
        if self.cloudinary_upload_preset.strip():
            return True
        return bool(self.cloudinary_api_key.strip() and self.cloudinary_api_secret.strip())

    @property
    def stripe_configured(self) -> bool:
        return bool(self.stripe_secret_key.strip())

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key.strip())

    @property
    def ai_configured(self) -> bool:
        return self.openai_configured or self.gemini_configured

    @property
    def pinecone_configured(self) -> bool:
        return bool(self.pinecone_api_key.strip() and self.pinecone_index.strip())

    @property
    def brevo_configured(self) -> bool:
        return bool(self.brevo_api_key.strip() and self.brevo_sender_email.strip())

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url.strip()
        if not url:
            raise RuntimeError(
                "DATABASE_URL is not set. Add your Neon Postgres connection string to server/.env"
            )
        # SQLAlchemy + psycopg3 prefers postgresql+psycopg://
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://") and "+psycopg" not in url:
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        # channel_binding can slow/break some Neon + psycopg handshakes
        url = url.replace("channel_binding=require&", "").replace("&channel_binding=require", "")
        url = url.replace("?channel_binding=require", "")
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
