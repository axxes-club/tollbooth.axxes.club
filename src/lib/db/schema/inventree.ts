/**
 * InvenTree-Inspired Inventory Schema Extensions
 * Adds comprehensive inventory management features
 */

import { pgTable, text, timestamp, uuid, integer, decimal, boolean, jsonb, pgEnum, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { user } from "./users"
import { products, productVariants, inventoryLocations } from "./inventory"

// ============= ENUMS =============

export const stockStatusEnum = pgEnum("stock_status", [
  "ok",
  "damaged",
  "lost",
  "destroyed",
  "returned",
  "quarantine",
  "on_hold"
])

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "pending",
  "sent",
  "confirmed",
  "partially_received",
  "received",
  "cancelled"
])

export const salesOrderStatusEnum = pgEnum("sales_order_status", [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded"
])

export const buildOrderStatusEnum = pgEnum("build_order_status", [
  "pending",
  "in_progress",
  "partially_complete",
  "complete",
  "cancelled"
])

export const returnOrderStatusEnum = pgEnum("return_order_status", [
  "pending",
  "approved",
  "received",
  "refunded",
  "rejected",
  "cancelled"
])

// ============= SUPPLIERS =============

export const suppliers = pgTable("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Basic Info
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),

  // Contact Info
  email: text("email"),
  phone: text("phone"),
  website: text("website"),

  // Address
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").default("US"),

  // Business Details
  taxId: text("tax_id"),
  currency: text("currency").default("USD"),
  paymentTerms: text("payment_terms"), // e.g., "Net 30"
  leadTimeDays: integer("lead_time_days"),

  // Rating & Status
  isActive: boolean("is_active").default(true),
  rating: integer("rating").default(5), // 1-5 stars
  notes: text("notes"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("suppliers_tenant_idx").on(table.tenantId),
  index("suppliers_slug_idx").on(table.tenantId, table.slug),
  index("suppliers_active_idx").on(table.isActive),
])

// Supplier Parts (links suppliers to parts/products)
export const supplierParts = pgTable("supplier_parts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),

  // Supplier-specific info
  sku: text("sku").notNull(), // Supplier's SKU
  manufacturerPartNumber: text("manufacturer_part_number"),
  description: text("description"),

  // Pricing
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  minimumOrderQuantity: integer("min_order_qty").default(1),
  packagingQuantity: integer("packaging_qty").default(1), // Items per package

  // Lead Time
  leadTimeDays: integer("lead_time_days"),

  // Status
  isActive: boolean("is_active").default(true),
  isPrimary: boolean("is_primary").default(false), // Primary supplier for this part

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("supplier_parts_tenant_idx").on(table.tenantId),
  index("supplier_parts_supplier_idx").on(table.supplierId),
  index("supplier_parts_product_idx").on(table.productId),
  index("supplier_parts_sku_idx").on(table.tenantId, table.sku),
])

// ============= BILL OF MATERIALS (BOM) =============

export const bomItems = pgTable("bom_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  parentProductId: uuid("parent_product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  childProductId: uuid("child_product_id").notNull().references(() => products.id, { onDelete: "cascade" }),

  // Quantity
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unitOfMeasure: text("unit_of_measure").default("pcs"), // pcs, kg, m, etc.

  // Reference
  reference: text("reference"), // e.g., "R1, R2, R3" for resistors
  note: text("note"),

  // Optional
  isOptional: boolean("is_optional").default(false),
  isConsumable: boolean("is_consumable").default(false), // Consumed in assembly, not tracked

  // Inherited from supplier part
  supplierPartId: uuid("supplier_part_id").references(() => supplierParts.id),

  // Sort order
  sortOrder: integer("sort_order").default(0),

  // Validation
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  validatedBy: text("validated_by").references(() => user.id),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("bom_items_tenant_idx").on(table.tenantId),
  index("bom_items_parent_idx").on(table.parentProductId),
  index("bom_items_child_idx").on(table.childProductId),
])

// ============= BUILD ORDERS (Production) =============

