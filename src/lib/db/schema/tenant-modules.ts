import { pgTable, text, timestamp, uuid, boolean, uniqueIndex, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"

/**
 * Per-tenant module (feature flag) toggles. Only rows for modules that have
 * been explicitly toggled away from their default are stored; the module
 * registry (src/lib/modules.ts) defines defaults. Superadmins manage these
 * from the admin dashboard.
 */
export const tenantModules = pgTable("tenant_modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  moduleKey: text("module_key").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedBy: text("updated_by"), // superadmin user id
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("tenant_modules_tenant_module_idx").on(table.tenantId, table.moduleKey),
  index("tenant_modules_tenant_idx").on(table.tenantId),
])

export const tenantModulesRelations = relations(tenantModules, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantModules.tenantId],
    references: [tenants.id],
  }),
}))

export type TenantModule = typeof tenantModules.$inferSelect
export type NewTenantModule = typeof tenantModules.$inferInsert