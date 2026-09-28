import { pgTable, text, timestamp, uuid, boolean, jsonb, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./users"

// Enums
export const tenantTypeEnum = pgEnum("tenant_type", ["promoter", "venue", "agency", "brand"])
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "suspended", "pending", "cancelled"])
export const teamRoleEnum = pgEnum("team_role", ["owner", "admin", "manager", "member", "viewer"])
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "expired", "revoked"])

// Tenants table
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Identity
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull().default("business"),
  status: tenantStatusEnum("status").notNull().default("pending"),
  ownerId: text("owner_id").notNull(),

  // Contact Info
  email: text("email"),
  phone: text("phone"),
  website: text("website"),

  // Branding
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  primaryColor: text("primary_color"),

  // Address
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").default("US"),

  // Settings
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),

  // Billing
  stripeCustomerId: text("stripe_customer_id"),
  subscriptionTier: text("subscription_tier").default("free"),
  subscriptionStatus: text("subscription_status"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("tenants_slug_idx").on(table.slug),
  index("tenants_status_idx").on(table.status),
  index("tenants_stripe_customer_idx").on(table.stripeCustomerId),
])

// Tenant Memberships (User-Tenant relationships)
export const tenantMemberships = pgTable("tenant_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),

  // Role & Permissions
  role: teamRoleEnum("role").notNull().default("member"),
  permissions: jsonb("permissions").$type<string[]>().default([]),

  // Status
  isPrimary: boolean("is_primary").default(false),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("memberships_tenant_idx").on(table.tenantId),
  index("memberships_user_idx").on(table.userId),
  uniqueIndex("memberships_tenant_user_idx").on(table.tenantId, table.userId),
])

// Tenant Invitations
export const tenantInvitations = pgTable("tenant_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Invitation Details
  email: text("email").notNull(),
  role: teamRoleEnum("role").notNull().default("member"),
  token: text("token").notNull().unique(),

  // Status
  status: invitationStatusEnum("status").notNull().default("pending"),
  invitedById: text("invited_by_id"),
  acceptedById: text("accepted_by_id"),

  // Expiration
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("invitations_tenant_idx").on(table.tenantId),
  index("invitations_email_idx").on(table.email),
  index("invitations_token_idx").on(table.token),
])

// Relations
export const tenantsRelations = relations(tenants, ({ many }) => ({
  memberships: many(tenantMemberships),
  invitations: many(tenantInvitations),
}))

export const tenantMembershipsRelations = relations(tenantMemberships, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantMemberships.tenantId],
    references: [tenants.id],
  }),
  user: one(user, {
    fields: [tenantMemberships.userId],
    references: [user.id],
  }),
}))

export const tenantInvitationsRelations = relations(tenantInvitations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantInvitations.tenantId],
    references: [tenants.id],
  }),
  invitedBy: one(user, {
    fields: [tenantInvitations.invitedById],
    references: [user.id],
  }),
}))

// Types
export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type TenantMembership = typeof tenantMemberships.$inferSelect
export type NewTenantMembership = typeof tenantMemberships.$inferInsert
export type TenantInvitation = typeof tenantInvitations.$inferSelect
export type NewTenantInvitation = typeof tenantInvitations.$inferInsert
