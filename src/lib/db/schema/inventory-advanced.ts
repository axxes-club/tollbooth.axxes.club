/**
 * Advanced Inventory Management Features
 * Premium features to compete with top solutions (Cin7, TradeGecko, Zoho Inventory)
 * 
 * Based on industry research of must-have features for best-in-class inventory software
 */

import { pgTable, text, timestamp, uuid, integer, decimal, boolean, jsonb, pgEnum, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { user } from "./users"
import { products, productVariants, inventoryLocations } from "./inventory"
import { suppliers, supplierParts, purchaseOrders, stockItems, buildOrders } from "./inventree"

// ============= ENUMS =============

export const channelEnum = pgEnum("sales_channel", [
  "shopify",
  "woocommerce",
  "amazon",
  "ebay",
  "etsy",
  "walmart",
  "pos",
  "custom",
  "api"
])

export const forecastMethodEnum = pgEnum("forecast_method", [
  "moving_average",
  "exponential_smoothing",
  "linear_regression",
  "seasonal",
  "ml_based"
])

export const abcClassEnum = pgEnum("abc_class", ["A", "B", "C"])
export const xyzClassEnum = pgEnum("xyz_class", ["X", "Y", "Z"])

export const transferStatusEnum = pgEnum("transfer_status", [
  "draft",
  "approved",
  "in_transit",
  "partially_received",
  "completed",
  "cancelled"
])

export const auditStatusEnum = pgEnum("audit_status", [
  "scheduled",
  "in_progress",
  "completed",
  "adjusted",
  "discrepancy_found"
])

export const qcStatusEnum = pgEnum("qc_status", [
  "pending",
  "passed",
  "failed",
  "conditional_pass",
  "quarantine"
])

export const pricingTierEnum = pgEnum("pricing_tier", [
  "retail",
  "wholesale",
  "distributor",
  "vip",
  "custom"
])

// ============= MULTI-CHANNEL INTEGRATIONS =============

export const salesChannels = pgTable("sales_channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Channel info
  name: text("name").notNull(),
  channelType: channelEnum("channel_type").notNull(),

  // Connection
  isConnected: boolean("is_connected").default(false),
  apiCredentials: jsonb("api_credentials").$type<Record<string, unknown>>(),
  webhookSecret: text("webhook_secret"),

  // Sync settings
  syncEnabled: boolean("sync_enabled").default(true),
  syncFrequency: integer("sync_frequency").default(300), // seconds
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  syncStatus: text("sync_status").default("idle"), // idle, syncing, error

  // Inventory mapping
  locationId: uuid("location_id").references(() => inventoryLocations.id),
  autoAllocate: boolean("auto_allocate").default(true),

  // Order settings
  autoImportOrders: boolean("auto_import_orders").default(true),
  orderStatusMapping: jsonb("order_status_mapping").$type<Record<string, string>>(),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("sales_channels_tenant_idx").on(table.tenantId),
  index("sales_channels_type_idx").on(table.channelType),
  index("sales_channels_connected_idx").on(table.isConnected),
])

// Channel listings (product mappings to external channels)
export const channelListings = pgTable("channel_listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").notNull().references(() => salesChannels.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),

  // External IDs
  externalProductId: text("external_product_id"),
  externalVariantId: text("external_variant_id"),
  externalSku: text("external_sku"),

  // Pricing per channel
  price: decimal("price", { precision: 12, scale: 2 }),
  compareAtPrice: decimal("compare_at_price", { precision: 12, scale: 2 }),
  costPrice: decimal("cost_price", { precision: 12, scale: 2 }),

  // Inventory
  inventoryPolicy: text("inventory_policy").default("deny"), // deny, continue
  inventoryQuantity: integer("inventory_quantity").default(0),

  // Status
  isActive: boolean("is_active").default(true),
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),

  // Sync
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  syncErrors: jsonb("sync_errors").$type<Array<{ timestamp: string; error: string }>>(),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("channel_listings_tenant_idx").on(table.tenantId),
  index("channel_listings_channel_idx").on(table.channelId),
  index("channel_listings_product_idx").on(table.productId),
  index("channel_listings_external_idx").on(table.externalProductId),
])

// ============= DEMAND FORECASTING =============

