import { relations } from "drizzle-orm"
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

// Tollbooth's own tables (prefixed; created by scripts/create-tables.sql)

/** live | test. A test key can only move money inside Stripe's test mode. */
export const tbMode = { live: "live", test: "test" } as const
export type TbMode = (typeof tbMode)[keyof typeof tbMode]

// One Stripe Connect account per AXXES workspace — where that workspace's money lands
export const tollboothAccounts = pgTable("tollbooth_accounts", {
  tenantId: uuid("tenant_id").primaryKey(),
  stripeAccountId: text("stripe_account_id").notNull().unique(),
  chargesEnabled: integer("charges_enabled").notNull().default(0),
  payoutsEnabled: integer("payout_enabled").notNull().default(0),
  detailsSubmitted: integer("details_submitted").notNull().default(0),
  country: text("country"),
  defaultCurrency: text("default_currency"),
  chargesDisabledReason: text("charges_disabled_reason"),
  requirementsDue: jsonb("requirements_due").$type<string[]>().default([]),
  /** Balance snapshot, refreshed by the payout sync action. */
  balanceAvailable: integer("balance_available").notNull().default(0),
  balancePending: integer("balance_pending").notNull().default(0),
  nextPayoutAt: timestamp("next_payout_at", { withTimezone: true }),
  payoutSchedule: text("payout_schedule"),
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
    mode: text("mode").notNull().default("live"), // live | test
    scopes: jsonb("scopes").$type<string[]>().default(["payments:write"]),
    createdById: text("created_by_id").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tollbooth_api_keys_tenant_idx").on(t.tenantId)]
)

// Saved customers, so a repeat buyer doesn't have to re-type their details.
export const tollboothCustomers = pgTable(
  "tollbooth_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name"),
    email: text("email").notNull(),
    phone: text("phone"),
    metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
    firstPaidAt: timestamp("first_paid_at", { withTimezone: true }),
    totalSpent: integer("total_spent").notNull().default(0),
    paymentCount: integer("payment_count").notNull().default(0),
    lastPaidAt: timestamp("last_paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tollbooth_customers_tenant_idx").on(t.tenantId, t.createdAt),
    index("tollbooth_customers_email_idx").on(t.tenantId, t.email),
  ]
)

// A product is what you sell; a price is how much for it. Prices are left alone once a
// payment exists, so historical receipts never change meaning.
export const tollboothProducts = pgTable(
  "tollbooth_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Optional image shown on the hosted checkout page. */
    imageUrl: text("image_url"),
    active: integer("active").notNull().default(1),
    metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tollbooth_products_tenant_idx").on(t.tenantId, t.createdAt)]
)

export const tollboothPrices = pgTable(
  "tollbooth_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    productId: uuid("product_id").references(() => tollboothProducts.id, { onDelete: "cascade" }),
    /** Set for one-off prices that have no product. */
    nickname: text("nickname"),
    amount: integer("amount").notNull(), // minor units
    currency: text("currency").notNull().default("usd"),
    /** Short stable handle an app can hardcode, e.g. `vip_ticket`. */
    lookupKey: text("lookup_key"),
    active: integer("active").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tollbooth_prices_tenant_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("tollbooth_prices_lookup_idx").on(t.tenantId, t.lookupKey),
  ]
)

// Payment links: a shareable /pay/<slug> URL that sells a price with no code at all.
export const tollboothLinks = pgTable(
  "tollbooth_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    priceId: uuid("price_id").references(() => tollboothPrices.id, { onDelete: "set null" }),
    /** Short slug used in the public URL, so links stay readable. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Where the buyer lands after paying. Must be https. */
    successUrl: text("success_url"),
    cancelUrl: text("cancel_url"),
    /** Optional quantity stepper on the hosted page. */
    allowQuantity: integer("allow_quantity").notNull().default(0),
    active: integer("active").notNull().default(1),
    viewCount: integer("view_count").notNull().default(0),
    paymentCount: integer("payment_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tollbooth_links_slug_idx").on(t.slug),
    index("tollbooth_links_tenant_idx").on(t.tenantId, t.createdAt),
  ]
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
    /** What the platform actually earned, after refunds handed part of the fee back. */
    netFee: integer("net_fee").notNull().default(0),
    description: text("description"),
    customerEmail: text("customer_email"),
    customerId: uuid("customer_id").references(() => tollboothCustomers.id, { onDelete: "set null" }),
    priceId: uuid("price_id").references(() => tollboothPrices.id, { onDelete: "set null" }),
    linkId: uuid("link_id").references(() => tollboothLinks.id, { onDelete: "set null" }),
    reference: text("reference"), // the calling app's own order/invoice id
    metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
    /** api | link — where the checkout was started. */
    source: text("source").notNull().default("api"),
    mode: text("mode").notNull().default("live"),
    checkoutSessionId: text("checkout_session_id"),
    checkoutUrl: text("checkout_url"),
    paymentIntentId: text("payment_intent_id"),
    /** Stripe's charge id. Disputes and refunds both reference the charge. */
    chargeId: text("charge_id"),
    /** Where the buyer is redirected once Stripe confirms. */
    successUrl: text("success_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tollbooth_payments_tenant_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("tollbooth_payments_session_idx").on(t.checkoutSessionId),
    index("tollbooth_payments_reference_idx").on(t.tenantId, t.reference),
    index("tollbooth_payments_charge_idx").on(t.chargeId),
  ]
)

