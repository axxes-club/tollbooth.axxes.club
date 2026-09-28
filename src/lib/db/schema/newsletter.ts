import { pgTable, text, timestamp, uuid, boolean, integer, jsonb, pgEnum, index, varchar } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { contacts } from "./contacts"
import { user } from "./users"

// Enums
export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "scheduled", "sending", "sent", "failed", "cancelled"])
export const newsletterEventEnum = pgEnum("newsletter_event", ["sent", "delivered", "opened", "clicked", "bounced", "complained", "unsubscribed"])
export const listTypeEnum = pgEnum("list_type", ["public", "private"])

// Subscriber Lists
export const subscriberLists = pgTable("subscriber_lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // List details
  name: text("name").notNull(),
  description: text("description"),
  slug: varchar("slug", { length: 100 }).notNull(), // For public subscription URLs
  
  // Settings
  type: listTypeEnum("type").notNull().default("public"),
  doubleOptIn: boolean("double_opt_in").default(true),
  sendWelcomeEmail: boolean("send_welcome_email").default(false),
  welcomeEmailTemplateId: uuid("welcome_email_template_id"),
  
  // Stats
  subscriberCount: integer("subscriber_count").default(0),
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("subscriber_lists_tenant_idx").on(table.tenantId),
  index("subscriber_lists_slug_idx").on(table.tenantId, table.slug),
])

// List Memberships (Contact → List relationship)
export const listMemberships = pgTable("list_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  listId: uuid("list_id").notNull().references(() => subscriberLists.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  
  // Subscription status
  status: varchar("status", { length: 20 }).notNull().default("subscribed"), // subscribed, unsubscribed, pending
  subscribedAt: timestamp("subscribed_at", { withTimezone: true }).defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  unsubscribeReason: text("unsubscribe_reason"),
  
  // Opt-in tracking
  optInToken: varchar("opt_in_token", { length: 64 }),
  optInConfirmedAt: timestamp("opt_in_confirmed_at", { withTimezone: true }),
  
  // Attribution
  source: text("source"), // 'form', 'import', 'api', 'manual'
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("list_memberships_list_idx").on(table.listId),
  index("list_memberships_contact_idx").on(table.contactId),
  index("list_memberships_status_idx").on(table.listId, table.status),
  index("list_memberships_optin_idx").on(table.optInToken),
])

// Email Templates
export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Template details
  name: text("name").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  
  // Content
  htmlContent: text("html_content").notNull(),
  textContent: text("text_content"), // Plain text version
  
  // Template type
  type: varchar("type", { length: 20 }).default("campaign"), // campaign, welcome, transactional
  
  // Default from settings
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  replyTo: text("reply_to"),
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("email_templates_tenant_idx").on(table.tenantId),
  index("email_templates_type_idx").on(table.tenantId, table.type),
])

// Newsletter Campaigns
export const newsletterCampaigns = pgTable("newsletter_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Campaign details
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  previewText: text("preview_text"), // Preheader text
  
  // Content
  htmlContent: text("html_content"),
  textContent: text("text_content"),
  templateId: uuid("template_id").references(() => emailTemplates.id),
  
  // From settings
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  replyTo: text("reply_to"),
  
  // Status
  status: campaignStatusEnum("status").notNull().default("draft"),
  
  // Targeting
  listIds: uuid("list_ids").array().default([]),
  segmentIds: uuid("segment_ids").array().default([]),
  
  // Scheduling
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  
  // Stats
  totalRecipients: integer("total_recipients").default(0),
  sentCount: integer("sent_count").default(0),
  deliveredCount: integer("delivered_count").default(0),
  openedCount: integer("opened_count").default(0),
  clickedCount: integer("clicked_count").default(0),
  bouncedCount: integer("bounced_count").default(0),
  unsubscribedCount: integer("unsubscribed_count").default(0),
  complainedCount: integer("complained_count").default(0),
  
  // Tracking
  trackingEnabled: boolean("tracking_enabled").default(true),
  clickTrackingEnabled: boolean("click_tracking_enabled").default(true),
  openTrackingEnabled: boolean("open_tracking_enabled").default(true),
  
  // Archive
  archiveUrl: text("archive_url"),
  
  // Attribution
  createdById: uuid("created_by_id").references(() => user.id),
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("campaigns_tenant_idx").on(table.tenantId),
  index("campaigns_status_idx").on(table.tenantId, table.status),
  index("campaigns_scheduled_idx").on(table.scheduledAt),
])

