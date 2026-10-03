-- Tollbooth schema. Additive only: touches tollbooth_* tables and nothing shared with
-- members.axxes.club. Every statement is idempotent, so this is safe to re-run against an
-- existing deployment — the ALTER block at the bottom upgrades tables that already exist.
-- Apply with: psql "$DATABASE_URL" -f scripts/create-tables.sql

-- ─── Payout accounts ───────────────────────────────────────────────────────────
-- One Stripe Connect account per workspace: where that workspace's money lands.
create table if not exists tollbooth_accounts (
  tenant_id uuid primary key,
  stripe_account_id text not null unique,
  charges_enabled integer not null default 0,
  payouts_enabled integer not null default 0,
  details_submitted integer not null default 0,
  country text,
  default_currency text,
  charges_disabled_reason text,
  requirements_due jsonb not null default '[]'::jsonb,
  balance_available integer not null default 0,
  balance_pending integer not null default 0,
  next_payout_at timestamptz,
  payout_schedule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── API keys ──────────────────────────────────────────────────────────────────
-- Only a SHA-256 hash is stored. The prefix carries the mode, so a key is self-describing.
create table if not exists tollbooth_api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  mode text not null default 'live',
  scopes jsonb not null default '["payments:write"]'::jsonb,
  created_by_id text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tollbooth_api_keys_tenant_idx on tollbooth_api_keys (tenant_id);

-- ─── Catalog ───────────────────────────────────────────────────────────────────
-- A product is what you sell; a price is how much for it. Prices are left alone once a
-- payment exists, so historical receipts never change meaning.
create table if not exists tollbooth_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text,
  email text not null,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  first_paid_at timestamptz,
  total_spent integer not null default 0,
  payment_count integer not null default 0,
  last_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tollbooth_customers_tenant_idx on tollbooth_customers (tenant_id, created_at);
create index if not exists tollbooth_customers_email_idx on tollbooth_customers (tenant_id, email);

create table if not exists tollbooth_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  description text,
  image_url text,
  active integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tollbooth_products_tenant_idx on tollbooth_products (tenant_id, created_at);

create table if not exists tollbooth_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid references tollbooth_products (id) on delete cascade,
  nickname text,
  amount integer not null,
  currency text not null default 'usd',
  lookup_key text,
  active integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tollbooth_prices_tenant_idx on tollbooth_prices (tenant_id, created_at);
create unique index if not exists tollbooth_prices_lookup_idx on tollbooth_prices (tenant_id, lookup_key);

-- Payment links: a shareable /pay/<slug> URL that sells a price with no code at all.
create table if not exists tollbooth_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  price_id uuid references tollbooth_prices (id) on delete set null,
  slug text not null,
  name text not null,
  success_url text,
  cancel_url text,
  allow_quantity integer not null default 0,
  active integer not null default 1,
  view_count integer not null default 0,
  payment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tollbooth_links_slug_idx on tollbooth_links (slug);
create index if not exists tollbooth_links_tenant_idx on tollbooth_links (tenant_id, created_at);

-- ─── Payments ──────────────────────────────────────────────────────────────────
create table if not exists tollbooth_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  api_key_id uuid,
  status text not null default 'pending',
  amount integer not null,
  currency text not null,
  application_fee integer not null default 0,
  amount_refunded integer not null default 0,
  net_fee integer not null default 0,
  description text,
  customer_email text,
  customer_id uuid references tollbooth_customers (id) on delete set null,
  price_id uuid references tollbooth_prices (id) on delete set null,
  link_id uuid references tollbooth_links (id) on delete set null,
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  source text not null default 'api',
  mode text not null default 'live',
  checkout_session_id text,
  checkout_url text,
  payment_intent_id text,
  charge_id text,
  success_url text,
  expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tollbooth_payments_tenant_idx on tollbooth_payments (tenant_id, created_at);
create unique index if not exists tollbooth_payments_session_idx on tollbooth_payments (checkout_session_id);
create index if not exists tollbooth_payments_reference_idx on tollbooth_payments (tenant_id, reference);
create index if not exists tollbooth_payments_charge_idx on tollbooth_payments (charge_id);

-- Every refund is its own row, so the merchant can see history and reasons.
create table if not exists tollbooth_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  payment_id uuid not null references tollbooth_payments (id) on delete cascade,
  stripe_refund_id text,
  amount integer not null,
  currency text not null,
  fee_returned integer not null default 0,
  reason text,
  note text,
  status text not null default 'succeeded',
  api_key_id uuid,
  created_by_kind text not null default 'api',
  created_at timestamptz not null default now()
);
create index if not exists tollbooth_refunds_tenant_idx on tollbooth_refunds (tenant_id, created_at);
create index if not exists tollbooth_refunds_payment_idx on tollbooth_refunds (payment_id);

