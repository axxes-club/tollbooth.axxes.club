import { pgTable, text, uuid, timestamp, boolean } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"

// Theme settings per tenant
export const themeSettings = pgTable("theme_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Theme mode: "light", "dark", or "system"
  mode: text("mode").default("system"),

  // Apply brand profile colors to dashboard
  applyBrandColors: boolean("apply_brand_colors").default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const themeSettingsRelations = relations(themeSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [themeSettings.tenantId],
    references: [tenants.id],
  }),
}))

export type ThemeSettings = typeof themeSettings.$inferSelect
export type NewThemeSettings = typeof themeSettings.$inferInsert
