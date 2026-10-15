-- CompanyOS role model on Neon Postgres
-- Roles:
--   platform_admin  → global admin (users.account_type)
--   owner           → purchaser of a society (organization_members.role)
--   admin / member  → invited society members
--   client          → portal user via client_users

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(200) NOT NULL DEFAULT '',
  account_type VARCHAR(32) NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  legal_name VARCHAR(255) NOT NULL DEFAULT '',
  tagline VARCHAR(255) NOT NULL DEFAULT '',
  website VARCHAR(255) NOT NULL DEFAULT '',
  industry VARCHAR(120) NOT NULL DEFAULT 'Software agency',
  company_size VARCHAR(40) NOT NULL DEFAULT '11–50',
  headquarters VARCHAR(255) NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  contact_email VARCHAR(320) NOT NULL DEFAULT '',
  contact_phone VARCHAR(64) NOT NULL DEFAULT '',
  workspace_label VARCHAR(120) NOT NULL DEFAULT 'Software agency',
  logo_url VARCHAR(800) NOT NULL DEFAULT '',
  logo_public_id VARCHAR(255) NOT NULL DEFAULT '',
  purchaser_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL DEFAULT 'member',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  source VARCHAR(32) NOT NULL DEFAULT 'invite',
  title VARCHAR(160) NOT NULL DEFAULT '',
  department VARCHAR(120) NOT NULL DEFAULT '',
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_member_user UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'member',
  token VARCHAR(64) NOT NULL UNIQUE,
  invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  company VARCHAR(200) NOT NULL,
  email VARCHAR(320) NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  website VARCHAR(255) NOT NULL DEFAULT '',
  industry VARCHAR(120) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'prospect',
  notes TEXT NOT NULL DEFAULT '',
  internal_owner_member_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_client_user UNIQUE (client_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);
CREATE INDEX IF NOT EXISTS ix_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS ix_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS ix_clients_org ON clients(organization_id);
CREATE INDEX IF NOT EXISTS ix_invites_token ON invites(token);
