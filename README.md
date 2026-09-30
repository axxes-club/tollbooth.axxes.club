# Tollbooth

A payment gateway for AXXES workspaces. Hosted checkout, a REST API, signed
webhooks, and payouts to the merchant's own bank account. Card processing is
Stripe's; the API, idempotency, webhook delivery, dashboard and no-code checkout
are ours.

## Surfaces

| Route | What it is |
| --- | --- |
| `/` `/pricing` `/docs` | Marketing site and API reference |
| `/pay/[slug]` | Hosted no-code checkout for a payment link |
| `/pay/complete/[id]` `/pay/cancelled/[id]` | Fallback outcomes for link checkouts |
| `/dashboard` | Overview, onboarding checklist, balance, recent payments |
| `/dashboard/payments` `/refunds` `/customers` | Money: payments, refunds, buyers |
| `/dashboard/products` `/links` | Sell: catalog and no-code checkout pages |
| `/dashboard/webhooks` `/developers` | Build: endpoints with delivery log, API keys |
| `/dashboard/settings` | Payout account, live balance, billing |
| `/api/v1/*` | REST API, `Authorization: Bearer tb_live_…` or `tb_test_…` |
| `/api/pay/[slug]` | Starts a checkout for a payment link (public by design) |
| `/api/webhooks/stripe` | Stripe → Tollbooth (signed) |
| `/api/cron/deliveries` | Retries queued outbound webhooks |
| `/sdk/tollbooth.js` | The SDK, served from this repo so docs can't drift |

## Getting started

```bash
cp .env.example .env.local     # then fill it in
psql "$DATABASE_URL" -f scripts/create-tables.sql
npm run dev
```

The SQL is additive: it only creates `tollbooth_*` tables and never alters the
tables shared with members.axxes.club. It's safe to re-run.

## How money moves

Each workspace gets its own Stripe Express (Connect) account. Checkout is a
destination charge: the payment lands in the merchant's account, and Tollbooth
takes `TOLLBOOTH_FEE_BPS` (default 1%) plus `TOLLBOOTH_FEE_FIXED` as the
application fee. Refunds reverse the transfer and return the proportional fee, so
refunding doesn't cost the merchant twice.

## Test vs live

API keys carry their mode in the prefix — `tb_live_…` and `tb_test_…` — and a
key only authenticates against a row of the same mode, so a mislabelled key fails
closed. A test key uses `STRIPE_SECRET_KEY_TEST` and can only move money inside
Stripe's test mode. Build the whole integration on test keys, then swap in a live
one.

## API

Base URL `https://tollbooth.axxes.club/api/v1`. The whole reference is at `/docs`;
in short:

```bash
curl https://tollbooth.axxes.club/api/v1/checkout-sessions \
  -H "Authorization: Bearer $TOLLBOOTH_KEY" \
  -H "Idempotency-Key: order_1234" \
  -d '{"price":"vip_ticket","customer_email":"buyer@example.com",
       "reference":"order_1234","success_url":"https://yoursite.com/thanks"}'
```

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/checkout-sessions` | Creates a payment and returns `checkout_url` |
| `GET` | `/payments` `/payments/:id` | Filters: status, customer, reference, mode, created range |
| `POST` `GET` | `/refunds` `/refunds/:id` | Full or partial; returns the fee returned |
| `GET` `POST` | `/customers` `/customers/:id` | Auto-created on first payment |
| `GET` `POST` | `/products` `/prices` | Prices are immutable; archive and re-create |
| `GET` `POST` | `/links` | Shareable `/pay/<slug>` checkout |
| `GET` `POST` | `/webhook-endpoints` | Returns `secret` once |
| `GET` | `/webhook-endpoints/:id/deliveries` | Delivery log, for debugging |
| `POST` | `/webhook-endpoints/:id/deliveries/:deliveryId` | Replay one delivery |
| `GET` | `/balance` | Available, pending and next payout, read from Stripe |
| `GET` | `/health` | Unauthenticated liveness probe |

### Reliability

- **Idempotency** — `Idempotency-Key` on any write replays the original response
  rather than charging twice. Reusing a key with a different body is a `400`.
- **Webhooks** — signed with HMAC-SHA256 over `timestamp.body`, so a captured
  delivery can't be replayed. Retried with backoff (6 attempts over ~24h), and an
  endpoint that runs out of attempts is disabled rather than left failing. Every
  attempt is logged and replayable.
- **Rate limits** — 300 reads / 120 writes per minute per key, with
  `x-ratelimit-*` headers and `retry-after` on a `429`.

## SDK

`sdk/` is the published `@tollbooth/sdk`: zero dependencies, ESM, typed via
`.d.ts`. `/sdk/tollbooth.js` serves the same file the docs tell people to import,
so the two can't drift.

```js
import { Tollbooth, verifySignature } from "@tollbooth/sdk"
const tollbooth = new Tollbooth({ apiKey: process.env.TOLLBOOTH_KEY })
const payment = await tollbooth.checkout.create({ price: "vip_ticket" })
```

The SDK adds an idempotency key to every write and retries only network errors,
`429`s and `5xx`s — never a `402` or `404`.

## Env

See `.env.example` for the full annotated list. Required to take payments:
`STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET`.

## Stripe setup

1. Enable Connect (Express) on the platform account.
2. Add `https://tollbooth.axxes.club/api/webhooks/stripe` for
   `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `payment_intent.payment_failed`, `charge.succeeded`, `charge.refunded`,
   `charge.dispute.created`, `charge.dispute.closed`, `payout.paid`, `payout.failed`.
3. Add the same URL as a **Connect** endpoint for `account.updated`.
4. Put both signing secrets in `STRIPE_WEBHOOK_SECRET`, comma-separated.