// Individual Send Records
export const newsletterSends = pgTable("newsletter_sends", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => newsletterCampaigns.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  listId: uuid("list_id").references(() => subscriberLists.id, { onDelete: "set null" }),
  
  // Delivery info
  toEmail: text("to_email").notNull(),
  externalId: text("external_id"), // ID from email provider (Resend, etc.)
  
  // Tracking
  trackingToken: varchar("tracking_token", { length: 64 }).notNull(),
  
  // Status
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, sent, delivered, failed
  
  // Timestamps
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  firstClickedAt: timestamp("first_clicked_at", { withTimezone: true }),
  openCount: integer("open_count").default(0),
  clickCount: integer("click_count").default(0),
  
  // Error tracking
  errorMessage: text("error_message"),
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("sends_tenant_idx").on(table.tenantId),
  index("sends_campaign_idx").on(table.campaignId),
  index("sends_contact_idx").on(table.contactId),
  index("sends_token_idx").on(table.trackingToken),
  index("sends_external_idx").on(table.externalId),
])

// Newsletter Events (Opens, Clicks, Bounces, etc.)
export const newsletterEvents = pgTable("newsletter_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => newsletterCampaigns.id, { onDelete: "cascade" }),
  sendId: uuid("send_id").references(() => newsletterSends.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  
  // Event details
  event: newsletterEventEnum("event").notNull(),
  
  // Metadata
  metadata: jsonb("metadata").$type<NewsletterEventMetadata>().default({}),
  
  // Click tracking
  url: text("url"), // For click events
  linkId: text("link_id"), // Unique link identifier
  
  // Bounce details
  bounceType: text("bounce_type"), // hard, soft
  bounceReason: text("bounce_reason"),
  
  // User agent / IP
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  
  // Timestamp
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("newsletter_events_tenant_idx").on(table.tenantId),
  index("newsletter_events_campaign_idx").on(table.campaignId),
  index("newsletter_events_send_idx").on(table.sendId),
  index("newsletter_events_contact_idx").on(table.contactId),
  index("newsletter_events_event_idx").on(table.event),
  index("newsletter_events_occurred_idx").on(table.occurredAt),
])

// Newsletter Settings (per tenant)
export const newsletterSettings = pgTable("newsletter_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  
  // Email provider settings
  emailProvider: varchar("email_provider", { length: 20 }).default("smtp"), // smtp, resend, sendgrid, etc.
  
  // Default from settings
  defaultFromName: text("default_from_name"),
  defaultFromEmail: text("default_from_email"),
  defaultReplyTo: text("default_reply_to"),
  
  // Provider-specific credentials (encrypted)
  resendApiKey: text("resend_api_key"),
  sendgridApiKey: text("sendgrid_api_key"),
  mailgunApiKey: text("mailgun_api_key"),
  mailgunDomain: text("mailgun_domain"),
  
  // SMTP settings (alternative to provider APIs)
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPassword: text("smtp_password"),
  smtpSecure: boolean("smtp_secure").default(true),
  
  // Tracking settings
  openTrackingEnabled: boolean("open_tracking_enabled").default(true),
  clickTrackingEnabled: boolean("click_tracking_enabled").default(true),
  
  // Branding
  unsubscribePageUrl: text("unsubscribe_page_url"),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color"),
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("newsletter_settings_tenant_idx").on(table.tenantId),
])

// Tracked Links (for click tracking)
export const trackedLinks = pgTable("tracked_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => newsletterCampaigns.id, { onDelete: "cascade" }),
  
  // Link details
  originalUrl: text("original_url").notNull(),
  linkToken: varchar("link_token", { length: 32 }).notNull(),
  
  // Stats
  clickCount: integer("click_count").default(0),
  uniqueClickCount: integer("unique_click_count").default(0),
  
  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("tracked_links_token_idx").on(table.linkToken),
  index("tracked_links_campaign_idx").on(table.campaignId),
])

