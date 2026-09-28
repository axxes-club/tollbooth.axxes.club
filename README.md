# Tollbooth — AXXES payments

Payment gateway for AXXES workspaces, powered by Stripe Connect (same Stripe account as afters.am).

- `/` `/pricing` `/docs` — public launch site
- `/dashboard` — payments, API keys, payout onboarding (AXXES account via Handshake, workspace-scoped)
- `/api/v1` — REST API for apps (`Authorization: Bearer tb_live_…`): checkout sessions, payments, refunds
- `/api/webhooks/stripe` — signed Stripe webhooks (platform + connected-account events)

Money flow: each workspace gets a Stripe Express account; Checkout uses destination charges with a Tollbooth application fee (`TOLLBOOTH_FEE_BPS`, default 100 = 1%, plus `TOLLBOOTH_FEE_FIXED` minor units).

Tables: `tollbooth_accounts`, `tollbooth_api_keys`, `tollbooth_payments`, `tollbooth_events` in the shared AXXES database (additive only — `scripts/create-tables.sql`).

## Env

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Shared AXXES database and auth |
| `AUTH_COOKIE_DOMAIN`, `HANDSHAKE_URL` | Central sign-in (see handshake.axxes.club) |
| `STRIPE_SECRET_KEY` | Platform secret key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/webhooks/stripe` |
| `TOLLBOOTH_FEE_BPS`, `TOLLBOOTH_FEE_FIXED` | Platform fee |

## Stripe setup

1. Enable Connect (Express) on the Stripe account.
2. Add a webhook endpoint `https://tollbooth.axxes.club/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, and — as a Connect endpoint — `account.updated`. Put both signing secrets in `STRIPE_WEBHOOK_SECRET`, comma-separated.