export const demandForecasts = pgTable("demand_forecasts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),

  // Forecast parameters
  method: forecastMethodEnum("method").default("moving_average"),
  horizon: integer("horizon").default(30), // days to forecast

  // Forecast data (JSON array of daily forecasts)
  forecastData: jsonb("forecast_data").$type<Array<{
    date: string
    predictedDemand: number
    confidenceLower: number
    confidenceUpper: number
  }>>(),

  // Accuracy metrics
  meanAbsoluteError: decimal("mae", { precision: 10, scale: 2 }),
  meanAbsolutePercentageError: decimal("mape", { precision: 10, scale: 2 }),
  forecastAccuracy: decimal("accuracy", { precision: 5, scale: 2 }), // percentage

  // Factors considered
  seasonalityFactor: decimal("seasonality_factor", { precision: 6, scale: 4 }),
  trendFactor: decimal("trend_factor", { precision: 6, scale: 4 }),
  promotionImpact: decimal("promotion_impact", { precision: 6, scale: 4 }),

  // Generated
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("demand_forecasts_tenant_idx").on(table.tenantId),
  index("demand_forecasts_product_idx").on(table.productId),
  index("demand_forecasts_location_idx").on(table.locationId),
  index("demand_forecasts_valid_idx").on(table.validFrom, table.validUntil),
])

// ============= AUTOMATED REPLENISHMENT =============

export const replenishmentRules = pgTable("replenishment_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),
  supplierPartId: uuid("supplier_part_id").references(() => supplierParts.id, { onDelete: "set null" }),

  // Reorder settings
  reorderPoint: integer("reorder_point").default(10),
  reorderQuantity: integer("reorder_quantity").default(50),
  safetyStock: integer("safety_stock").default(5),

  // Economic Order Quantity
  eoq: integer("eoq"), // Economic Order Quantity
  eoqCalculatedAt: timestamp("eoq_calculated_at", { withTimezone: true }),

  // Lead time
  leadTimeDays: integer("lead_time_days"),
  leadTimeVariability: decimal("lead_time_variability", { precision: 5, scale: 2 }),

  // Service level
  targetServiceLevel: decimal("service_level", { precision: 5, scale: 2 }).default("0.95"), // 95%

  // Automation
  autoReorderEnabled: boolean("auto_reorder_enabled").default(false),
  autoReorderQuantity: integer("auto_reorder_quantity"),
  maxOrderQuantity: integer("max_order_quantity"),
  minOrderQuantity: integer("min_order_quantity"),

  // Schedule
  reorderDayOfWeek: integer("reorder_day_of_week"), // 0-6, null for any
  reorderTime: text("reorder_time"), // HH:MM format

  // Status
  isActive: boolean("is_active").default(true),
  lastReorderAt: timestamp("last_reorder_at", { withTimezone: true }),
  nextReorderAt: timestamp("next_reorder_at", { withTimezone: true }),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("replenishment_rules_tenant_idx").on(table.tenantId),
  index("replenishment_rules_product_idx").on(table.productId),
  index("replenishment_rules_location_idx").on(table.locationId),
  index("replenishment_rules_active_idx").on(table.isActive),
])

// ============= ABC/XYZ ANALYSIS =============

export const abcAnalysis = pgTable("abc_analysis", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),

  // Classification
  abcClass: abcClassEnum("abc_class").notNull(), // A, B, C
  xyzClass: xyzClassEnum("xyz_class").notNull(), // X, Y, Z

  // Metrics for classification
  annualConsumptionValue: decimal("annual_consumption_value", { precision: 14, scale: 2 }),
  percentageOfTotalValue: decimal("percentage_of_total", { precision: 6, scale: 2 }),
  cumulativePercentage: decimal("cumulative_percentage", { precision: 6, scale: 2 }),

  // Demand variability
  averageDemand: decimal("average_demand", { precision: 12, scale: 4 }),
  demandStandardDeviation: decimal("demand_std_dev", { precision: 12, scale: 4 }),
  coefficientOfVariation: decimal("cv", { precision: 6, scale: 4 }),

  // Recommendations
  recommendedSafetyStock: integer("recommended_safety_stock"),
  recommendedReorderPoint: integer("recommended_reorder_point"),
  reviewFrequency: text("review_frequency"), // daily, weekly, monthly

  // Analysis period
  analysisStartDate: timestamp("start_date", { withTimezone: true }),
  analysisEndDate: timestamp("end_date", { withTimezone: true }),

  // Audit
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("abc_analysis_tenant_idx").on(table.tenantId),
  index("abc_analysis_product_idx").on(table.productId),
  index("abc_analysis_class_idx").on(table.abcClass, table.xyzClass),
])

// ============= KITS & BUNDLES =============