export const buildOrders = pgTable("build_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),

  // Reference
  orderNumber: text("order_number").notNull().unique(),
  title: text("title"),
  description: text("description"),

  // Quantity
  quantity: integer("quantity").notNull(),
  quantityCompleted: integer("quantity_completed").default(0),

  // Status
  status: buildOrderStatusEnum("status").notNull().default("pending"),

  // Dates
  startDate: timestamp("start_date", { withTimezone: true }),
  targetDate: timestamp("target_date", { withTimezone: true }),
  completedDate: timestamp("completed_date", { withTimezone: true }),

  // Attribution
  assignedTo: text("assigned_to").references(() => user.id),
  locationId: uuid("location_id").references(() => inventoryLocations.id),

  // BOM snapshot (JSON copy of BOM at time of build)
  bomSnapshot: jsonb("bom_snapshot").$type<Record<string, unknown>>(),

  // Notes
  notes: text("notes"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("build_orders_tenant_idx").on(table.tenantId),
  index("build_orders_product_idx").on(table.productId),
  index("build_orders_status_idx").on(table.status),
  index("build_orders_number_idx").on(table.orderNumber),
])

// Build Order Allocations (which stock items are used in a build)
export const buildAllocations = pgTable("build_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  buildOrderId: uuid("build_order_id").notNull().references(() => buildOrders.id, { onDelete: "cascade" }),
  bomItemId: uuid("bom_item_id").notNull().references(() => bomItems.id, { onDelete: "cascade" }),

  // Stock item allocation (will reference stock_items table)
  // For now, using generic reference
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  quantityAllocated: decimal("quantity_allocated", { precision: 12, scale: 4 }).default("0"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("build_allocations_tenant_idx").on(table.tenantId),
  index("build_allocations_build_idx").on(table.buildOrderId),
])

// ============= PURCHASE ORDERS =============

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),

  // Reference
  orderNumber: text("order_number").notNull().unique(),
  supplierReference: text("supplier_reference"), // Supplier's PO number

  // Status
  status: purchaseOrderStatusEnum("status").notNull().default("pending"),

  // Dates
  orderDate: timestamp("order_date", { withTimezone: true }),
  targetDate: timestamp("target_date", { withTimezone: true }),
  receivedDate: timestamp("received_date", { withTimezone: true }),

  // Financial
  currency: text("currency").default("USD"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  shippingCost: decimal("shipping_cost", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0"),

  // Shipping Address
  shippingAddressLine1: text("shipping_address_line1"),
  shippingAddressLine2: text("shipping_address_line2"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingPostalCode: text("shipping_postal_code"),
  shippingCountry: text("shipping_country"),

  // Notes
  notes: text("notes"),
  internalNotes: text("internal_notes"),

  // Attribution
  orderedBy: text("ordered_by").references(() => user.id),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("purchase_orders_tenant_idx").on(table.tenantId),
  index("purchase_orders_supplier_idx").on(table.supplierId),
  index("purchase_orders_status_idx").on(table.status),
  index("purchase_orders_number_idx").on(table.orderNumber),
])

// Purchase Order Line Items
export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  supplierPartId: uuid("supplier_part_id").references(() => supplierParts.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),

  // Item details
  description: text("description").notNull(),
  sku: text("sku"),
  manufacturerPartNumber: text("manufacturer_part_number"),

  // Quantity
  quantity: integer("quantity").notNull(),
  quantityReceived: integer("quantity_received").default(0),

  // Pricing
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }),
  currency: text("currency").default("USD"),

  // Delivery
  targetDate: timestamp("target_date", { withTimezone: true }),
  receivedDate: timestamp("received_date", { withTimezone: true }),

  // Notes
  notes: text("notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("po_items_tenant_idx").on(table.tenantId),
  index("po_items_po_idx").on(table.purchaseOrderId),
  index("po_items_product_idx").on(table.productId),
])

// ============= SALES ORDERS =============

