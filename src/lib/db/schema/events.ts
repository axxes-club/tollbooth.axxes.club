import { pgTable, text, timestamp, uuid, integer, decimal, boolean, jsonb, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { user } from "./users"
import { contacts } from "./contacts"

// Enums
export const eventStatusEnum = pgEnum("event_status", ["draft", "published", "cancelled", "postponed", "completed"])
export const ticketStatusEnum = pgEnum("ticket_status", ["available", "sold_out", "hidden", "expired"])
export const attendeeStatusEnum = pgEnum("attendee_status", ["registered", "confirmed", "checked_in", "cancelled", "no_show"])

// Venues table
export const venues = pgTable("venues", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Identity
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),

  // Capacity
  capacity: integer("capacity"),

  // Location
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").default("US"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),

  // Contact
  phone: text("phone"),
  email: text("email"),
  website: text("website"),

  // Media
  images: jsonb("images").$type<string[]>().default([]),

  // Metadata
  amenities: jsonb("amenities").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("venues_tenant_idx").on(table.tenantId),
  index("venues_slug_idx").on(table.tenantId, table.slug),
])

// Events table
export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  venueId: uuid("venue_id").references(() => venues.id),

  // Identity
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),
  shortDescription: text("short_description"),

  // Scheduling
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  doorsOpenAt: timestamp("doors_open_at", { withTimezone: true }),
  timezone: text("timezone").default("America/New_York"),

  // Status
  status: eventStatusEnum("status").notNull().default("draft"),
  isFeatured: boolean("is_featured").default(false),
  isPrivate: boolean("is_private").default(false),

  // Media
  coverImageUrl: text("cover_image_url"),
  images: jsonb("images").$type<string[]>().default([]),

  // External Integration (afters.am stub)
  externalEventId: text("external_event_id"),
  externalPlatform: text("external_platform"),
  externalUrl: text("external_url"),
  syncEnabled: boolean("sync_enabled").default(false),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),

  // Categorization
  category: text("category"),
  tags: text("tags").array().default([]),

  // Age Restriction
  minimumAge: integer("minimum_age"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdById: uuid("created_by_id").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("events_tenant_idx").on(table.tenantId),
  index("events_venue_idx").on(table.venueId),
  index("events_status_idx").on(table.tenantId, table.status),
  index("events_starts_idx").on(table.tenantId, table.startsAt),
  index("events_slug_idx").on(table.tenantId, table.slug),
])

// Ticket Types
export const ticketTypes = pgTable("ticket_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),

  // Definition
  name: text("name").notNull(),
  description: text("description"),

  // Pricing
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),

  // Inventory
  quantityTotal: integer("quantity_total"),
  quantitySold: integer("quantity_sold").default(0),
  quantityReserved: integer("quantity_reserved").default(0),

  // Availability
  status: ticketStatusEnum("status").notNull().default("available"),
  salesStartAt: timestamp("sales_start_at", { withTimezone: true }),
  salesEndAt: timestamp("sales_end_at", { withTimezone: true }),

  // Limits
  minPerOrder: integer("min_per_order").default(1),
  maxPerOrder: integer("max_per_order").default(10),

  // Display
  sortOrder: integer("sort_order").default(0),
  isHidden: boolean("is_hidden").default(false),

  // External Integration
  externalTicketTypeId: text("external_ticket_type_id"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("ticket_types_tenant_idx").on(table.tenantId),
  index("ticket_types_event_idx").on(table.eventId),
])

// Attendees
export const attendees = pgTable("attendees", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id),
  ticketTypeId: uuid("ticket_type_id").references(() => ticketTypes.id),
  orderId: uuid("order_id"),

  // Attendee Details
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),

  // Ticket
  ticketCode: text("ticket_code").notNull().unique(),
  status: attendeeStatusEnum("status").notNull().default("registered"),

  // Check-in
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  checkedInBy: uuid("checked_in_by").references(() => user.id),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("attendees_event_idx").on(table.eventId),
  uniqueIndex("attendees_ticket_code_idx").on(table.ticketCode),
])

// Relations
export const venuesRelations = relations(venues, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [venues.tenantId],
    references: [tenants.id],
  }),
  events: many(events),
}))

export const eventsRelations = relations(events, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [events.tenantId],
    references: [tenants.id],
  }),
  venue: one(venues, {
    fields: [events.venueId],
    references: [venues.id],
  }),
  createdBy: one(user, {
    fields: [events.createdById],
    references: [user.id],
  }),
  ticketTypes: many(ticketTypes),
  attendees: many(attendees),
}))

export const ticketTypesRelations = relations(ticketTypes, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [ticketTypes.tenantId],
    references: [tenants.id],
  }),
  event: one(events, {
    fields: [ticketTypes.eventId],
    references: [events.id],
  }),
  attendees: many(attendees),
}))

export const attendeesRelations = relations(attendees, ({ one }) => ({
  tenant: one(tenants, {
    fields: [attendees.tenantId],
    references: [tenants.id],
  }),
  event: one(events, {
    fields: [attendees.eventId],
    references: [events.id],
  }),
  contact: one(contacts, {
    fields: [attendees.contactId],
    references: [contacts.id],
  }),
  ticketType: one(ticketTypes, {
    fields: [attendees.ticketTypeId],
    references: [ticketTypes.id],
  }),
  checkedInByUser: one(user, {
    fields: [attendees.checkedInBy],
    references: [user.id],
  }),
}))

// Types
export type Venue = typeof venues.$inferSelect
export type NewVenue = typeof venues.$inferInsert
export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
export type TicketType = typeof ticketTypes.$inferSelect
export type NewTicketType = typeof ticketTypes.$inferInsert
export type Attendee = typeof attendees.$inferSelect
export type NewAttendee = typeof attendees.$inferInsert
