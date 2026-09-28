import { pgTable, text, uuid, timestamp, jsonb, integer } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"

// Digital Asset Management
export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Basic info
  name: text("name").notNull(),
  description: text("description"),

  // File info
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"), // bytes
  width: integer("width"), // for images
  height: integer("height"), // for images

  // Organization
  folder: text("folder"), // virtual folder path
  tags: jsonb("tags").$type<string[]>(),
  category: text("category"), // "image", "video", "document", "audio"

  // Source tracking
  source: text("source").default("url"), // "url" | "upload"
  originalFilename: text("original_filename"),

  // Alt text for accessibility/SEO
  altText: text("alt_text"),

  // Usage tracking
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const assetsRelations = relations(assets, ({ one }) => ({
  tenant: one(tenants, {
    fields: [assets.tenantId],
    references: [tenants.id],
  }),
}))

export type Asset = typeof assets.$inferSelect
export type NewAsset = typeof assets.$inferInsert
