# Tollbooth launch fixes implementation plan

**Goal:** Fix the existing payment and merchant workflows on main, without deploying.

**Architecture:** Retain the current Next.js, Drizzle, Stripe and SDK interfaces. Move trusted account synchronization into a server-only module, centralize currency parsing, and make webhook delivery claims atomic using the existing next-attempt timestamp as a lease.

**Spec:** ../specs/2026-09-30-launch-readiness-design.md

**Execution:** Native execution on main, explicitly requested by the user. The user asked to get the code working rather than continue approval handoffs. No deployment or service-plan changes.

## Constraints

- Read installed Next.js documentation before framework changes.
- Preserve integer minor units in the API and zero dependencies in the SDK.
- Use synthetic test workspaces and fake Stripe calls; do not charge real money.
- Add no product dependency or database schema migration for these fixes.
- Keep unverified real Stripe, browser, Linux and scheduler behavior explicit.

## Tasks

### 1. Payment foundations

- [x] Add failing regressions for blank checkout returns, decimal currency input, truthful buyer outcomes, and account action authorization.
- [x] Move syncAccount to a server-only account module; derive tenant and platform mode inside refresh actions; validate input modes.
- [x] Add parseMoney(input, currency) returning integer minor units or null, rejecting malformed and unsafe amounts. Use it in prices and owned-payment refunds and currency-aware controls.
- [x] Normalize blank return URLs and validate public outcome IDs. Show accurate statuses without exposing emails or claiming receipt delivery.
- [x] Verify with npm test and npm run typecheck, loading .env.local for database tests.

### 2. Webhook correctness

- [x] Add failing regressions for concurrent workers, completed delivery protection, selected endpoint testing, and fail-closed cron authentication.
- [x] Atomically reserve pending due deliveries with a future nextAttemptAt; use processing status and reclaim expired leases. Compare the lease timestamp when finalizing.
- [x] Bound batch duration and response reads, isolate per-delivery failures, and replay only the selected delivery.
- [x] Allow dashboard test/live endpoints and send synthetic test events to the selected endpoint only.
- [x] Verify delivery integration tests and the full suite. Document that daily cron is a recovery sweep; minute scheduling remains deployment configuration.

### 3. Merchant clarity and completion

- [x] Fix form event lifetime problems by capturing FormData and form elements synchronously before async transitions.
- [x] Separate optional developer onboarding tasks from payment-link setup, show explicit platform mode, and filter revenue to that mode.
- [x] Run typecheck, full database tests, fee checks, schema comparison, concurrency checks and production build.
- [x] Request an independent code review, fix material findings, commit on main and push main if the configured origin accepts it without deploying.

## Review focus

Check concurrent webhook reservations, invalid UUID input, currency precision, refunds against another tenant, missing cron secrets, and public customer-data exposure. Environment configuration and a real Stripe checkout/payout remain external launch gates.

## Verification evidence

Final `npm run verify` with `.env.local` loaded passed: 188 tests, zero failures or skips, type checking, fee checks, live database schema comparison, refund/idempotency concurrency checks, and a local production build. Independent review findings were fixed and reviewed again. Origin changes were merged before verification.

Real Stripe checkout/payout, browser interaction, Linux VM execution, and production scheduler behavior remain unverified. No deployment is included.
