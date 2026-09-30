# Tollbooth launch readiness design

Tollbooth must let an AXXES workspace merchant connect payouts, sell through a payment link or API, understand payment outcomes, and issue refunds without ambiguity about money or environment. The first release should make the existing product dependable and easy to use before expanding its feature set.

The assumed launch audience is AXXES workspace merchants. Independent business signup is outside this release. The user requested working features and excellent merchant UX and developer experience, and authorized proceeding with the launch-readiness effort.

## Release sequence

Three projects have separate acceptance gates:

1. Payment foundations: account authorization, checkout returns, monetary input, and trustworthy payment outcomes. This document specifies this first implementation project.
2. Webhook reliability and sandbox setup: reliable scheduled delivery, concurrency-safe workers, test-mode endpoints, and connected-account behavior validated against Stripe.
3. Merchant and developer experience: task-specific onboarding, environment-aware reporting, clear form feedback, accessible mobile journeys, and executable API and SDK documentation.

This sequence makes each change independently reviewable. A passing first project is not authorization to declare the entire product ready for launch.

## Current evidence

The initial local baseline passed TypeScript checking, 52 database-independent tests, fee property checks, and the comparison of Drizzle columns with migration columns. Database-backed suites were skipped because DATABASE_URL was absent from the command environment. The concurrency checker could not run for the same reason. No production build, Linux execution, browser journey, actual Stripe checkout, or payout has been verified during this audit.

| Finding | Evidence | Required behavior |
| --- | --- | --- |
| Account synchronization accepts a caller-supplied workspace without authentication | Exported syncAccount in src/app/dashboard/actions.ts, a use-server module | Only the authenticated workspace can be synchronized through a public action |
| An empty cancellation URL bypasses the checkout fallback | Payment-link handler passes an empty string; createCheckout uses nullish coalescing | Omitted or blank cancellation URLs lead to Tollbooth's cancellation page |
| Refunded and disputed payments are described as never charged | Completion page treats every non-pending, non-succeeded status as failed | Each persisted status receives accurate buyer-facing copy |
| JPY values are multiplied or divided by 100 in dashboard forms | createPrice, refundPayment, catalog forms, and refund form | Major-unit input uses the selected currency's exponent |
| Webhook batches can exceed invocation duration | Sequential 10-second requests; 25 deliveries under a 30-second handler or 50 under a 60-second cron | A worker must stop starting work before its deadline and retain remaining deliveries |
| Dashboard webhook endpoints are always live | createEndpoint hardcodes mode to live | Merchants can configure and distinguish test and live endpoints |
| Onboarding includes API tasks for every merchant | getOnboarding includes API key, endpoint, and test-payment steps | Payment-link sellers need only the steps required for their selling path |

The account schema contains one connected-account ID and readiness snapshot per workspace. This is a compatibility concern, not proof that all cross-mode operations fail. Stripe's real connected-account behavior must be exercised before choosing a schema migration.

## First project architecture

Preserve Next.js App Router, React, Drizzle with Neon Postgres, Stripe Checkout and Connect, and the current REST API and SDK interfaces. Use the installed Next.js 16.3.6 documentation for framework behavior. Add no product dependencies for the first project.

### Account action boundary

Move account synchronization into a server-only library module. It is an internal operation taking a trusted tenant ID and mode, not a Server Action accepting arbitrary public identifiers. The public refresh action derives the tenant from requireContext and selects the configured platform mode internally. Keep existing owner/admin restrictions on onboarding and payout-account management.

Validate the mode argument to onboarding at runtime; a TypeScript cast does not validate FormData. Reject unsupported values before a Stripe request or database write. Preserve authenticated workspace scoping on every account operation. Do not serialize account records or provider details from refresh actions.

Tests must show that unauthenticated refresh cannot reach account synchronization, authenticated refresh cannot select another workspace, invalid onboarding mode causes no provider call, and the internal synchronization helper is not exported by a use-server module. Test framework integration through behavior where possible, with a targeted source-boundary check only for the module exposure rule.

### Checkout return behavior

Normalize optional checkout return URLs once before creating the Stripe session. Missing or blank success and cancellation URLs resolve to the existing Tollbooth outcome routes for that payment. Explicit valid merchant URLs remain intact; success URLs retain their payment-ID query parameter. Reject invalid explicit URLs with the existing API validation behavior.

Regression coverage must include the actual link path with no custom return URLs, omitted and empty cancellation URLs, explicit merchant return URLs, and an unsuccessful Stripe session creation. A browser cancellation must land on a usable page rather than an invalid URL.

### Buyer outcome behavior

Map each existing payment status to an explicit outcome:

| Status | Outcome |
| --- | --- |
| pending | Payment confirmation is still pending; do not promise a receipt or invite another charge |
| succeeded | Payment received, with amount and merchant description |
| partially_refunded | Payment received with a partial refund; show original and refunded amounts |
| refunded | Payment refunded; identify the refunded amount without promising bank timing |
| disputed | Payment is under dispute; advise contacting the seller |
| failed | Payment could not be completed; avoid asserting that the bank never placed a hold |
| expired | Checkout expired; direct the buyer back to the seller |
| Unknown or missing record | Payment cannot be confirmed; avoid asserting success, failure, or receipt delivery |

