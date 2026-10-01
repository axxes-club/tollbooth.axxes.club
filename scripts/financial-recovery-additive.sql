-- Nullable operation ownership only; preserves every existing payment/refund.
ALTER TABLE tollbooth_payments ADD COLUMN IF NOT EXISTS pending_refund_id uuid;
ALTER TABLE tollbooth_idempotency_keys ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE tollbooth_idempotency_keys ADD COLUMN IF NOT EXISTS mode text;