export const salesOrders = pgTable("sales_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Customer info
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),

  // Reference
  orderNumber: text("order_number").notNull().unique(),

  // Status
  status: salesOrderStatusEnum("status").notNull().default("pending"),

  // Dates
  orderDate: timestamp("order_date", { withTimezone: true }).defaultNow(),
  targetDate: timestamp("target_date", { withTimezone: true }),
  shippedDate: timestamp("shipped_date", { withTimezone: true }),
  deliveredDate: timestamp("delivered_date", { withTimezone: true }),

  // Financial
  currency: text("currency").default("USD"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  shippingCost: decimal("shipping_cost", { precision: 12, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0"),

  // Shipping Address
  shippingAddressLine1: text("shipping_address_line1"),
  shippingAddressLine2: text("shipping_address_line2"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingPostalCode: text("shipping_postal_code"),
  shippingCountry: text("shipping_country").default("US"),

  // Billing Address
  billingAddressLine1: text("billing_address_line1"),
  billingAddressLine2: text("billing_address_line2"),
  billingCity: text("billing_city"),
  billingState: text("billing_state"),
  billingPostalCode: text("billing_postal_code"),
  billingCountry: text("billing_country").default("US"),

  // Shipping method
  shippingMethod: text("shipping_method"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),

  // Notes
  notes: text("notes"),
  internalNotes: text("internal_notes"),

  // Attribution
  salespersonId: text("salesperson_id").references(() => user.id),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("sales_orders_tenant_idx").on(table.tenantId),
  index("sales_orders_status_idx").on(table.status),
  index("sales_orders_number_idx").on(table.orderNumber),
  index("sales_orders_customer_idx").on(table.customerEmail),
])

// Sales Order Line Items
export const salesOrderItems = pgTable("sales_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  salesOrderId: uuid("sales_order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),

  // Item details
  description: text("description").notNull(),
  sku: text("sku"),

  // Quantity
  quantity: integer("quantity").notNull(),
  quantityShipped: integer("quantity_shipped").default(0),

  // Pricing
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),

  // Fulfillment
  locationId: uuid("location_id").references(() => inventoryLocations.id),

  // Notes
  notes: text("notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("so_items_tenant_idx").on(table.tenantId),
  index("so_items_so_idx").on(table.salesOrderId),
  index("so_items_product_idx").on(table.productId),
])

// ============= SERIAL NUMBERS & LOT TRACKING =============

// Stock Items table (individual tracked items)
export const stockItems = pgTable("stock_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),

  // Identification
  serialNumber: text("serial_number"), // For individually tracked items
  lotNumber: text("lot_number"), // For batch tracking
  batchCode: text("batch_code"),

  // Quantity
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull().default("1"),
  unitOfMeasure: text("unit_of_measure").default("pcs"),

  // Status
  status: stockStatusEnum("status").notNull().default("ok"),

  // Packaging
  packaging: text("packaging"), // e.g., "Reel", "Tube", "Bulk"
  packagingQuantity: integer("packaging_qty"), // Items per package

  // Traceability
  supplierPartId: uuid("supplier_part_id").references(() => supplierParts.id),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
  buildOrderId: uuid("build_order_id").references(() => buildOrders.id),

  // Dates
  stockDate: timestamp("stock_date", { withTimezone: true }).defaultNow(),
  expiryDate: timestamp("expiry_date", { withTimezone: true }), // For perishables
  lastStocktake: timestamp("last_stocktake", { withTimezone: true }),

  // Physical
  barcode: text("barcode"),
  qrCode: text("qr_code"),

  // Notes
  notes: text("notes"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("stock_items_tenant_idx").on(table.tenantId),
  index("stock_items_product_idx").on(table.productId),
  index("stock_items_location_idx").on(table.locationId),
  index("stock_items_serial_idx").on(table.tenantId, table.serialNumber),
  index("stock_items_lot_idx").on(table.tenantId, table.lotNumber),
  index("stock_items_status_idx").on(table.status),
])

// Stock Item Tracking (history of movements)
export const stockItemTracking = pgTable("stock_item_tracking", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id, { onDelete: "cascade" }),

  // Movement details
  eventType: text("event_type").notNull(), // "added", "removed", "transferred", "allocated", etc.
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  quantityBefore: decimal("quantity_before", { precision: 12, scale: 4 }),
  quantityAfter: decimal("quantity_after", { precision: 12, scale: 4 }),

  // Location
  fromLocationId: uuid("from_location_id").references(() => inventoryLocations.id),
  toLocationId: uuid("to_location_id").references(() => inventoryLocations.id),

  // Reference
  referenceType: text("reference_type"), // "purchase_order", "sales_order", "build_order", etc.
  referenceId: uuid("reference_id"),

  // Attribution
  userId: text("user_id").references(() => user.id),

  // Notes
  notes: text("notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("stock_tracking_tenant_idx").on(table.tenantId),
  index("stock_tracking_item_idx").on(table.stockItemId),
  index("stock_tracking_event_idx").on(table.eventType),
  index("stock_tracking_date_idx").on(table.createdAt),
])

