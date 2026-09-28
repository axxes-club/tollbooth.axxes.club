import { pgTable, text, timestamp, uuid, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"
import { products } from "./inventory"

/**
 * Curatorial metadata for artwork inventory items (1:1 with products).
 * Keeps the generic e-commerce `products` table clean while giving
 * gallery/collection tenants first-class artwork fields.
 */
export const artworkDetails = pgTable("artwork_details", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),

  // Attribution
  artistName: text("artist_name"), // Full display name, e.g. "Alfonso Arana"
  artistSortName: text("artist_sort_name"), // e.g. "Arana, Alfonso"
  artistSlug: text("artist_slug"), // links to glossary/bio record

  // Object description
  title: text("title"), // Work title, e.g. "Jazz"
  medium: text("medium"), // e.g. "Litografía sobre papel"
  dimensions: text("dimensions"), // e.g. "22” x 17 5/8”"
  year: text("year"),
  edition: text("edition"), // e.g. "Ed. 8/175"
  series: text("series"), // e.g. "Trailer Park Projects"

  // Inventory & custody
  inventoryNumber: text("inventory_number"), // e.g. "CRV #0125d"
  location: text("location"), // Current physical location / custody
  origin: text("origin"), // Origin of the artist or the piece

  // Exhibition & publication history — pieces shown at museums/institutions gain value
  publications: jsonb("publications")
    .$type<Array<{ title: string; venue?: string; year?: string; url?: string; note?: string }>>()
    .default([]),

  // Curatorial notes (provenance, condition, de-accession, etc.)
  notes: text("notes"),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("artwork_details_product_idx").on(table.productId),
  index("artwork_details_tenant_idx").on(table.tenantId),
  index("artwork_details_artist_idx").on(table.tenantId, table.artistSlug),
])

export const artworkDetailsRelations = relations(artworkDetails, ({ one }) => ({
  product: one(products, {
    fields: [artworkDetails.productId],
    references: [products.id],
  }),
  tenant: one(tenants, {
    fields: [artworkDetails.tenantId],
    references: [tenants.id],
  }),
}))

export type ArtworkDetail = typeof artworkDetails.$inferSelect
export type NewArtworkDetail = typeof artworkDetails.$inferInsert