export const productKits = pgTable("product_kits", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),

  // Kit settings
  name: text("name").notNull(),
  description: text("description"),

  // Pricing
  pricingStrategy: text("pricing_strategy").default("sum"), // sum, fixed, discount
  fixedPrice: decimal("fixed_price", { precision: 12, scale: 2 }),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }),

  // Inventory
  trackComponents: boolean("track_components").default(true), // Deduct component stock on sale
  allowPartialFulfillment: boolean("allow_partial").default(false),

  // Status
  isActive: boolean("is_active").default(true),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("product_kits_tenant_idx").on(table.tenantId),
  index("product_kits_product_idx").on(table.productId),
])

export const kitComponents = pgTable("kit_components", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  kitId: uuid("kit_id").notNull().references(() => productKits.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),

  // Quantity
  quantity: integer("quantity").notNull(),
  isOptional: boolean("is_optional").default(false),

  // Sort
  sortOrder: integer("sort_order").default(0),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("kit_components_tenant_idx").on(table.tenantId),
  index("kit_components_kit_idx").on(table.kitId),
  index("kit_components_product_idx").on(table.productId),
])

// ============= DROP SHIPPING =============

export const dropshipRules = pgTable("dropship_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),

  // Rule settings
  priority: integer("priority").default(0), // Higher = more priority
  isDefault: boolean("is_default").default(false),

  // Conditions
  minOrderQuantity: integer("min_order_qty").default(1),
  maxOrderQuantity: integer("max_order_qty"),
  enabledRegions: jsonb("enabled_regions").$type<string[]>(), // Country codes
  disabledRegions: jsonb("disabled_regions").$type<string[]>(),

  // Pricing
  markupPercentage: decimal("markup_percentage", { precision: 6, scale: 2 }),
  fixedMarkup: decimal("fixed_markup", { precision: 12, scale: 2 }),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }),

  // Status
  isActive: boolean("is_active").default(true),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("dropship_rules_tenant_idx").on(table.tenantId),
  index("dropship_rules_product_idx").on(table.productId),
  index("dropship_rules_supplier_idx").on(table.supplierId),
])

// ============= TRANSFER ORDERS =============

export const transferOrders = pgTable("transfer_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Reference
  orderNumber: text("order_number").notNull().unique(),

  // Locations
  fromLocationId: uuid("from_location_id").notNull().references(() => inventoryLocations.id, { onDelete: "restrict" }),
  toLocationId: uuid("to_location_id").notNull().references(() => inventoryLocations.id, { onDelete: "restrict" }),

  // Status
  status: transferStatusEnum("status").notNull().default("draft"),

  // Items
  totalItems: integer("total_items").default(0),
  totalQuantity: integer("total_quantity").default(0),

  // Shipping
  shippingMethod: text("shipping_method"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }),

  // Dates
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  expectedDate: timestamp("expected_date", { withTimezone: true }),

  // Notes
  notes: text("notes"),
  internalNotes: text("internal_notes"),

  // Attribution
  createdBy: uuid("created_by").references(() => user.id),
  approvedBy: uuid("approved_by").references(() => user.id),
  shippedBy: uuid("shipped_by").references(() => user.id),
  receivedBy: uuid("received_by").references(() => user.id),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("transfer_orders_tenant_idx").on(table.tenantId),
  index("transfer_orders_from_idx").on(table.fromLocationId),
  index("transfer_orders_to_idx").on(table.toLocationId),
  index("transfer_orders_status_idx").on(table.status),
  index("transfer_orders_number_idx").on(table.orderNumber),
])

export const transferOrderItems = pgTable("transfer_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  transferOrderId: uuid("transfer_order_id").notNull().references(() => transferOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),

  // Quantity
  quantity: integer("quantity").notNull(),
  quantityShipped: integer("quantity_shipped").default(0),
  quantityReceived: integer("quantity_received").default(0),

  // Stock item references
  stockItemId: uuid("stock_item_id").references(() => stockItems.id, { onDelete: "set null" }),

  // Notes
  notes: text("notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("transfer_items_tenant_idx").on(table.tenantId),
  index("transfer_items_transfer_idx").on(table.transferOrderId),
  index("transfer_items_product_idx").on(table.productId),
])

// ============= CYCLE COUNTING & AUDITS =============