Validate payment IDs before querying UUID columns and return a friendly missing-payment view for invalid IDs. Do not expose buyer email addresses on public outcome pages. Remove unconditional promises that a receipt was sent: the repository does not establish email delivery. A pending view may refresh to obtain the actual outcome, with a bounded polling interval and accessible status announcement.

Keep presentation changes focused on the existing completion and cancellation pages. Test the complete status matrix, malformed IDs, and public rendering without customer email leakage.

### Monetary input and display

Centralize decimal-string conversion in the existing fee/currency domain. API amounts remain integer minor units. Dashboard forms accept major units using currencyExponent: JPY has exponent zero, while the other currently exposed currencies have exponent two.

Use decimal-string arithmetic to reject excess precision, negative values, non-finite input, scientific notation, and unsafe integer results rather than silently rounding them. Preserve the current minimum-charge policy in this project; separately validate that policy against supported Stripe settlement currencies before launch.

Resolve the owned payment and its currency before interpreting a dashboard refund amount. Blank refund amount continues to mean the remaining refundable amount. Server validation remains authoritative even when client-side validation passes.

Use formatMoney for catalog price displays and currency-aware input steps, examples, limits, and refund errors. A JPY 1000 price must become 1000 minor units; a USD 10.25 price must become 1025 minor units. A JPY 100 partial refund must refund 100 minor units. A USD 0.001 amount must be rejected rather than rounded.

## Subsequent project requirements

### Webhook delivery and environments

Design a database-backed claim or lease for deliveries so overlapping cron runs, Stripe callbacks, and manual replays cannot send the same attempt concurrently. Reclaim abandoned leases after their timeout. Bound outbound response reading and prevent delivery to internal network destinations; URL scheme validation alone is insufficient for server-side fetching.

Make cron authentication fail closed if CRON_SECRET is absent. Define a delivery time budget below each function's configured maximum. Isolate individual delivery failures so one endpoint does not prevent progress for the rest.

Select a scheduler supporting at least one invocation per minute before claiming prompt retry behavior. The current daily Hobby cron can remain a recovery sweep, but cannot satisfy this service objective. Do not change the deployment's billing plan or provision an external scheduler as part of a code-only change.

Dashboard replay must target the selected delivery, and the endpoint's test button must target only that endpoint. Both features must surface their actual outcome. Merchants must be able to create a test-mode endpoint through the dashboard. Test events must be visibly synthetic and cannot silently resemble real paid orders.

Verify connected-account creation, onboarding, readiness, balances, test charges, and live readiness with appropriately scoped Stripe credentials. Determine account storage changes from that evidence. Do not automatically migrate existing account IDs into a guessed environment.

### UX and DX

Provide separate onboarding paths for payment links and integrations. A no-code seller must not need an API key or webhook to complete setup. Developers should begin with a test key, a tested checkout example, and signature verification before switching to live credentials.

Keep test payments out of live revenue totals and clearly label environment across payment lists, balances, keys, and endpoints. Show actionable setup requirements rather than raw Stripe field names. Form errors and success feedback must be visible, keyboard-accessible, and accurate.

Verify documented SDK imports, return types, pagination, errors, idempotency behavior, and webhook examples against executable tests. Audit each advertised feature against its route, permission rules, empty states, and failure paths. Remove claims unsupported by the implementation.

## Verification and launch gate

Every money or authorization fix requires a regression test that fails before implementation. Run the complete local test suite and TypeScript checks after changes. Database-backed suites must actually execute against an isolated test database; skipped suites are not evidence of correctness. Exercise refund and idempotency races with the concurrency checker.

Run schema checks against the test database and review additive migrations before any production application. Verify the build and production-like execution in Linux using the repository's mercelle workflow when deployment verification begins.

Run browser journeys for owner/admin and read-only users: sign in, connect payouts, create a product and price, publish a link, complete and cancel checkout, inspect payment state, partially and fully refund, create and revoke keys, create endpoints, test and replay deliveries. Include mobile sizing, keyboard navigation, slow network, stale sessions, missing configuration, and provider failure.

Use Stripe test credentials for automated and exploratory payment testing. Production launch readiness additionally requires configured webhook secrets, a protected scheduler, observed queue recovery, verified payout readiness, and a documented rollback and reconciliation procedure. This work does not automatically publish, deploy, charge a real card, or change service billing.

## Source references

- Installed framework guides: node_modules/next/dist/docs/01-app/02-guides/server-actions.md, data-security.md, and 03-api-reference/04-functions/after.md. Server Actions require application authorization and after callbacks remain subject to invocation duration.
- [Stripe Connect testing](https://docs.stripe.com/connect/testing): test account creation, verification, payment and payout behavior before going live; sandbox behavior is not a guarantee of live capability readiness.
- [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing): Hobby cron runs at most once per day, with limited timing precision.