// Relations
export const subscriberListsRelations = relations(subscriberLists, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [subscriberLists.tenantId],
    references: [tenants.id],
  }),
  memberships: many(listMemberships),
}))

export const listMembershipsRelations = relations(listMemberships, ({ one }) => ({
  list: one(subscriberLists, {
    fields: [listMemberships.listId],
    references: [subscriberLists.id],
  }),
  contact: one(contacts, {
    fields: [listMemberships.contactId],
    references: [contacts.id],
  }),
}))

export const emailTemplatesRelations = relations(emailTemplates, ({ one }) => ({
  tenant: one(tenants, {
    fields: [emailTemplates.tenantId],
    references: [tenants.id],
  }),
}))

export const newsletterCampaignsRelations = relations(newsletterCampaigns, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [newsletterCampaigns.tenantId],
    references: [tenants.id],
  }),
  template: one(emailTemplates, {
    fields: [newsletterCampaigns.templateId],
    references: [emailTemplates.id],
  }),
  createdBy: one(user, {
    fields: [newsletterCampaigns.createdById],
    references: [user.id],
  }),
  sends: many(newsletterSends),
  events: many(newsletterEvents),
  trackedLinks: many(trackedLinks),
}))

export const newsletterSendsRelations = relations(newsletterSends, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [newsletterSends.tenantId],
    references: [tenants.id],
  }),
  campaign: one(newsletterCampaigns, {
    fields: [newsletterSends.campaignId],
    references: [newsletterCampaigns.id],
  }),
  contact: one(contacts, {
    fields: [newsletterSends.contactId],
    references: [contacts.id],
  }),
  list: one(subscriberLists, {
    fields: [newsletterSends.listId],
    references: [subscriberLists.id],
  }),
  events: many(newsletterEvents),
}))

export const newsletterEventsRelations = relations(newsletterEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [newsletterEvents.tenantId],
    references: [tenants.id],
  }),
  campaign: one(newsletterCampaigns, {
    fields: [newsletterEvents.campaignId],
    references: [newsletterCampaigns.id],
  }),
  send: one(newsletterSends, {
    fields: [newsletterEvents.sendId],
    references: [newsletterSends.id],
  }),
  contact: one(contacts, {
    fields: [newsletterEvents.contactId],
    references: [contacts.id],
  }),
}))

export const newsletterSettingsRelations = relations(newsletterSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [newsletterSettings.tenantId],
    references: [tenants.id],
  }),
}))

export const trackedLinksRelations = relations(trackedLinks, ({ one }) => ({
  tenant: one(tenants, {
    fields: [trackedLinks.tenantId],
    references: [tenants.id],
  }),
  campaign: one(newsletterCampaigns, {
    fields: [trackedLinks.campaignId],
    references: [newsletterCampaigns.id],
  }),
}))

// Types
export interface NewsletterEventMetadata {
  user_agent?: string
  ip_address?: string
  location?: string
  device?: string
  browser?: string
  os?: string
  [key: string]: unknown
}

export type SubscriberList = typeof subscriberLists.$inferSelect
export type NewSubscriberList = typeof subscriberLists.$inferInsert
export type ListMembership = typeof listMemberships.$inferSelect
export type NewListMembership = typeof listMemberships.$inferInsert
export type EmailTemplate = typeof emailTemplates.$inferSelect
export type NewEmailTemplate = typeof emailTemplates.$inferInsert
export type NewsletterCampaign = typeof newsletterCampaigns.$inferSelect
export type NewNewsletterCampaign = typeof newsletterCampaigns.$inferInsert
export type NewsletterSend = typeof newsletterSends.$inferSelect
export type NewNewsletterSend = typeof newsletterSends.$inferInsert
export type NewsletterEvent = typeof newsletterEvents.$inferSelect
export type NewNewsletterEvent = typeof newsletterEvents.$inferInsert
export type NewsletterSettings = typeof newsletterSettings.$inferSelect
export type NewNewsletterSettings = typeof newsletterSettings.$inferInsert
export type TrackedLink = typeof trackedLinks.$inferSelect
export type NewTrackedLink = typeof trackedLinks.$inferInsert