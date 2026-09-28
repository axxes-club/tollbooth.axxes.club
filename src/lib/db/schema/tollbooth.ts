import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

// Tollbooth's own tables (prefixed; created by scripts/create-tables.sql)

// One Stripe Connect account per AXXES workspace — where that workspace's money lands
export const tollboothAccounts = pgTable("tollbooth_accounts", {
  tenantId: uuid("tenant_id").primaryKey(),
  stripeAccountId: text("stripe_account_id").notNull().unique(),
  chargesEnabled: integer("charges_enabled").notNull().default(0),
  payoutsEnabled: integer("payouts_enabled").notNull().default(0),
  detailsSubmitted: integer("details_submitted").notNull().default(0),
  country: text("country"),
  defaultCurrency: text("default_currency"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// API keys for apps that charge through Tollbooth. Only a SHA-256 hash is stored.
export const tollboothApiKeys = pgTable(
  "tollbooth_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    createdById: text("created_by_id").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tollbooth_api_keys_tenant_idx").on(t.tenantId)]
)

export const tollboothPayments = pgTable(
  "tollbooth_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    apiKeyId: uuid("api_key_id"),
    status: text("status").notNull().default("pending"), // pending | succeeded | failed | expired | refunded | partially_refunded
    amount: integer("amount").notNull(), // minor units
    currency: text("currency").notNull(),
    applicationFee: integer("application_fee").notNull().default(0),
    amountRefunded: integer("amount_refunded").notNull().default(0),
    description: text("description"),
    customerEmail: text("customer_email"),
    reference: text("reference"), // the calling app's own order/invoice id
    metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
    checkoutSessionId: text("checkout_session_id"),
    checkoutUrl: text("checkout_url"),
    paymentIntentId: text("payment_intent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tollbooth_payments_tenant_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("tollbooth_payments_session_idx").on(t.checkoutSessionId),
  ]
)

// Stripe events already handled, so webhook retries are idempotent
export const tollboothEvents = pgTable("tollbooth_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
})
