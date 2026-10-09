# Security admission migration

Apply `security-rate-limits.sql` through the normal database migration process before deploying these changes. The application denies admission when the table/database is unavailable. This file stages SQL only and does not apply it.

The counters use atomic PostgreSQL upserts and hash caller identifiers before storage. Each counter update atomically prunes at most 20 other rows expired more than one hour ago, preserving the current counter; the expiry index bounds the lookup. Configure database connection/query timeouts through the existing adapter. Payments requires `DATABASE_URL` for its admission store.

For Qortr/afters configure `TRUSTED_PROXY_HOPS` only after verifying the ingress chain, counted from the right of `x-forwarded-for`; leave it unset when the chain is unknown. Unconfigured or malformed forwarding uses one anonymous shared bucket. Do not accept caller-provided forwarding directly.

Afters reminder claims are durable at-most-once dispatch: failed notification delivery after a claim needs operator followup. No automatic retry deletes the claim. Qortr physical sticker orders require `Idempotency-Key`, cap 20 units/order and 100 free units/user/UTC calendar month. Use the same key when retrying identical checkout details.