export const inventoryAudits = pgTable("inventory_audits", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Audit info
  name: text("name").notNull(),
  auditType: text("audit_type").notNull(), // cycle_count, full_count, spot_check

  // Scope
  locationId: uuid("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),
  includeAllProducts: boolean("include_all_products").default(false),
  productFilters: jsonb("product_filters").$type<Record<string, unknown>>(),

  // Schedule
  scheduledDate: timestamp("scheduled_date", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  // Status
  status: auditStatusEnum("status").notNull().default("scheduled"),

  // Results
  totalItems: integer("total_items").default(0),
  countedItems: integer("counted_items").default(0),
  discrepancyCount: integer("discrepancy_count").default(0),
  accuracyRate: decimal("accuracy_rate", { precision: 5, scale: 2 }),

  // Attribution
  assignedTo: uuid("assigned_to").references(() => user.id),
  completedBy: uuid("completed_by").references(() => user.id),

  // Notes
  notes: text("notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("inventory_audits_tenant_idx").on(table.tenantId),
  index("inventory_audits_location_idx").on(table.locationId),
  index("inventory_audits_status_idx").on(table.status),
  index("inventory_audits_scheduled_idx").on(table.scheduledDate),
])

export const auditItems = pgTable("audit_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  auditId: uuid("audit_id").notNull().references(() => inventoryAudits.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),
  stockItemId: uuid("stock_item_id").references(() => stockItems.id, { onDelete: "set null" }),

  // Counts
  systemQuantity: integer("system_quantity").notNull(),
  countedQuantity: integer("counted_quantity"),
  variance: integer("variance"),
  variancePercentage: decimal("variance_percentage", { precision: 6, scale: 2 }),

  // Status
  status: text("status").default("pending"), // pending, counted, adjusted
  countedAt: timestamp("counted_at", { withTimezone: true }),
  countedBy: uuid("counted_by").references(() => user.id),

  // Adjustment
  adjustmentId: uuid("adjustment_id"),
  adjustmentReason: text("adjustment_reason"),

  // Notes
  notes: text("notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_items_tenant_idx").on(table.tenantId),
  index("audit_items_audit_idx").on(table.auditId),
  index("audit_items_product_idx").on(table.productId),
  index("audit_items_status_idx").on(table.status),
])

// ============= LANDED COST TRACKING =============

export const landedCosts = pgTable("landed_costs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),

  // Cost type
  costType: text("cost_type").notNull(), // freight, duty, insurance, handling, customs, etc.
  costName: text("cost_name").notNull(),

  // Amount
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),

  // Allocation
  allocationMethod: text("allocation_method").default("weight"), // weight, value, quantity, equal
  allocatedAmount: decimal("allocated_amount", { precision: 12, scale: 2 }).default("0"),

  // Vendor
  vendorId: uuid("vendor_id").references(() => suppliers.id, { onDelete: "set null" }),
  invoiceNumber: text("invoice_number"),

  // Status
  isPaid: boolean("is_paid").default(false),
  paidAt: timestamp("paid_at", { withTimezone: true }),

  // Documents
  documentUrls: jsonb("document_urls").$type<string[]>(),

  // Notes
  notes: text("notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("landed_costs_tenant_idx").on(table.tenantId),
  index("landed_costs_po_idx").on(table.purchaseOrderId),
  index("landed_costs_type_idx").on(table.costType),
])

// ============= QUALITY CONTROL =============

export const qualityChecks = pgTable("quality_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Reference
  checkNumber: text("check_number").notNull().unique(),

  // Type
  checkType: text("check_type").notNull(), // incoming, in_process, final, random

  // Subject
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  stockItemId: uuid("stock_item_id").references(() => stockItems.id, { onDelete: "set null" }),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
  buildOrderId: uuid("build_order_id").references(() => buildOrders.id, { onDelete: "set null" }),

  // Sampling
  sampleSize: integer("sample_size"),
  lotSize: integer("lot_size"),
  acceptanceLimit: decimal("acceptance_limit", { precision: 5, scale: 2 }),

  // Results
  status: qcStatusEnum("status").notNull().default("pending"),
  passedQuantity: integer("passed_quantity").default(0),
  failedQuantity: integer("failed_quantity").default(0),
  defectCount: integer("defect_count").default(0),

  // Defects
  defects: jsonb("defects").$type<Array<{ type: string; count: number; severity: string }>>(),

  // Inspection
  inspectionDate: timestamp("inspection_date", { withTimezone: true }),
  inspectorId: uuid("inspector_id").references(() => user.id),

  // Actions
  disposition: text("disposition"), // accept, reject, rework, return
  correctiveAction: text("corrective_action"),

  // Notes
  notes: text("notes"),
  internalNotes: text("internal_notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("quality_checks_tenant_idx").on(table.tenantId),
  index("quality_checks_product_idx").on(table.productId),
  index("quality_checks_status_idx").on(table.status),
  index("quality_checks_type_idx").on(table.checkType),
])