// ============= RETURN ORDERS =============

export const returnOrders = pgTable("return_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  salesOrderId: uuid("sales_order_id").references(() => salesOrders.id, { onDelete: "set null" }),

  // Customer info
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),

  // Reference
  returnNumber: text("return_number").notNull().unique(),
  rmaNumber: text("rma_number"), // Return Merchandise Authorization

  // Status
  status: returnOrderStatusEnum("status").notNull().default("pending"),

  // Dates
  requestDate: timestamp("request_date", { withTimezone: true }).defaultNow(),
  receivedDate: timestamp("received_date", { withTimezone: true }),
  processedDate: timestamp("processed_date", { withTimezone: true }),

  // Reason
  reason: text("reason").notNull(),
  reasonCode: text("reason_code"), // Standardized codes

  // Resolution
  resolution: text("resolution"), // "refund", "replacement", "store_credit", etc.
  refundAmount: decimal("refund_amount", { precision: 12, scale: 2 }),

  // Notes
  customerNotes: text("customer_notes"),
  internalNotes: text("internal_notes"),

  // Attribution
  processedBy: text("processed_by").references(() => user.id),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("return_orders_tenant_idx").on(table.tenantId),
  index("return_orders_status_idx").on(table.status),
  index("return_orders_number_idx").on(table.returnNumber),
])

// Return Order Line Items
export const returnOrderItems = pgTable("return_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  returnOrderId: uuid("return_order_id").notNull().references(() => returnOrders.id, { onDelete: "cascade" }),
  salesOrderItemId: uuid("sales_order_item_id").references(() => salesOrderItems.id, { onDelete: "set null" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  stockItemId: uuid("stock_item_id").references(() => stockItems.id, { onDelete: "set null" }),

  // Item details
  description: text("description").notNull(),
  sku: text("sku"),

  // Quantity
  quantity: integer("quantity").notNull(),
  quantityReceived: integer("quantity_received").default(0),

  // Condition
  condition: text("condition"), // "new", "used", "damaged", etc.
  conditionNotes: text("condition_notes"),

  // Resolution
  resolution: text("resolution"), // "restock", "scrap", "return_to_supplier", etc.

  // Notes
  notes: text("notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("return_items_tenant_idx").on(table.tenantId),
  index("return_items_return_idx").on(table.returnOrderId),
])

// ============= API TOKENS =============

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),

  // Token info
  name: text("name").notNull(),
  key: text("key").notNull().unique(), // The actual API key (hashed)
  prefix: text("prefix"), // First 8 chars for identification

  // Permissions
  scopes: jsonb("scopes").$type<string[]>().default([]), // e.g., ["read:parts", "write:orders"]

  // Status
  isActive: boolean("is_active").default(true),

  // Usage tracking
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("api_tokens_tenant_idx").on(table.tenantId),
  index("api_tokens_user_idx").on(table.userId),
  index("api_tokens_key_idx").on(table.key),
  index("api_tokens_active_idx").on(table.isActive),
])

// ============= LABEL TEMPLATES =============

export const labelTemplates = pgTable("label_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Template info
  name: text("name").notNull(),
  description: text("description"),

  // Type
  labelType: text("label_type").notNull(), // "part", "stock", "location", "shipping", etc.

  // Template content
  template: text("template").notNull(), // HTML/CSS or ZPL template
  width: decimal("width", { precision: 6, scale: 2 }), // mm
  height: decimal("height", { precision: 6, scale: 2 }), // mm

  // Printer settings
  defaultPrinter: text("default_printer"),
  printQuantity: integer("print_quantity").default(1),

  // Status
  isActive: boolean("is_active").default(true),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("label_templates_tenant_idx").on(table.tenantId),
  index("label_templates_type_idx").on(table.labelType),
])

