/**
 * Database access for tests.
 *
 * Tests run against the real database: the behaviour worth covering — conditional
 * updates, unique constraints, races — only exists in Postgres, not in a mock. The
 * cost is that every suite needs its own synthetic workspace, and its own slice of the
 * two globally-unique tables, so a run can never touch real data or another suite.
 */
import { createHash } from "node:crypto"
import { neon } from "@neondatabase/serverless"

/** Tables the tests write to, all of which carry a tenant. */
const TENANT_TABLES = [
  "tollbooth_webhook_deliveries",
  "tollbooth_webhook_endpoints",
  "tollbooth_refunds",
  "tollbooth_payments",
  "tollbooth_links",
  "tollbooth_prices",
  "tollbooth_products",
  "tollbooth_customers",
  "tollbooth_api_keys",
  "tollbooth_accounts",
] as const

export type Suite = { tenant: string; eventPrefix: string }

/**
 * A suite's private workspace and event-id prefix.
 *
 * Both are derived from the suite name because the node test runner executes files in
 * parallel, and two of these tables are global: `tollbooth_events` has no tenant
 * column, and a link slug is unique across every workspace. Scoping only the tenant
 * was not enough — one suite's cleanup deleted another's rows mid-test.
 */
export function suiteFor(name: string): Suite {
  const slug = name.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8).padEnd(8, "0")
  return {
    tenant: `00000000-0000-4000-8000-${createHash("sha256").update(name).digest("hex").slice(0, 12)}`,
    eventPrefix: `evt_test_${slug}_`,
  }
}

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL)
}

export function sql() {
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set")
  return neon(process.env.DATABASE_URL!)
}

/** Removes everything a suite created, and nothing belonging to another. */
export async function resetTestData(suite: Suite) {
  if (!hasDatabase()) return
  const db = sql()
  for (const table of TENANT_TABLES) {
    await db.query(`delete from ${table} where tenant_id = $1`, [suite.tenant])
  }
  await db.query(`delete from tollbooth_idempotency_keys where tenant_id = $1`, [suite.tenant])
  await db.query(`delete from tollbooth_events where id like $1`, [`${suite.eventPrefix}%`])
}

/** A connected account that reports itself ready to take charges. */
export async function seedReadyAccount(tenant: string, stripeAccountId = `acct_test_${tenant.slice(-6)}`) {
  await sql().query(
    `insert into tollbooth_accounts (tenant_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, country, default_currency)
     values ($1, $2, 1, 1, 1, 'US', 'usd')
     on conflict (tenant_id) do update
       set stripe_account_id = $2, charges_enabled = 1, payouts_enabled = 1`,
    [tenant, stripeAccountId]
  )
  return stripeAccountId
}