// ============= PRICING & PRICE LISTS =============

export const priceLists = pgTable("price_lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Info
  name: text("name").notNull(),
  description: text("description"),
  currency: text("currency").notNull().default("USD"),

  // Type
  pricingTier: pricingTierEnum("pricing_tier").default("retail"),
  customerType: text("customer_type"), // wholesale, retail, distributor, etc.

  // Pricing rules
  markupPercentage: decimal("markup_percentage", { precision: 6, scale: 2 }),
  discountPercentage: decimal("discount_percentage", { precision: 6, scale: 2 }),
  roundMethod: text("round_method").default("none"), // none, up, down, nearest

  // Validity
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),

  // Status
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),

  // Customer assignments
  customerIds: jsonb("customer_ids").$type<string[]>(),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("price_lists_tenant_idx").on(table.tenantId),
  index("price_lists_tier_idx").on(table.pricingTier),
  index("price_lists_active_idx").on(table.isActive),
])

export const priceListItems = pgTable("price_list_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  priceListId: uuid("price_list_id").notNull().references(() => priceLists.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),

  // Pricing
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  compareAtPrice: decimal("compare_at_price", { precision: 12, scale: 2 }),
  minQuantity: integer("min_quantity").default(1),
  maxQuantity: integer("max_quantity"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("price_list_items_tenant_idx").on(table.tenantId),
  index("price_list_items_list_idx").on(table.priceListId),
  index("price_list_items_product_idx").on(table.productId),
])

// ============= BIN/LOCATION MANAGEMENT =============

export const locationBins = pgTable("location_bins", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").notNull().references(() => inventoryLocations.id, { onDelete: "cascade" }),

  // Location hierarchy
  zone: text("zone"), // A, B, C, etc.
  aisle: text("aisle"), // 01, 02, 03, etc.
  rack: text("rack"), // A, B, C, etc.
  shelf: text("shelf"), // 1, 2, 3, etc.
  bin: text("bin"), // 01, 02, 03, etc.

  // Dimensions
  length: decimal("length", { precision: 8, scale: 2 }),
  width: decimal("width", { precision: 8, scale: 2 }),
  height: decimal("height", { precision: 8, scale: 2 }),
  dimensionUnit: text("dimension_unit").default("in"), // in, cm

  // Capacity
  maxWeight: decimal("max_weight", { precision: 10, scale: 2 }),
  weightUnit: text("weight_unit").default("lb"), // lb, kg
  maxVolume: decimal("max_volume", { precision: 10, scale: 2 }),

  // Type
  binType: text("bin_type"), // shelf, floor, rack, cold_storage, etc.
  temperatureControlled: boolean("temp_controlled").default(false),
  minTemperature: decimal("min_temp", { precision: 5, scale: 1 }),
  maxTemperature: decimal("max_temp", { precision: 5, scale: 1 }),

  // Status
  isActive: boolean("is_active").default(true),
  isFull: boolean("is_full").default(false),

  // Barcode
  barcode: text("barcode"),
  qrCode: text("qr_code"),

  // Notes
  notes: text("notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("location_bins_tenant_idx").on(table.tenantId),
  index("location_bins_location_idx").on(table.locationId),
  index("location_bins_zone_idx").on(table.zone),
  index("location_bins_aisle_idx").on(table.aisle),
  index("location_bins_active_idx").on(table.isActive),
])

// ============= EXPIRY TRACKING =============

export const expiryTracking = pgTable("expiry_tracking", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),

  // Dates
  manufacturingDate: timestamp("manufacturing_date", { withTimezone: true }),
  expiryDate: timestamp("expiry_date", { withTimezone: true }).notNull(),
  bestBeforeDate: timestamp("best_before_date", { withTimezone: true }),

  // Alerts
  alertThresholdDays: integer("alert_threshold_days").default(30),
  isExpired: boolean("is_expired").default(false),
  isNearExpiry: boolean("is_near_expiry").default(false),
  alertedAt: timestamp("alerted_at", { withTimezone: true }),

  // Batch info
  batchNumber: text("batch_number"),
  lotNumber: text("lot_number"),

  // Quantity
  originalQuantity: integer("original_quantity"),
  remainingQuantity: integer("remaining_quantity"),

  // Disposition
  disposition: text("disposition"), // sell, donate, destroy, return
  disposedAt: timestamp("disposed_at", { withTimezone: true }),
  disposedBy: uuid("disposed_by").references(() => user.id),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("expiry_tracking_tenant_idx").on(table.tenantId),
  index("expiry_tracking_item_idx").on(table.stockItemId),
  index("expiry_tracking_expiry_idx").on(table.expiryDate),
  index("expiry_tracking_expired_idx").on(table.isExpired),
])