// ============= RELATIONS =============

export const suppliersRelations = relations(suppliers, ({ many, one }) => ({
  tenant: one(tenants, {
    fields: [suppliers.tenantId],
    references: [tenants.id],
  }),
  supplierParts: many(supplierParts),
  purchaseOrders: many(purchaseOrders),
}))

export const supplierPartsRelations = relations(supplierParts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [supplierParts.tenantId],
    references: [tenants.id],
  }),
  supplier: one(suppliers, {
    fields: [supplierParts.supplierId],
    references: [suppliers.id],
  }),
  product: one(products, {
    fields: [supplierParts.productId],
    references: [products.id],
  }),
  bomItems: many(bomItems),
}))

export const bomItemsRelations = relations(bomItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [bomItems.tenantId],
    references: [tenants.id],
  }),
  parentProduct: one(products, {
    fields: [bomItems.parentProductId],
    references: [products.id],
  }),
  childProduct: one(products, {
    fields: [bomItems.childProductId],
    references: [products.id],
  }),
  supplierPart: one(supplierParts, {
    fields: [bomItems.supplierPartId],
    references: [supplierParts.id],
  }),
  validator: one(user, {
    fields: [bomItems.validatedBy],
    references: [user.id],
  }),
}))

export const buildOrdersRelations = relations(buildOrders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [buildOrders.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [buildOrders.productId],
    references: [products.id],
  }),
  assignee: one(user, {
    fields: [buildOrders.assignedTo],
    references: [user.id],
  }),
  location: one(inventoryLocations, {
    fields: [buildOrders.locationId],
    references: [inventoryLocations.id],
  }),
  allocations: many(buildAllocations),
}))

export const buildAllocationsRelations = relations(buildAllocations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [buildAllocations.tenantId],
    references: [tenants.id],
  }),
  buildOrder: one(buildOrders, {
    fields: [buildAllocations.buildOrderId],
    references: [buildOrders.id],
  }),
  bomItem: one(bomItems, {
    fields: [buildAllocations.bomItemId],
    references: [bomItems.id],
  }),
}))

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [purchaseOrders.tenantId],
    references: [tenants.id],
  }),
  supplier: one(suppliers, {
    fields: [purchaseOrders.supplierId],
    references: [suppliers.id],
  }),
  orderedBy: one(user, {
    fields: [purchaseOrders.orderedBy],
    references: [user.id],
  }),
  items: many(purchaseOrderItems),
}))

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [purchaseOrderItems.tenantId],
    references: [tenants.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  supplierPart: one(supplierParts, {
    fields: [purchaseOrderItems.supplierPartId],
    references: [supplierParts.id],
  }),
  product: one(products, {
    fields: [purchaseOrderItems.productId],
    references: [products.id],
  }),
}))

export const salesOrdersRelations = relations(salesOrders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [salesOrders.tenantId],
    references: [tenants.id],
  }),
  salesperson: one(user, {
    fields: [salesOrders.salespersonId],
    references: [user.id],
  }),
  items: many(salesOrderItems),
}))

export const salesOrderItemsRelations = relations(salesOrderItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [salesOrderItems.tenantId],
    references: [tenants.id],
  }),
  salesOrder: one(salesOrders, {
    fields: [salesOrderItems.salesOrderId],
    references: [salesOrders.id],
  }),
  product: one(products, {
    fields: [salesOrderItems.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [salesOrderItems.productVariantId],
    references: [productVariants.id],
  }),
  location: one(inventoryLocations, {
    fields: [salesOrderItems.locationId],
    references: [inventoryLocations.id],
  }),
}))

