import { pgTable, text, timestamp, boolean, index, jsonb } from "drizzle-orm/pg-core"
import { user } from "./users"
import { tenants } from "./tenants"

// Integration connections (OAuth and API key based)
export const integrationConnection = pgTable("integration_connection", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  
  // Integration identifier
  provider: text("provider").notNull(), // "afters", "qortr", "peerspace", etc.
  
  // OAuth tokens (for OAuth integrations)
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"), // Space-separated scopes
  
  // API Key (for non-OAuth integrations)
  apiKey: text("api_key"),
  accountId: text("account_id"), // External account ID if needed
  
  // Connection metadata
  externalUserId: text("external_user_id"), // User ID in the external system
  externalUserEmail: text("external_user_email"),
  externalUserName: text("external_user_name"),
  metadata: jsonb("metadata"), // Any additional provider-specific data
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("integration_tenant_idx").on(table.tenantId),
  index("integration_user_idx").on(table.userId),
  index("integration_provider_idx").on(table.tenantId, table.provider),
])

export type IntegrationConnection = typeof integrationConnection.$inferSelect
export type NewIntegrationConnection = typeof integrationConnection.$inferInsert
