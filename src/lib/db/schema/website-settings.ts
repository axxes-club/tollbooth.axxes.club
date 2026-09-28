import { pgTable, text, uuid, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"

// Website Settings table
export const websiteSettings = pgTable("website_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Domain/URL
  customDomain: text("custom_domain"),
  subdomain: text("subdomain"), // e.g., "myband" for myband.members.axxes.club

  // Global settings
  navigationStyle: text("navigation_style").default("horizontal").notNull(), // 'horizontal', 'hamburger', 'none'
  footerStyle: text("footer_style").default("minimal").notNull(), // 'minimal', 'full', 'none'

  // Analytics
  googleAnalyticsId: text("google_analytics_id"),
  facebookPixelId: text("facebook_pixel_id"),

  // Social preview
  defaultOgImage: text("default_og_image"),

  // Footer content
  footerText: text("footer_text"),
  showPoweredBy: text("show_powered_by").default("true"), // stored as text for flexibility

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("website_settings_tenant_idx").on(table.tenantId),
  uniqueIndex("website_settings_subdomain_idx").on(table.subdomain),
])

// Relations
export const websiteSettingsRelations = relations(websiteSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [websiteSettings.tenantId],
    references: [tenants.id],
  }),
}))

// Types
export type WebsiteSettings = typeof websiteSettings.$inferSelect
export type NewWebsiteSettings = typeof websiteSettings.$inferInsert
