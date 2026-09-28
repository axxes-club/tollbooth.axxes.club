import { pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./users"
import { tenants } from "./tenants"

// Login Activity table - tracks user login events for audit purposes
export const loginActivity = pgTable("login_activity", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),

  // Event info
  eventType: text("event_type").notNull(), // "login", "logout", "session_refresh"
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  // Additional metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Timestamp
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("login_activity_user_idx").on(table.userId),
  index("login_activity_created_idx").on(table.createdAt),
  index("login_activity_tenant_idx").on(table.tenantId),
])

// Relations
export const loginActivityRelations = relations(loginActivity, ({ one }) => ({
  user: one(user, {
    fields: [loginActivity.userId],
    references: [user.id],
  }),
  tenant: one(tenants, {
    fields: [loginActivity.tenantId],
    references: [tenants.id],
  }),
}))

// Types
export type LoginActivity = typeof loginActivity.$inferSelect
export type NewLoginActivity = typeof loginActivity.$inferInsert
