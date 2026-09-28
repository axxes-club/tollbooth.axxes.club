import { pgTable, text, timestamp, uuid, integer, decimal, jsonb, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { user } from "./users"
import { contacts } from "./contacts"
import { products, productVariants } from "./inventory"
import { events, ticketTypes } from "./events"

// Enums
export const orderStatusEnum = pgEnum("order_status", ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"])
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "authorized", "captured", "failed", "refunded", "partially_refunded"])
export const fulfillmentStatusEnum = pgEnum("fulfillment_status", ["unfulfilled", "partial", "fulfilled", "returned"])
export const orderItemTypeEnum = pgEnum("order_item_type", ["ticket", "product", "merchandise", "fee"])

// Orders
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Order Number
  orderNumber: text("order_number").notNull(),

  // Customer
  contactId: uuid("contact_id").references(() => contacts.id),
  customerEmail: text("customer_email").notNull(),
  customerFirstName: text("customer_first_name"),
  customerLastName: text("customer_last_name"),
  customerPhone: text("customer_phone"),

  // Status
  status: orderStatusEnum("status").notNull().default("pending"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status").notNull().default("unfulfilled"),

  // Totals
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  discountTotal: decimal("discount_total", { precision: 12, scale: 2 }).notNull().default("0"),
  taxTotal: decimal("tax_total", { precision: 12, scale: 2 }).notNull().default("0"),
  shippingTotal: decimal("shipping_total", { precision: 12, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").default("USD"),

  // Addresses
  shippingAddress: jsonb("shipping_address").$type<Address>(),
  billingAddress: jsonb("billing_address").$type<Address>(),

  // Payment
  paymentMethod: text("payment_method"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),

  // Shipping
  shippingMethod: text("shipping_method"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),

  // Discount
  discountCode: text("discount_code"),
  discountId: uuid("discount_id"),

  // Source
  source: text("source").default("web"),

  // Notes
  customerNotes: text("customer_notes"),
  internalNotes: text("internal_notes"),

  // Dates
  paidAt: timestamp("paid_at", { withTimezone: true }),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),

  // External Integration
  externalOrderId: text("external_order_id"),
  externalPlatform: text("external_platform"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("orders_number_idx").on(table.tenantId, table.orderNumber),
  index("orders_tenant_idx").on(table.tenantId),
  index("orders_contact_idx").on(table.contactId),
  index("orders_status_idx").on(table.tenantId, table.status),
  index("orders_created_idx").on(table.tenantId, table.createdAt),
  index("orders_stripe_idx").on(table.stripePaymentIntentId),
])

// Order Items
export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),

  // Item Type
  type: orderItemTypeEnum("type").notNull(),

  // References
  productId: uuid("product_id").references(() => products.id),
  variantId: uuid("variant_id").references(() => productVariants.id),
  ticketTypeId: uuid("ticket_type_id").references(() => ticketTypes.id),
  eventId: uuid("event_id").references(() => events.id),

  // Item Details (denormalized)
  name: text("name").notNull(),
  sku: text("sku"),

  // Pricing
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),

  // Fulfillment
  quantityFulfilled: integer("quantity_fulfilled").notNull().default(0),

  // Metadata
  properties: jsonb("properties").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("order_items_tenant_idx").on(table.tenantId),
  index("order_items_order_idx").on(table.orderId),
  index("order_items_product_idx").on(table.productId),
  index("order_items_event_idx").on(table.eventId),
])

// Payment Transactions
export const paymentTransactions = pgTable("payment_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),

  // Transaction Details
  type: text("type").notNull(),
  status: text("status").notNull(),

  // Amount
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),

  // Gateway
  gateway: text("gateway").notNull(),
  gatewayTransactionId: text("gateway_transaction_id"),
  gatewayResponse: jsonb("gateway_response").$type<Record<string, unknown>>(),

  // Error Handling
  errorCode: text("error_code"),
  errorMessage: text("error_message"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("transactions_tenant_idx").on(table.tenantId),
  index("transactions_order_idx").on(table.orderId),
  index("transactions_gateway_idx").on(table.gateway, table.gatewayTransactionId),
])

// Fulfillments
export const fulfillments = pgTable("fulfillments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),

  // Tracking
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  carrier: text("carrier"),

  // Status
  status: text("status").notNull().default("pending"),

  // Notes
  notes: text("notes"),

  // Dates
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),

  // Attribution
  fulfilledById: uuid("fulfilled_by_id").references(() => user.id),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("fulfillments_tenant_idx").on(table.tenantId),
  index("fulfillments_order_idx").on(table.orderId),
])

// Fulfillment Items
export const fulfillmentItems = pgTable("fulfillment_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  fulfillmentId: uuid("fulfillment_id").notNull().references(() => fulfillments.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id, { onDelete: "cascade" }),

  // Quantity
  quantity: integer("quantity").notNull(),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("fulfillment_items_fulfillment_idx").on(table.fulfillmentId),
  index("fulfillment_items_order_item_idx").on(table.orderItemId),
])

// Relations
export const ordersRelations = relations(orders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [orders.tenantId],
    references: [tenants.id],
  }),
  contact: one(contacts, {
    fields: [orders.contactId],
    references: [contacts.id],
  }),
  items: many(orderItems),
  transactions: many(paymentTransactions),
  fulfillments: many(fulfillments),
}))

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [orderItems.tenantId],
    references: [tenants.id],
  }),
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
  ticketType: one(ticketTypes, {
    fields: [orderItems.ticketTypeId],
    references: [ticketTypes.id],
  }),
  event: one(events, {
    fields: [orderItems.eventId],
    references: [events.id],
  }),
  fulfillmentItems: many(fulfillmentItems),
}))

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [paymentTransactions.tenantId],
    references: [tenants.id],
  }),
  order: one(orders, {
    fields: [paymentTransactions.orderId],
    references: [orders.id],
  }),
}))

export const fulfillmentsRelations = relations(fulfillments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [fulfillments.tenantId],
    references: [tenants.id],
  }),
  order: one(orders, {
    fields: [fulfillments.orderId],
    references: [orders.id],
  }),
  fulfilledBy: one(user, {
    fields: [fulfillments.fulfilledById],
    references: [user.id],
  }),
  items: many(fulfillmentItems),
}))

export const fulfillmentItemsRelations = relations(fulfillmentItems, ({ one }) => ({
  fulfillment: one(fulfillments, {
    fields: [fulfillmentItems.fulfillmentId],
    references: [fulfillments.id],
  }),
  orderItem: one(orderItems, {
    fields: [fulfillmentItems.orderItemId],
    references: [orderItems.id],
  }),
}))

// Types
interface Address {
  firstName?: string
  lastName?: string
  company?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
}

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderItem = typeof orderItems.$inferSelect
export type NewOrderItem = typeof orderItems.$inferInsert
export type PaymentTransaction = typeof paymentTransactions.$inferSelect
export type NewPaymentTransaction = typeof paymentTransactions.$inferInsert
export type Fulfillment = typeof fulfillments.$inferSelect
export type NewFulfillment = typeof fulfillments.$inferInsert
export type FulfillmentItem = typeof fulfillmentItems.$inferSelect
export type NewFulfillmentItem = typeof fulfillmentItems.$inferInsert
