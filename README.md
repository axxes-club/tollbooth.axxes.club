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
npm run db:migrate             # or: psql "$DATABASE_URL" -f scripts/create-tables.sql
npm run dev
```

## Tests

```bash
npm test                    # compile and run unit and database-backed suites
npm run test:watch          # same, in watch mode
npm run verify              # typecheck + tests + the checks below + a build
```

No test framework was added: the suite runs on Node's built-in `node:test`, so it
costs nothing to run. `tsc` compiles the app and the tests to `.test-build/`, and
`test/register.cjs` supplies the three things Next normally provides — the `@/`
alias, the `server-only` marker, and a recording stand-in for the Stripe SDK. That
means the money logic is exercised without network access and without real money.

| Suite | Covers |
| --- | --- |
| `fees` | Fee arithmetic, refunds, zero-decimal currencies, UUID guards |
| `api-keys` | Key minting, mode prefixes, scope enforcement, constant-time compare |
| `signing` | Webhook signature verification, tampering, replay windows |
| `checkout` | Creating a checkout, payment lifecycle, URL validation |
| `refunds` | Full and partial refunds, fee returned, reservation races |
| `webhook-delivery` | Real HTTP delivery: headers, signature, retries, auto-disable |
| `stripe-webhook` | Inbound Stripe events, signature rejection, idempotency |
| `api` | Every wrapper an endpoint inherits, plus per-endpoint validation |
| `sdk` | The published client: idempotency keys, retries, verification |
| `slugs` | Link slug generation and collision handling |

Tests run against the real database, because the behaviour worth covering —
conditional updates, unique constraints, races — only exists in Postgres. Each suite
gets its own synthetic workspace, and cleans up after itself; `DATABASE_URL` must be
set, and without it the database-backed suites are skipped rather than silently
passing.

`npm test` reads the command environment. To use the connection in `.env.local`
without printing or copying credentials into a shell command:

```bash
node --env-file=.env.local -e 'const {spawnSync}=require("node:child_process"); process.exit(spawnSync("npm",["run","verify"],{stdio:"inherit",env:process.env}).status ?? 1)'
```

Use a dedicated test database when available. Stripe calls in the test suite use
the recording fake, so payment tests do not charge cards.

## Checks

```bash
npm run check:fees          # property tests on the fee and refund arithmetic
npm run check:schema        # drizzle schema vs the migration vs the live database
npm run check:concurrency   # races that a functional test cannot see (needs DATABASE_URL)
```

Each of these exists because of a specific bug, not because it seemed like a good idea:

- **`check:schema`** — a mistyped column name is invisible to TypeScript and fatal at
  runtime. (`payout_enabled` vs `payouts_enabled` took down every account query.)
- **`check:fees`** — a rounding slip in partial refunds returns more fee than was
  charged, and nothing notices until the books don't balance. A $25 payment with a 25¢
  fee refunded in halves used to return 26¢.
- **`check:concurrency`** — the most expensive bugs in a payments codebase are races,
  and neither shows up functionally: a duplicate charge when two identical requests
  arrive together, and an over-refund when two refunds hit the same payment. Both
  return 200/201 every time regardless.

The SQL is additive: it only creates `tollbooth_*` tables and never alters the
tables shared with members.axxes.club. It's safe to re-run.

## How money moves

Each workspace gets its own Stripe connected account, created with controller
properties rather than a legacy account type:

| Property | Value | Meaning |
| --- | --- | --- |
| `stripe_dashboard.type` | `none` | The merchant never sees Stripe; Tollbooth is the whole interface |
| `fees.payer` | `account` | Stripe bills its processing fee to the merchant's account |
| `losses.payments` | `stripe` | Stripe, not Tollbooth, covers negative balances and chargebacks |
| `requirement_collection` | `stripe` | Stripe decides what identity and bank details the law requires |

Checkout is a **direct charge** on that account. Stripe deducts its processing fee,
and Tollbooth takes `TOLLBOOTH_FEE_BPS` (default 1%) plus `TOLLBOOTH_FEE_FIXED` on top
as an application fee. The merchant fills in Stripe's verification form once, opened
from Tollbooth; Stripe issues only `account_onboarding` links for these accounts, so
the same link is how they later change bank or business details. Refunds are issued
on the merchant's account and return the proportional application fee; Stripe keeps
its own processing fee on refunded payments.

Every webhook that moves money must name the workspace's own account
(`event.account`), and Checkout events must match the session Tollbooth opened.
Metadata alone never settles a payment.

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
  rather than charging twice. Reusing a key with a different body is a `400`, and a
  failed request releases the key so a retry can succeed.
- **Webhooks** — signed with HMAC-SHA256 over `timestamp.body`, so a captured
  delivery can't be replayed. Retried with backoff (up to 6 attempts), and an
  endpoint that runs out of attempts is disabled rather than left failing. Every
  attempt is logged and replayable.
- **Delivery workers** — atomically lease each attempt, recover abandoned leases,
  and stop starting work before the function deadline. Outbound connections use
  pinned DNS and reject private network destinations in production. Response
  bodies are capped at 2 KB. Manual replay and test buttons target the selected
  delivery or endpoint; test events contain an explicit `test: true` marker.
- **Retry scheduling** — the checked-in daily cron is a recovery sweep, not a
  promise of prompt retries. Configure an authenticated minute-level scheduler
  before launch if merchants depend on timely retry delivery. The cron returns
  503 when `CRON_SECRET` is absent and 401 for an incorrect bearer secret.
- **Rate limits** — 300 reads / 120 writes per minute per key. `x-ratelimit-*` is on
  every response, including errors and idempotent replays; a `429` carries `retry-after`.
- **Refunds are cumulative** — fee returned is computed from the *total* refunded
  amount, so splitting a payment into any number of partial refunds can never return
  more fee than was charged.
- **Concurrent duplicates don't double-charge** — a second request with the same
  `Idempotency-Key` waits for the first to finish and returns its response, which is
  the case the header exists for. It only returns a `409` if the first is still
  running after five seconds.
- **Refunds are serialised** — a refund claims its amount on the payment with a
  conditional update before calling Stripe, so two refunds racing for the same payment
  produce one refund and one `409`, never a double refund.

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

1. Enable Connect on the platform account, with the "merchants collect payments
   directly" business model.
2. Add `https://tollbooth.axxes.club/api/webhooks/stripe` as a **Connect** endpoint
   for `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `payment_intent.payment_failed`, `charge.succeeded`, `charge.refunded`,
   `charge.dispute.created`, `charge.dispute.closed`, `refund.created`,
   `refund.updated`, `refund.failed`, `account.updated`, `payout.paid`,
   `payout.failed` and `payout.canceled`. Payments are direct charges, so all of
   these arrive from connected accounts.
3. Put every endpoint's signing secret in `STRIPE_WEBHOOK_SECRET`, comma-separated.