-- ─── Inbound events ────────────────────────────────────────────────────────────
-- Stripe events already handled, so webhook retries are idempotent.
create table if not exists tollbooth_events (
  id text primary key,
  type text not null,
  account text,
  livemode integer not null default 1,
  received_at timestamptz not null default now()
);

-- ─── Outbound webhooks ─────────────────────────────────────────────────────────
create table if not exists tollbooth_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  url text not null,
  description text,
  secret text not null,
  events jsonb not null default '["*"]'::jsonb,
  mode text not null default 'live',
  enabled integer not null default 1,
  created_by_id text not null,
  last_delivery_at timestamptz,
  last_delivery_status text,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tollbooth_webhook_endpoints_tenant_idx on tollbooth_webhook_endpoints (tenant_id, created_at);

-- One row per delivery attempt, so merchants can inspect and replay failures.
create table if not exists tollbooth_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references tollbooth_webhook_endpoints (id) on delete cascade,
  tenant_id uuid not null,
  event_id text not null,
  event_type text not null,
  payload jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  response_status integer,
  response_body text,
  error text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tollbooth_webhook_deliveries_endpoint_idx on tollbooth_webhook_deliveries (endpoint_id, created_at);
create index if not exists tollbooth_webhook_deliveries_retry_idx on tollbooth_webhook_deliveries (status, next_attempt_at);

-- ─── Idempotency ───────────────────────────────────────────────────────────────
-- Replays of an Idempotency-Key, so a retried request returns the first response
-- instead of creating a second charge.
create table if not exists tollbooth_idempotency_keys (
  key text primary key,
  tenant_id uuid not null,
  api_key_id uuid,
  method text not null,
  path text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  locked_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists tollbooth_idempotency_tenant_idx on tollbooth_idempotency_keys (tenant_id);

-- ─── Upgrades from earlier versions ────────────────────────────────────────────
-- `create table if not exists` is a no-op on a table that already exists, so every
-- column added after a table first shipped has to be added here. All additive:
-- nullable or constant default, so no table rewrite and no blocking lock.
alter table tollbooth_accounts add column if not exists charges_disabled_reason text;
alter table tollbooth_accounts add column if not exists requirements_due jsonb not null default '[]'::jsonb;
alter table tollbooth_accounts add column if not exists balance_available integer not null default 0;
alter table tollbooth_accounts add column if not exists balance_pending integer not null default 0;
alter table tollbooth_accounts add column if not exists next_payout_at timestamptz;
alter table tollbooth_accounts add column if not exists payout_schedule text;

alter table tollbooth_api_keys add column if not exists mode text not null default 'live';
alter table tollbooth_api_keys add column if not exists scopes jsonb not null default '["payments:write"]'::jsonb;

alter table tollbooth_payments add column if not exists net_fee integer not null default 0;
alter table tollbooth_payments add column if not exists customer_id uuid references tollbooth_customers (id) on delete set null;
alter table tollbooth_payments add column if not exists price_id uuid references tollbooth_prices (id) on delete set null;
alter table tollbooth_payments add column if not exists link_id uuid references tollbooth_links (id) on delete set null;
alter table tollbooth_payments add column if not exists source text not null default 'api';
alter table tollbooth_payments add column if not exists mode text not null default 'live';
alter table tollbooth_payments add column if not exists charge_id text;
alter table tollbooth_payments add column if not exists success_url text;
alter table tollbooth_payments add column if not exists expires_at timestamptz;
alter table tollbooth_payments add column if not exists last_error text;

alter table tollbooth_events add column if not exists account text;
alter table tollbooth_events add column if not exists livemode integer not null default 1;

-- Durable ownership of an unresolved refund; no financial balance is pre-settled.
alter table tollbooth_payments add column if not exists pending_refund_id uuid;
alter table tollbooth_idempotency_keys add column if not exists lease_token uuid;
alter table tollbooth_idempotency_keys add column if not exists mode text;
