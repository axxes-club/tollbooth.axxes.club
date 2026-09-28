import { pgTable, text, timestamp, uuid, integer, jsonb, pgEnum, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { user } from "./users"

// Enums
export const contactTypeEnum = pgEnum("contact_type", ["lead", "customer", "vip", "vendor", "partner"])
export const leadStatusEnum = pgEnum("lead_status", ["new", "contacted", "qualified", "converted", "lost"])
export const interactionTypeEnum = pgEnum("interaction_type", ["email", "call", "meeting", "note", "sms", "social"])

// Contacts table
export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Identity
  email: text("email"),
  phone: text("phone"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  company: text("company"),
  jobTitle: text("job_title"),

  // Classification
  type: contactTypeEnum("type").notNull().default("lead"),
  tags: text("tags").array().default([]),

  // Lead Tracking
  leadStatus: leadStatusEnum("lead_status"),
  leadSource: text("lead_source"),
  leadScore: integer("lead_score").default(0),

  // Social Profiles
  instagramHandle: text("instagram_handle"),
  tiktokHandle: text("tiktok_handle"),
  twitterHandle: text("twitter_handle"),
  linkedinUrl: text("linkedin_url"),

  // Address
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country"),

  // Metadata
  customFields: jsonb("custom_fields").$type<Record<string, unknown>>().default({}),
  notes: text("notes"),

  // Attribution
  assignedToId: uuid("assigned_to_id").references(() => user.id),
  convertedAt: timestamp("converted_at", { withTimezone: true }),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("contacts_tenant_idx").on(table.tenantId),
  index("contacts_email_idx").on(table.tenantId, table.email),
  index("contacts_type_idx").on(table.tenantId, table.type),
  index("contacts_assigned_idx").on(table.assignedToId),
])

// Customer Segments
export const customerSegments = pgTable("customer_segments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Definition
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),

  // Filter Criteria
  filterCriteria: jsonb("filter_criteria").$type<SegmentFilter[]>().notNull().default([]),

  // Type
  isDynamic: boolean("is_dynamic").default(true),

  // Stats
  contactCount: integer("contact_count").default(0),
  lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true }),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("segments_tenant_idx").on(table.tenantId),
])

// Segment Memberships
export const segmentMemberships = pgTable("segment_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  segmentId: uuid("segment_id").notNull().references(() => customerSegments.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("segment_memberships_segment_idx").on(table.segmentId),
  index("segment_memberships_contact_idx").on(table.contactId),
])

// Contact Interactions
export const contactInteractions = pgTable("contact_interactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),

  // Interaction Details
  type: interactionTypeEnum("type").notNull(),
  subject: text("subject"),
  content: text("content"),

  // Attribution
  userId: uuid("user_id").references(() => user.id),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Timing
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("interactions_tenant_idx").on(table.tenantId),
  index("interactions_contact_idx").on(table.contactId),
])

// Relations
export const contactsRelations = relations(contacts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [contacts.tenantId],
    references: [tenants.id],
  }),
  assignedTo: one(user, {
    fields: [contacts.assignedToId],
    references: [user.id],
  }),
  interactions: many(contactInteractions),
  segmentMemberships: many(segmentMemberships),
}))

export const customerSegmentsRelations = relations(customerSegments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [customerSegments.tenantId],
    references: [tenants.id],
  }),
  memberships: many(segmentMemberships),
}))

export const segmentMembershipsRelations = relations(segmentMemberships, ({ one }) => ({
  segment: one(customerSegments, {
    fields: [segmentMemberships.segmentId],
    references: [customerSegments.id],
  }),
  contact: one(contacts, {
    fields: [segmentMemberships.contactId],
    references: [contacts.id],
  }),
}))

export const contactInteractionsRelations = relations(contactInteractions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [contactInteractions.tenantId],
    references: [tenants.id],
  }),
  contact: one(contacts, {
    fields: [contactInteractions.contactId],
    references: [contacts.id],
  }),
  user: one(user, {
    fields: [contactInteractions.userId],
    references: [user.id],
  }),
}))

// Types
interface SegmentFilter {
  field: string
  operator: "equals" | "contains" | "gt" | "lt" | "in" | "notIn"
  value: unknown
}

export type Contact = typeof contacts.$inferSelect
export type NewContact = typeof contacts.$inferInsert
export type CustomerSegment = typeof customerSegments.$inferSelect
export type NewCustomerSegment = typeof customerSegments.$inferInsert
export type ContactInteraction = typeof contactInteractions.$inferSelect
export type NewContactInteraction = typeof contactInteractions.$inferInsert

// Import boolean for the schema
import { boolean } from "drizzle-orm/pg-core"