// Every refund is its own row, so the merchant can see history and reasons.
export const tollboothRefunds = pgTable(
  "tollbooth_refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    paymentId: uuid("payment_id").notNull().references(() => tollboothPayments.id, { onDelete: "cascade" }),
    stripeRefundId: text("stripe_refund_id"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    /** Fee handed back to the merchant because this money returned to the customer. */
    feeReturned: integer("fee_returned").notNull().default(0),
    reason: text("reason"),
    note: text("note"),
    status: text("status").notNull().default("succeeded"), // pending | succeeded | failed | canceled
    apiKeyId: uuid("api_key_id"),
    createdByKind: text("created_by_kind").notNull().default("api"), // api | dashboard
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tollbooth_refunds_tenant_idx").on(t.tenantId, t.createdAt),
    index("tollbooth_refunds_payment_idx").on(t.paymentId),
  ]
)

// Stripe events already handled, so webhook retries are idempotent
export const tollboothEvents = pgTable("tollbooth_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  account: text("account"),
  livemode: integer("livemode").notNull().default(1),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
})

// Where Tollbooth delivers events out to the merchant's own servers.
export const tollboothWebhookEndpoints = pgTable(
  "tollbooth_webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    /** HMAC secret, shown once at creation and again on rotate. */
    secret: text("secret").notNull(),
    /** ["*"] or empty means "every event we emit". */
    events: jsonb("events").$type<string[]>().default(["*"]),
    mode: text("mode").notNull().default("live"),
    enabled: integer("enabled").notNull().default(1),
    createdById: text("created_by_id").notNull(),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    lastDeliveryStatus: text("last_delivery_status"),
    failureCount: integer("failure_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tollbooth_webhook_endpoints_tenant_idx").on(t.tenantId, t.createdAt)]
)

// One row per delivery attempt, so merchants can inspect and replay failures.
export const tollboothWebhookDeliveries = pgTable(
  "tollbooth_webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpointId: uuid("endpoint_id").notNull().references(() => tollboothWebhookEndpoints.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("pending"), // pending | delivered | failed
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    error: text("error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tollbooth_deliveries_endpoint_idx").on(t.endpointId, t.createdAt),
    index("tollbooth_deliveries_retry_idx").on(t.status, t.nextAttemptAt),
  ]
)

// Replays of an `Idempotency-Key`, so a retried request returns the first response
// instead of creating a second charge.
export const tollboothIdempotencyKeys = pgTable(
  "tollbooth_idempotency_keys",
  {
    key: text("key").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    apiKeyId: uuid("api_key_id"),
    method: text("method").notNull(),
    path: text("path").notNull(),
    /** Fingerprint of the request body, to reject a reused key with a different payload. */
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("tollbooth_idempotency_tenant_idx").on(t.tenantId)]
)

export const tollboothProductsRelations = relations(tollboothProducts, ({ many }) => ({
  prices: many(tollboothPrices),
}))

export const tollboothPricesRelations = relations(tollboothPrices, ({ one }) => ({
  product: one(tollboothProducts, { fields: [tollboothPrices.productId], references: [tollboothProducts.id] }),
}))

export const tollboothLinksRelations = relations(tollboothLinks, ({ one }) => ({
  price: one(tollboothPrices, { fields: [tollboothLinks.priceId], references: [tollboothPrices.id] }),
}))

export const tollboothPaymentsRelations = relations(tollboothPayments, ({ one, many }) => ({
  customer: one(tollboothCustomers, { fields: [tollboothPayments.customerId], references: [tollboothCustomers.id] }),
  refunds: many(tollboothRefunds),
}))

export type TbAccount = typeof tollboothAccounts.$inferSelect
export type TbApiKey = typeof tollboothApiKeys.$inferSelect
export type TbCustomer = typeof tollboothCustomers.$inferSelect
export type TbProduct = typeof tollboothProducts.$inferSelect
export type TbPrice = typeof tollboothPrices.$inferSelect
export type TbLink = typeof tollboothLinks.$inferSelect
export type TbPayment = typeof tollboothPayments.$inferSelect
export type TbRefund = typeof tollboothRefunds.$inferSelect
export type TbWebhookEndpoint = typeof tollboothWebhookEndpoints.$inferSelect
export type TbWebhookDelivery = typeof tollboothWebhookDeliveries.$inferSelect