export const stockItemsRelations = relations(stockItems, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [stockItems.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [stockItems.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [stockItems.productVariantId],
    references: [productVariants.id],
  }),
  location: one(inventoryLocations, {
    fields: [stockItems.locationId],
    references: [inventoryLocations.id],
  }),
  supplierPart: one(supplierParts, {
    fields: [stockItems.supplierPartId],
    references: [supplierParts.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [stockItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  buildOrder: one(buildOrders, {
    fields: [stockItems.buildOrderId],
    references: [buildOrders.id],
  }),
  tracking: many(stockItemTracking),
}))

export const stockItemTrackingRelations = relations(stockItemTracking, ({ one }) => ({
  tenant: one(tenants, {
    fields: [stockItemTracking.tenantId],
    references: [tenants.id],
  }),
  stockItem: one(stockItems, {
    fields: [stockItemTracking.stockItemId],
    references: [stockItems.id],
  }),
  fromLocation: one(inventoryLocations, {
    fields: [stockItemTracking.fromLocationId],
    references: [inventoryLocations.id],
  }),
  toLocation: one(inventoryLocations, {
    fields: [stockItemTracking.toLocationId],
    references: [inventoryLocations.id],
  }),
  user: one(user, {
    fields: [stockItemTracking.userId],
    references: [user.id],
  }),
}))

export const returnOrdersRelations = relations(returnOrders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [returnOrders.tenantId],
    references: [tenants.id],
  }),
  salesOrder: one(salesOrders, {
    fields: [returnOrders.salesOrderId],
    references: [salesOrders.id],
  }),
  processor: one(user, {
    fields: [returnOrders.processedBy],
    references: [user.id],
  }),
  items: many(returnOrderItems),
}))

export const returnOrderItemsRelations = relations(returnOrderItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [returnOrderItems.tenantId],
    references: [tenants.id],
  }),
  returnOrder: one(returnOrders, {
    fields: [returnOrderItems.returnOrderId],
    references: [returnOrders.id],
  }),
  salesOrderItem: one(salesOrderItems, {
    fields: [returnOrderItems.salesOrderItemId],
    references: [salesOrderItems.id],
  }),
  product: one(products, {
    fields: [returnOrderItems.productId],
    references: [products.id],
  }),
  stockItem: one(stockItems, {
    fields: [returnOrderItems.stockItemId],
    references: [stockItems.id],
  }),
}))

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  tenant: one(tenants, {
    fields: [apiTokens.tenantId],
    references: [tenants.id],
  }),
  user: one(user, {
    fields: [apiTokens.userId],
    references: [user.id],
  }),
}))

export const labelTemplatesRelations = relations(labelTemplates, ({ one }) => ({
  tenant: one(tenants, {
    fields: [labelTemplates.tenantId],
    references: [tenants.id],
  }),
}))

// ============= TYPES =============

export type Supplier = typeof suppliers.$inferSelect
export type NewSupplier = typeof suppliers.$inferInsert
export type SupplierPart = typeof supplierParts.$inferSelect
export type NewSupplierPart = typeof supplierParts.$inferInsert
export type BomItem = typeof bomItems.$inferSelect
export type NewBomItem = typeof bomItems.$inferInsert
export type BuildOrder = typeof buildOrders.$inferSelect
export type NewBuildOrder = typeof buildOrders.$inferInsert
export type BuildAllocation = typeof buildAllocations.$inferSelect
export type NewBuildAllocation = typeof buildAllocations.$inferInsert
export type PurchaseOrder = typeof purchaseOrders.$inferSelect
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect
export type NewPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert
export type SalesOrder = typeof salesOrders.$inferSelect
export type NewSalesOrder = typeof salesOrders.$inferInsert
export type SalesOrderItem = typeof salesOrderItems.$inferSelect
export type NewSalesOrderItem = typeof salesOrderItems.$inferInsert
export type StockItem = typeof stockItems.$inferSelect
export type NewStockItem = typeof stockItems.$inferInsert
export type StockItemTracking = typeof stockItemTracking.$inferSelect
export type NewStockItemTracking = typeof stockItemTracking.$inferInsert
export type ReturnOrder = typeof returnOrders.$inferSelect
export type NewReturnOrder = typeof returnOrders.$inferInsert
export type ReturnOrderItem = typeof returnOrderItems.$inferSelect
export type NewReturnOrderItem = typeof returnOrderItems.$inferInsert
export type ApiToken = typeof apiTokens.$inferSelect
export type NewApiToken = typeof apiTokens.$inferInsert
export type LabelTemplate = typeof labelTemplates.$inferSelect
export type NewLabelTemplate = typeof labelTemplates.$inferInsert
