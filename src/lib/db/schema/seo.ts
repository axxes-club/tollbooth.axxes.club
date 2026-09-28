import { pgTable, text, uuid, timestamp, jsonb, boolean, unique } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"

// Global SEO settings per tenant
export const seoSettings = pgTable("seo_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Global defaults
  siteName: text("site_name"),
  siteDescription: text("site_description"),
  defaultOgImage: text("default_og_image"),
  twitterHandle: text("twitter_handle"),

  // robots.txt configuration
  robotsTxt: text("robots_txt"),
  allowIndexing: boolean("allow_indexing").default(true),

  // Structured data (JSON-LD defaults)
  organizationSchema: jsonb("organization_schema").$type<{
    "@type": string
    name: string
    logo?: string
    url?: string
    sameAs?: string[]
    contactPoint?: { "@type": string; telephone: string; contactType: string }
  }>(),

  // Sitemap settings
  sitemapEnabled: boolean("sitemap_enabled").default(true),
  sitemapExclusions: jsonb("sitemap_exclusions").$type<string[]>(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const seoSettingsRelations = relations(seoSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [seoSettings.tenantId],
    references: [tenants.id],
  }),
}))

// Per-entity SEO metadata (polymorphic)
export const seoMetadata = pgTable("seo_metadata", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Polymorphic reference to any entity
  entityType: text("entity_type").notNull(), // "event", "product", "page"
  entityId: uuid("entity_id").notNull(),

  // SEO fields
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  ogTitle: text("og_title"),
  ogDescription: text("og_description"),
  ogImage: text("og_image"),
  canonicalUrl: text("canonical_url"),
  noIndex: boolean("no_index").default(false),
  noFollow: boolean("no_follow").default(false),

  // Structured data override (JSON-LD)
  structuredData: jsonb("structured_data"),

  // URL/slug management
  slug: text("slug"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("seo_metadata_tenant_entity_idx").on(table.tenantId, table.entityType, table.entityId),
])

export const seoMetadataRelations = relations(seoMetadata, ({ one }) => ({
  tenant: one(tenants, {
    fields: [seoMetadata.tenantId],
    references: [tenants.id],
  }),
}))

export type SeoSettings = typeof seoSettings.$inferSelect
export type NewSeoSettings = typeof seoSettings.$inferInsert
export type SeoMetadata = typeof seoMetadata.$inferSelect
export type NewSeoMetadata = typeof seoMetadata.$inferInsert