// ============= CONSIGNMENT INVENTORY =============

export const consignmentAgreements = pgTable("consignment_agreements", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),

  // Agreement info
  agreementNumber: text("agreement_number").notNull().unique(),
  name: text("name").notNull(),

  // Terms
  commissionRate: decimal("commission_rate", { precision: 6, scale: 2 }).notNull(), // percentage
  paymentTerms: text("payment_terms"), // Net 30, etc.
  minStockLevel: integer("min_stock_level"),
  maxStockLevel: integer("max_stock_level"),

  // Duration
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }),
  autoRenew: boolean("auto_renew").default(false),

  // Status
  isActive: boolean("is_active").default(true),
  terminatedAt: timestamp("terminated_at", { withTimezone: true }),
  terminationReason: text("termination_reason"),

  // Notes
  notes: text("notes"),
  terms: text("terms"), // Full terms and conditions

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("consignment_agreements_tenant_idx").on(table.tenantId),
  index("consignment_agreements_supplier_idx").on(table.supplierId),
  index("consignment_agreements_active_idx").on(table.isActive),
])

export const consignmentStock = pgTable("consignment_stock", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  agreementId: uuid("agreement_id").notNull().references(() => consignmentAgreements.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => inventoryLocations.id, { onDelete: "set null" }),
  stockItemId: uuid("stock_item_id").references(() => stockItems.id, { onDelete: "set null" }),

  // Quantity
  quantityReceived: integer("quantity_received").notNull(),
  quantitySold: integer("quantity_sold").default(0),
  quantityRemaining: integer("quantity_remaining").notNull(),
  quantityReturned: integer("quantity_returned").default(0),

  // Financial
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  commissionRate: decimal("commission_rate", { precision: 6, scale: 2 }),
  totalCommission: decimal("total_commission", { precision: 12, scale: 2 }).default("0"),

  // Status
  status: text("status").default("in_stock"), // in_stock, sold, returned
  soldAt: timestamp("sold_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("consignment_stock_tenant_idx").on(table.tenantId),
  index("consignment_stock_agreement_idx").on(table.agreementId),
  index("consignment_stock_product_idx").on(table.productId),
  index("consignment_stock_status_idx").on(table.status),
])

// ============= REPORTS & ANALYTICS =============

export const reportConfigs = pgTable("report_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Report info
  name: text("name").notNull(),
  reportType: text("report_type").notNull(), // inventory_valuation, turnover, aging, etc.
  description: text("description"),

  // Configuration
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  filters: jsonb("filters").$type<Record<string, unknown>>().default({}),

  // Schedule
  schedule: text("schedule"), // cron expression
  recipients: jsonb("recipients").$type<string[]>(),

  // Status
  isActive: boolean("is_active").default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),

  // Audit
  createdBy: uuid("created_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("report_configs_tenant_idx").on(table.tenantId),
  index("report_configs_type_idx").on(table.reportType),
  index("report_configs_active_idx").on(table.isActive),
])

// ============= RELATIONS (New Tables) =============

export const salesChannelsRelations = relations(salesChannels, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [salesChannels.tenantId],
    references: [tenants.id],
  }),
  location: one(inventoryLocations, {
    fields: [salesChannels.locationId],
    references: [inventoryLocations.id],
  }),
  listings: many(channelListings),
}))

export const channelListingsRelations = relations(channelListings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [channelListings.tenantId],
    references: [tenants.id],
  }),
  channel: one(salesChannels, {
    fields: [channelListings.channelId],
    references: [salesChannels.id],
  }),
  product: one(products, {
    fields: [channelListings.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [channelListings.productVariantId],
    references: [productVariants.id],
  }),
}))

