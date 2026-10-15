from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.db.base import Base


def ensure_schema(engine: Engine) -> None:
    """Create missing tables and add new columns for existing Neon DBs."""
    Base.metadata.create_all(bind=engine)
    statements = [
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url VARCHAR(800) NOT NULL DEFAULT ''",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_public_id VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS role_permissions TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS department_id UUID",
        "ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS manager_id UUID",
        "ALTER TABLE invites ADD COLUMN IF NOT EXISTS full_name VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE invites ADD COLUMN IF NOT EXISTS title VARCHAR(160) NOT NULL DEFAULT ''",
        "ALTER TABLE invites ADD COLUMN IF NOT EXISTS department VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE invites ADD COLUMN IF NOT EXISTS department_id UUID",
        "ALTER TABLE invites ADD COLUMN IF NOT EXISTS manager_id UUID",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_id VARCHAR(40) NOT NULL DEFAULT ''",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(40) NOT NULL DEFAULT ''",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS renews_on VARCHAR(10) NOT NULL DEFAULT ''",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payment_brand VARCHAR(40) NOT NULL DEFAULT ''",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payment_last4 VARCHAR(8) NOT NULL DEFAULT ''",
        "ALTER TABLE vault_documents ADD COLUMN IF NOT EXISTS project_id UUID",
        "CREATE INDEX IF NOT EXISTS ix_vault_documents_project_id ON vault_documents (project_id)",
    ]
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
