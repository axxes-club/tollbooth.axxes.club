-- Tollbooth tables. Additive only: creates tollbooth_* tables, never alters shared ones.
create table if not exists tollbooth_accounts (
  tenant_id uuid primary key,
  stripe_account_id text not null unique,
  charges_enabled integer not null default 0,
  payouts_enabled integer not null default 0,
  details_submitted integer not null default 0,
  country text,
  default_currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tollbooth_api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  created_by_id text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tollbooth_api_keys_tenant_idx on tollbooth_api_keys (tenant_id);

create table if not exists tollbooth_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  api_key_id uuid,
  status text not null default 'pending',
  amount integer not null,
  currency text not null,
  application_fee integer not null default 0,
  amount_refunded integer not null default 0,
  description text,
  customer_email text,
  reference text,
  metadata jsonb default '{}'::jsonb,
  checkout_session_id text,
  checkout_url text,
  payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tollbooth_payments_tenant_idx on tollbooth_payments (tenant_id, created_at);
create unique index if not exists tollbooth_payments_session_idx on tollbooth_payments (checkout_session_id);

create table if not exists tollbooth_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