export const demandForecastsRelations = relations(demandForecasts, ({ one }) => ({
  tenant: one(tenants, {
    fields: [demandForecasts.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [demandForecasts.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [demandForecasts.productVariantId],
    references: [productVariants.id],
  }),
  location: one(inventoryLocations, {
    fields: [demandForecasts.locationId],
    references: [inventoryLocations.id],
  }),
}))

export const replenishmentRulesRelations = relations(replenishmentRules, ({ one }) => ({
  tenant: one(tenants, {
    fields: [replenishmentRules.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [replenishmentRules.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [replenishmentRules.productVariantId],
    references: [productVariants.id],
  }),
  location: one(inventoryLocations, {
    fields: [replenishmentRules.locationId],
    references: [inventoryLocations.id],
  }),
  supplierPart: one(supplierParts, {
    fields: [replenishmentRules.supplierPartId],
    references: [supplierParts.id],
  }),
}))

export const abcAnalysisRelations = relations(abcAnalysis, ({ one }) => ({
  tenant: one(tenants, {
    fields: [abcAnalysis.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [abcAnalysis.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [abcAnalysis.productVariantId],
    references: [productVariants.id],
  }),
  location: one(inventoryLocations, {
    fields: [abcAnalysis.locationId],
    references: [inventoryLocations.id],
  }),
}))

export const productKitsRelations = relations(productKits, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [productKits.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [productKits.productId],
    references: [products.id],
  }),
  components: many(kitComponents),
}))

export const kitComponentsRelations = relations(kitComponents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [kitComponents.tenantId],
    references: [tenants.id],
  }),
  kit: one(productKits, {
    fields: [kitComponents.kitId],
    references: [productKits.id],
  }),
  product: one(products, {
    fields: [kitComponents.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [kitComponents.productVariantId],
    references: [productVariants.id],
  }),
}))

export const transferOrdersRelations = relations(transferOrders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [transferOrders.tenantId],
    references: [tenants.id],
  }),
  fromLocation: one(inventoryLocations, {
    fields: [transferOrders.fromLocationId],
    references: [inventoryLocations.id],
  }),
  toLocation: one(inventoryLocations, {
    fields: [transferOrders.toLocationId],
    references: [inventoryLocations.id],
  }),
  creator: one(user, {
    fields: [transferOrders.createdBy],
    references: [user.id],
  }),
  items: many(transferOrderItems),
}))

export const transferOrderItemsRelations = relations(transferOrderItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [transferOrderItems.tenantId],
    references: [tenants.id],
  }),
  transferOrder: one(transferOrders, {
    fields: [transferOrderItems.transferOrderId],
    references: [transferOrders.id],
  }),
  product: one(products, {
    fields: [transferOrderItems.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [transferOrderItems.productVariantId],
    references: [productVariants.id],
  }),
  stockItem: one(stockItems, {
    fields: [transferOrderItems.stockItemId],
    references: [stockItems.id],
  }),
}))

export const inventoryAuditsRelations = relations(inventoryAudits, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [inventoryAudits.tenantId],
    references: [tenants.id],
  }),
  location: one(inventoryLocations, {
    fields: [inventoryAudits.locationId],
    references: [inventoryLocations.id],
  }),
  assignee: one(user, {
    fields: [inventoryAudits.assignedTo],
    references: [user.id],
  }),
  items: many(auditItems),
}))

export const auditItemsRelations = relations(auditItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditItems.tenantId],
    references: [tenants.id],
  }),
  audit: one(inventoryAudits, {
    fields: [auditItems.auditId],
    references: [inventoryAudits.id],
  }),
  product: one(products, {
    fields: [auditItems.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [auditItems.productVariantId],
    references: [productVariants.id],
  }),
  location: one(inventoryLocations, {
    fields: [auditItems.locationId],
    references: [inventoryLocations.id],
  }),
  stockItem: one(stockItems, {
    fields: [auditItems.stockItemId],
    references: [stockItems.id],
  }),
  counter: one(user, {
    fields: [auditItems.countedBy],
    references: [user.id],
  }),
}))

export const priceListsRelations = relations(priceLists, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [priceLists.tenantId],
    references: [tenants.id],
  }),
  items: many(priceListItems),
}))

export const priceListItemsRelations = relations(priceListItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [priceListItems.tenantId],
    references: [tenants.id],
  }),
  priceList: one(priceLists, {
    fields: [priceListItems.priceListId],
    references: [priceLists.id],
  }),
  product: one(products, {
    fields: [priceListItems.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [priceListItems.productVariantId],
    references: [productVariants.id],
  }),
}))

export const locationBinsRelations = relations(locationBins, ({ one }) => ({
  tenant: one(tenants, {
    fields: [locationBins.tenantId],
    references: [tenants.id],
  }),
  location: one(inventoryLocations, {
    fields: [locationBins.locationId],
    references: [inventoryLocations.id],
  }),
}))

