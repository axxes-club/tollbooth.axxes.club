import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, pgEnum, index, uniqueIndex, date } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { user } from "./users"
import { events } from "./events"
import { products } from "./inventory"

// Enums
export const socialPlatformEnum = pgEnum("social_platform", ["instagram", "tiktok", "facebook", "twitter", "linkedin"])
export const postStatusEnum = pgEnum("post_status", ["draft", "scheduled", "published", "failed", "deleted"])
export const mediaTypeEnum = pgEnum("media_type", ["image", "video", "carousel", "story", "reel"])

// Social Accounts
export const socialAccounts = pgTable("social_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Platform
  platform: socialPlatformEnum("platform").notNull(),

  // Account Info
  platformAccountId: text("platform_account_id").notNull(),
  username: text("username"),
  displayName: text("display_name"),
  profileUrl: text("profile_url"),
  avatarUrl: text("avatar_url"),

  // Authentication
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  scopes: text("scopes").array().default([]),

  // Status
  isActive: boolean("is_active").default(true),
  isConnected: boolean("is_connected").default(true),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),

  // Stats (cached)
  followersCount: integer("followers_count").default(0),
  followingCount: integer("following_count").default(0),
  postsCount: integer("posts_count").default(0),
  statsUpdatedAt: timestamp("stats_updated_at", { withTimezone: true }),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Attribution
  connectedById: uuid("connected_by_id").references(() => user.id),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow(),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("social_accounts_tenant_idx").on(table.tenantId),
  index("social_accounts_platform_idx").on(table.tenantId, table.platform),
  uniqueIndex("social_accounts_platform_id_idx").on(table.platform, table.platformAccountId),
])

// Social Posts
export const socialPosts = pgTable("social_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  socialAccountId: uuid("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),

  // Content
  content: text("content"),
  mediaType: mediaTypeEnum("media_type"),
  mediaUrls: jsonb("media_urls").$type<string[]>().default([]),

  // Scheduling
  status: postStatusEnum("status").notNull().default("draft"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),

  // Platform Details
  platformPostId: text("platform_post_id"),
  platformUrl: text("platform_url"),

  // Related Content
  eventId: uuid("event_id").references(() => events.id),
  productId: uuid("product_id").references(() => products.id),

  // Tags & Mentions
  hashtags: text("hashtags").array().default([]),
  mentions: text("mentions").array().default([]),

  // Location
  locationName: text("location_name"),
  locationId: text("location_id"),

  // Error Handling
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  // Attribution
  createdById: uuid("created_by_id").references(() => user.id),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("posts_tenant_idx").on(table.tenantId),
  index("posts_account_idx").on(table.socialAccountId),
  index("posts_status_idx").on(table.tenantId, table.status),
  index("posts_scheduled_idx").on(table.scheduledFor),
  index("posts_event_idx").on(table.eventId),
  index("posts_product_idx").on(table.productId),
])

// Social Post Analytics
export const socialPostAnalytics = pgTable("social_post_analytics", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  postId: uuid("post_id").notNull().references(() => socialPosts.id, { onDelete: "cascade" }),

  // Engagement Metrics
  impressions: integer("impressions").default(0),
  reach: integer("reach").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  saves: integer("saves").default(0),
  clicks: integer("clicks").default(0),

  // Video Metrics
  videoViews: integer("video_views").default(0),
  videoWatchTime: integer("video_watch_time").default(0),

  // Profile Actions
  profileVisits: integer("profile_visits").default(0),
  follows: integer("follows").default(0),

  // Snapshot Time
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),

  // Raw Response
  rawData: jsonb("raw_data").$type<Record<string, unknown>>().default({}),
}, (table) => [
  index("post_analytics_tenant_idx").on(table.tenantId),
  index("post_analytics_post_idx").on(table.postId),
  index("post_analytics_recorded_idx").on(table.postId, table.recordedAt),
])

// Social Account Analytics
export const socialAccountAnalytics = pgTable("social_account_analytics", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  socialAccountId: uuid("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),

  // Date
  date: date("date").notNull(),

  // Follower Metrics
  followersCount: integer("followers_count").default(0),
  followersGained: integer("followers_gained").default(0),
  followersLost: integer("followers_lost").default(0),

  // Engagement Metrics
  totalImpressions: integer("total_impressions").default(0),
  totalReach: integer("total_reach").default(0),
  totalEngagement: integer("total_engagement").default(0),

  // Content Metrics
  postsPublished: integer("posts_published").default(0),

  // Demographics
  demographics: jsonb("demographics").$type<Record<string, unknown>>().default({}),

  // Raw Response
  rawData: jsonb("raw_data").$type<Record<string, unknown>>().default({}),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("account_analytics_tenant_idx").on(table.tenantId),
  index("account_analytics_account_idx").on(table.socialAccountId),
  index("account_analytics_date_idx").on(table.socialAccountId, table.date),
  uniqueIndex("account_analytics_unique_idx").on(table.socialAccountId, table.date),
])

// Relations
export const socialAccountsRelations = relations(socialAccounts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [socialAccounts.tenantId],
    references: [tenants.id],
  }),
  connectedBy: one(user, {
    fields: [socialAccounts.connectedById],
    references: [user.id],
  }),
  posts: many(socialPosts),
  analytics: many(socialAccountAnalytics),
}))

export const socialPostsRelations = relations(socialPosts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [socialPosts.tenantId],
    references: [tenants.id],
  }),
  socialAccount: one(socialAccounts, {
    fields: [socialPosts.socialAccountId],
    references: [socialAccounts.id],
  }),
  event: one(events, {
    fields: [socialPosts.eventId],
    references: [events.id],
  }),
  product: one(products, {
    fields: [socialPosts.productId],
    references: [products.id],
  }),
  createdBy: one(user, {
    fields: [socialPosts.createdById],
    references: [user.id],
  }),
  analytics: many(socialPostAnalytics),
}))

export const socialPostAnalyticsRelations = relations(socialPostAnalytics, ({ one }) => ({
  tenant: one(tenants, {
    fields: [socialPostAnalytics.tenantId],
    references: [tenants.id],
  }),
  post: one(socialPosts, {
    fields: [socialPostAnalytics.postId],
    references: [socialPosts.id],
  }),
}))

export const socialAccountAnalyticsRelations = relations(socialAccountAnalytics, ({ one }) => ({
  tenant: one(tenants, {
    fields: [socialAccountAnalytics.tenantId],
    references: [tenants.id],
  }),
  socialAccount: one(socialAccounts, {
    fields: [socialAccountAnalytics.socialAccountId],
    references: [socialAccounts.id],
  }),
}))

// Types
export type SocialAccount = typeof socialAccounts.$inferSelect
export type NewSocialAccount = typeof socialAccounts.$inferInsert
export type SocialPost = typeof socialPosts.$inferSelect
export type NewSocialPost = typeof socialPosts.$inferInsert
export type SocialPostAnalytics = typeof socialPostAnalytics.$inferSelect
export type NewSocialPostAnalytics = typeof socialPostAnalytics.$inferInsert
export type SocialAccountAnalytics = typeof socialAccountAnalytics.$inferSelect
export type NewSocialAccountAnalytics = typeof socialAccountAnalytics.$inferInsert
