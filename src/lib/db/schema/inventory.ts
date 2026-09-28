import { pgTable, text, timestamp, uuid, integer, decimal, boolean, jsonb, pgEnum, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { user } from "./users"

// Enums
export const productStatusEnum = pgEnum("product_status", ["draft", "active", "archived", "out_of_stock"])
export const inventoryAdjustmentTypeEnum = pgEnum("inventory_adjustment_type", ["purchase", "sale", "return", "adjustment", "transfer", "damage"])

// Product Categories
export const productCategories = pgTable("product_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),

  // Definition
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),

  // Display
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").default(0),
  isVisible: boolean("is_visible").default(true),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("categories_tenant_idx").on(table.tenantId),
  index("categories_parent_idx").on(table.parentId),
  index("categories_slug_idx").on(table.tenantId, table.slug),
])

// Products
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => productCategories.id),

  // Identity
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),
  shortDescription: text("short_description"),

  // Pricing
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: decimal("compare_at_price", { precision: 10, scale: 2 }),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),
  currency: text("currency").default("USD"),

  // Inventory (for simple products)
  sku: text("sku"),
  barcode: text("barcode"),
  quantity: integer("quantity").default(0),
  trackInventory: boolean("track_inventory").default(true),
  allowBackorder: boolean("allow_backorder").default(false),
  lowStockThreshold: integer("low_stock_threshold").default(5),

  // Physical Properties
  weight: decimal("weight", { precision: 10, scale: 3 }),
  weightUnit: text("weight_unit").default("lb"),

  // Status
  status: productStatusEnum("status").notNull().default("draft"),
  isFeatured: boolean("is_featured").default(false),

  // Variants
  hasVariants: boolean("has_variants").default(false),

  // Media
  images: jsonb("images").$type<{ url: string; alt?: string; position: number }[]>().default([]),

  // SEO
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),

  // Tags
  tags: text("tags").array().default([]),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("products_tenant_idx").on(table.tenantId),
  index("products_category_idx").on(table.categoryId),
  index("products_status_idx").on(table.tenantId, table.status),
  index("products_slug_idx").on(table.tenantId, table.slug),
  index("products_sku_idx").on(table.tenantId, table.sku),
])

// Product Variants
export const productVariants = pgTable("product_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),

  // Variant Definition
  name: text("name"),
  options: jsonb("options").$type<Record<string, string>>().notNull().default({}),

  // Pricing
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: decimal("compare_at_price", { precision: 10, scale: 2 }),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),

  // Inventory
  sku: text("sku"),
  barcode: text("barcode"),
  quantity: integer("quantity").default(0),
  lowStockThreshold: integer("low_stock_threshold").default(5),

  // Physical Properties
  weight: decimal("weight", { precision: 10, scale: 3 }),

  // Media
  imageUrl: text("image_url"),

  // Display
  sortOrder: integer("sort_order").default(0),
  isDefault: boolean("is_default").default(false),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("variants_tenant_idx").on(table.tenantId),
  index("variants_product_idx").on(table.productId),
  index("variants_sku_idx").on(table.tenantId, table.sku),
])

// Inventory Locations
export const inventoryLocations = pgTable("inventory_locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Definition
  name: text("name").notNull(),
  code: text("code"),

  // Address
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").default("US"),

  // Settings
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("locations_tenant_idx").on(table.tenantId),
])

// Inventory Levels
export const inventoryLevels = pgTable("inventory_levels", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").notNull().references(() => inventoryLocations.id, { onDelete: "cascade" }),

  // Quantities
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  quantityCommitted: integer("quantity_committed").notNull().default(0),
  quantityIncoming: integer("quantity_incoming").notNull().default(0),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("inventory_tenant_idx").on(table.tenantId),
  index("inventory_product_idx").on(table.productId),
  index("inventory_variant_idx").on(table.variantId),
  index("inventory_location_idx").on(table.locationId),
])

// Inventory Adjustments
export const inventoryAdjustments = pgTable("inventory_adjustments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  inventoryLevelId: uuid("inventory_level_id").notNull().references(() => inventoryLevels.id, { onDelete: "cascade" }),

  // Adjustment Details
  type: inventoryAdjustmentTypeEnum("type").notNull(),
  quantityChange: integer("quantity_change").notNull(),
  quantityBefore: integer("quantity_before").notNull(),
  quantityAfter: integer("quantity_after").notNull(),

  // Reference
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),

  // Attribution
  userId: uuid("user_id").references(() => user.id),
  reason: text("reason"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("adjustments_tenant_idx").on(table.tenantId),
  index("adjustments_level_idx").on(table.inventoryLevelId),
])

// Relations
export const productCategoriesRelations = relations(productCategories, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [productCategories.tenantId],
    references: [tenants.id],
  }),
  parent: one(productCategories, {
    fields: [productCategories.parentId],
    references: [productCategories.id],
    relationName: "categoryHierarchy",
  }),
  children: many(productCategories, { relationName: "categoryHierarchy" }),
  products: many(products),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [products.tenantId],
    references: [tenants.id],
  }),
  category: one(productCategories, {
    fields: [products.categoryId],
    references: [productCategories.id],
  }),
  variants: many(productVariants),
  inventoryLevels: many(inventoryLevels),
}))

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [productVariants.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
  inventoryLevels: many(inventoryLevels),
}))

export const inventoryLocationsRelations = relations(inventoryLocations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [inventoryLocations.tenantId],
    references: [tenants.id],
  }),
  inventoryLevels: many(inventoryLevels),
}))

export const inventoryLevelsRelations = relations(inventoryLevels, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [inventoryLevels.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [inventoryLevels.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [inventoryLevels.variantId],
    references: [productVariants.id],
  }),
  location: one(inventoryLocations, {
    fields: [inventoryLevels.locationId],
    references: [inventoryLocations.id],
  }),
  adjustments: many(inventoryAdjustments),
}))

export const inventoryAdjustmentsRelations = relations(inventoryAdjustments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [inventoryAdjustments.tenantId],
    references: [tenants.id],
  }),
  inventoryLevel: one(inventoryLevels, {
    fields: [inventoryAdjustments.inventoryLevelId],
    references: [inventoryLevels.id],
  }),
  user: one(user, {
    fields: [inventoryAdjustments.userId],
    references: [user.id],
  }),
}))

// Types
export type ProductCategory = typeof productCategories.$inferSelect
export type NewProductCategory = typeof productCategories.$inferInsert
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type ProductVariant = typeof productVariants.$inferSelect
export type NewProductVariant = typeof productVariants.$inferInsert
export type InventoryLocation = typeof inventoryLocations.$inferSelect
export type NewInventoryLocation = typeof inventoryLocations.$inferInsert
export type InventoryLevel = typeof inventoryLevels.$inferSelect
export type NewInventoryLevel = typeof inventoryLevels.$inferInsert
export type InventoryAdjustment = typeof inventoryAdjustments.$inferSelect
export type NewInventoryAdjustment = typeof inventoryAdjustments.$inferInsert