export const expiryTrackingRelations = relations(expiryTracking, ({ one }) => ({
  tenant: one(tenants, {
    fields: [expiryTracking.tenantId],
    references: [tenants.id],
  }),
  stockItem: one(stockItems, {
    fields: [expiryTracking.stockItemId],
    references: [stockItems.id],
  }),
  product: one(products, {
    fields: [expiryTracking.productId],
    references: [products.id],
  }),
  disposer: one(user, {
    fields: [expiryTracking.disposedBy],
    references: [user.id],
  }),
}))

export const consignmentAgreementsRelations = relations(consignmentAgreements, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [consignmentAgreements.tenantId],
    references: [tenants.id],
  }),
  supplier: one(suppliers, {
    fields: [consignmentAgreements.supplierId],
    references: [suppliers.id],
  }),
  stock: many(consignmentStock),
}))

export const consignmentStockRelations = relations(consignmentStock, ({ one }) => ({
  tenant: one(tenants, {
    fields: [consignmentStock.tenantId],
    references: [tenants.id],
  }),
  agreement: one(consignmentAgreements, {
    fields: [consignmentStock.agreementId],
    references: [consignmentAgreements.id],
  }),
  product: one(products, {
    fields: [consignmentStock.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [consignmentStock.productVariantId],
    references: [productVariants.id],
  }),
  location: one(inventoryLocations, {
    fields: [consignmentStock.locationId],
    references: [inventoryLocations.id],
  }),
  stockItem: one(stockItems, {
    fields: [consignmentStock.stockItemId],
    references: [stockItems.id],
  }),
}))

// ============= TYPES =============

export type SalesChannel = typeof salesChannels.$inferSelect
export type NewSalesChannel = typeof salesChannels.$inferInsert
export type ChannelListing = typeof channelListings.$inferSelect
export type NewChannelListing = typeof channelListings.$inferInsert
export type DemandForecast = typeof demandForecasts.$inferSelect
export type NewDemandForecast = typeof demandForecasts.$inferInsert
export type ReplenishmentRule = typeof replenishmentRules.$inferSelect
export type NewReplenishmentRule = typeof replenishmentRules.$inferInsert
export type AbcAnalysis = typeof abcAnalysis.$inferSelect
export type NewAbcAnalysis = typeof abcAnalysis.$inferInsert
export type ProductKit = typeof productKits.$inferSelect
export type NewProductKit = typeof productKits.$inferInsert
export type KitComponent = typeof kitComponents.$inferSelect
export type NewKitComponent = typeof kitComponents.$inferInsert
export type DropshipRule = typeof dropshipRules.$inferSelect
export type NewDropshipRule = typeof dropshipRules.$inferInsert
export type TransferOrder = typeof transferOrders.$inferSelect
export type NewTransferOrder = typeof transferOrders.$inferInsert
export type TransferOrderItem = typeof transferOrderItems.$inferSelect
export type NewTransferOrderItem = typeof transferOrderItems.$inferInsert
export type InventoryAudit = typeof inventoryAudits.$inferSelect
export type NewInventoryAudit = typeof inventoryAudits.$inferInsert
export type AuditItem = typeof auditItems.$inferSelect
export type NewAuditItem = typeof auditItems.$inferInsert
export type LandedCost = typeof landedCosts.$inferSelect
export type NewLandedCost = typeof landedCosts.$inferInsert
export type QualityCheck = typeof qualityChecks.$inferSelect
export type NewQualityCheck = typeof qualityChecks.$inferInsert
export type PriceList = typeof priceLists.$inferSelect
export type NewPriceList = typeof priceLists.$inferInsert
export type PriceListItem = typeof priceListItems.$inferSelect
export type NewPriceListItem = typeof priceListItems.$inferInsert
export type LocationBin = typeof locationBins.$inferSelect
export type NewLocationBin = typeof locationBins.$inferInsert
export type ExpiryTracking = typeof expiryTracking.$inferSelect
export type NewExpiryTracking = typeof expiryTracking.$inferInsert
export type ConsignmentAgreement = typeof consignmentAgreements.$inferSelect
export type NewConsignmentAgreement = typeof consignmentAgreements.$inferInsert
export type ConsignmentStock = typeof consignmentStock.$inferSelect
export type NewConsignmentStock = typeof consignmentStock.$inferInsert
export type ReportConfig = typeof reportConfigs.$inferSelect
export type NewReportConfig = typeof reportConfigs.$inferInsert
