import { pgTable, text, uuid, timestamp, jsonb, boolean, integer, uniqueIndex, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"

// Block content types for type safety
export type HeroBlockContent = {
  title?: string
  subtitle?: string
  backgroundImage?: string
  backgroundVideo?: string
  ctaText?: string
  ctaLink?: string
  overlay?: boolean
  overlayOpacity?: number
  alignment?: "left" | "center" | "right"
}

export type TextBlockContent = {
  html: string
  alignment?: "left" | "center" | "right"
}

export type HeadingBlockContent = {
  text: string
  level: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  alignment?: "left" | "center" | "right"
}

export type ImageBlockContent = {
  url: string
  alt?: string
  caption?: string
  link?: string
  size?: "small" | "medium" | "large" | "full"
}

export type GalleryBlockContent = {
  images: Array<{ url: string; alt?: string; caption?: string }>
  layout?: "grid" | "masonry" | "slider"
  columns?: number
}

export type VideoBlockContent = {
  url: string
  autoplay?: boolean
  muted?: boolean
  loop?: boolean
}

export type SpacerBlockContent = {
  height: number // in pixels
}

export type DividerBlockContent = {
  style?: "solid" | "dashed" | "dotted"
  width?: "full" | "half" | "third"
}

export type CTABlockContent = {
  text: string
  link: string
  style?: "primary" | "secondary" | "outline" | "ghost"
  size?: "sm" | "md" | "lg"
  alignment?: "left" | "center" | "right"
}

export type ArtistBioBlockContent = {
  name?: string
  genres?: string[]
  bio?: string
  image?: string
}

export type MusicLinksBlockContent = {
  platforms: Array<{
    name: string
    url: string
    icon?: string
  }>
  style?: "icons" | "buttons" | "list"
}

export type SocialLinksBlockContent = {
  platforms: Array<{
    name: string
    url: string
  }>
  style?: "icons" | "buttons"
}

export type TourDatesBlockContent = {
  eventIds?: string[]
  showPast?: boolean
  limit?: number
}

export type MusicPlayerBlockContent = {
  platform: "spotify" | "soundcloud" | "apple" | "youtube"
  embedId: string
  type?: "track" | "album" | "playlist"
}

export type EventsListBlockContent = {
  filter?: "upcoming" | "past" | "all"
  limit?: number
  showPast?: boolean
  layout?: "list" | "grid" | "cards"
}

export type EventCardBlockContent = {
  eventId: string
  style?: "full" | "compact" | "minimal"
}

export type CountdownBlockContent = {
  eventId?: string
  targetDate?: string
  title?: string
}

export type ProductsGridBlockContent = {
  categoryId?: string
  limit?: number
  columns?: number
}

export type ProductCardBlockContent = {
  productId: string
  style?: "full" | "compact" | "minimal"
}

export type FeaturedProductsBlockContent = {
  productIds: string[]
  layout?: "grid" | "slider" | "list"
}

export type ContactFormBlockContent = {
  fields: Array<{
    name: string
    type: "text" | "email" | "textarea" | "select"
    required?: boolean
    placeholder?: string
    options?: string[]
  }>
  submitText?: string
  recipientEmail?: string
}

export type NewsletterBlockContent = {
  title?: string
  description?: string
  provider?: "mailchimp" | "convertkit" | "custom"
  listId?: string
}

export type MapBlockContent = {
  address: string
  zoom?: number
  style?: "standard" | "dark" | "light"
}

export type FAQBlockContent = {
  items: Array<{
    question: string
    answer: string
  }>
}

export type TestimonialsBlockContent = {
  items: Array<{
    quote: string
    author: string
    role?: string
    image?: string
  }>
  layout?: "grid" | "slider" | "list"
}

export type HTMLBlockContent = {
  code: string
}

// Union type for all block content types
export type BlockContent =
  | HeroBlockContent
  | TextBlockContent
  | HeadingBlockContent
  | ImageBlockContent
  | GalleryBlockContent
  | VideoBlockContent
  | SpacerBlockContent
  | DividerBlockContent
  | CTABlockContent
  | ArtistBioBlockContent
  | MusicLinksBlockContent
  | SocialLinksBlockContent
  | TourDatesBlockContent
  | MusicPlayerBlockContent
  | EventsListBlockContent
  | EventCardBlockContent
  | CountdownBlockContent
  | ProductsGridBlockContent
  | ProductCardBlockContent
  | FeaturedProductsBlockContent
  | ContactFormBlockContent
  | NewsletterBlockContent
  | MapBlockContent
  | FAQBlockContent
  | TestimonialsBlockContent
  | HTMLBlockContent

// ============================================
// ENHANCED BLOCK SETTINGS WITH OVERRIDES SYSTEM
// ============================================

// Spacing value type (can be number or CSS value string)
export type SpacingValue = number | string

// Typography overrides - granular text control
export type TypographyOverrides = {
  fontFamily?: string
  fontSize?: string
  fontWeight?: string | number
  lineHeight?: string | number
  letterSpacing?: string
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"
  textDecoration?: "none" | "underline" | "line-through"
  fontStyle?: "normal" | "italic"
}

// Color overrides - granular color control
export type ColorOverrides = {
  text?: string
  background?: string
  border?: string
  accent?: string
  link?: string
  linkHover?: string
  heading?: string
  muted?: string
}

// Spacing overrides - padding and margin control
export type SpacingOverrides = {
  padding?: {
    top?: SpacingValue
    right?: SpacingValue
    bottom?: SpacingValue
    left?: SpacingValue
  }
  margin?: {
    top?: SpacingValue
    right?: SpacingValue
    bottom?: SpacingValue
    left?: SpacingValue
  }
  gap?: SpacingValue
}

// Border overrides
export type BorderOverrides = {
  width?: string
  style?: "none" | "solid" | "dashed" | "dotted" | "double"
  color?: string
  radius?: string
  // Individual sides
  top?: { width?: string; style?: string; color?: string }
  right?: { width?: string; style?: string; color?: string }
  bottom?: { width?: string; style?: string; color?: string }
  left?: { width?: string; style?: string; color?: string }
}

// Shadow overrides
export type ShadowOverrides = {
  preset?: "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "inner"
  custom?: string // Custom box-shadow value
}

// Background overrides
export type BackgroundOverrides = {
  color?: string
  gradient?: string
  image?: string
  imagePosition?: string
  imageSize?: "cover" | "contain" | "auto" | string
  imageRepeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y"
  imageAttachment?: "scroll" | "fixed" | "local"
  overlay?: {
    color?: string
    opacity?: number
  }
  blur?: string
}

// Animation overrides
export type AnimationOverrides = {
  entrance?: "none" | "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "scale" | "bounce"
  duration?: string
  delay?: string
  easing?: string
}

// Layout overrides
export type LayoutOverrides = {
  display?: "block" | "flex" | "grid" | "inline" | "inline-block" | "none"
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse"
  justifyContent?: "start" | "center" | "end" | "between" | "around" | "evenly"
  alignItems?: "start" | "center" | "end" | "stretch" | "baseline"
  gridColumns?: number | string
  gridGap?: string
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky"
  zIndex?: number
  overflow?: "visible" | "hidden" | "scroll" | "auto"
}

// Size overrides
export type SizeOverrides = {
  width?: string
  minWidth?: string
  maxWidth?: string
  height?: string
  minHeight?: string
  maxHeight?: string
  aspectRatio?: string
}

// Responsive breakpoint overrides
export type ResponsiveOverrides = {
  sm?: Partial<BlockStyleOverrides>  // 640px+
  md?: Partial<BlockStyleOverrides>  // 768px+
  lg?: Partial<BlockStyleOverrides>  // 1024px+
  xl?: Partial<BlockStyleOverrides>  // 1280px+
}

// Complete style overrides object
export type BlockStyleOverrides = {
  typography?: TypographyOverrides
  colors?: ColorOverrides
  spacing?: SpacingOverrides
  border?: BorderOverrides
  shadow?: ShadowOverrides
  background?: BackgroundOverrides
  animation?: AnimationOverrides
  layout?: LayoutOverrides
  size?: SizeOverrides
}

// Brand integration settings
export type BrandIntegration = {
  useBrandColors?: boolean
  useBrandFonts?: boolean
  useBrandRadius?: boolean
  useBrandShadows?: boolean
  // Specific brand color mappings
  colorMappings?: {
    text?: "primary" | "secondary" | "accent" | "background" | "custom"
    background?: "primary" | "secondary" | "accent" | "background" | "custom"
    accent?: "primary" | "secondary" | "accent" | "custom"
  }
}

// Block settings type - ENHANCED
export type BlockSettings = {
  // === BRAND INTEGRATION ===
  brand?: BrandIntegration

  // === LEGACY COMPATIBILITY (still supported) ===
  padding?: { top?: number; bottom?: number; left?: number; right?: number }
  margin?: { top?: number; bottom?: number }
  backgroundColor?: string
  backgroundImage?: string
  textColor?: string
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full"
  customClasses?: string

  // === ENHANCED OVERRIDES SYSTEM ===
  overrides?: BlockStyleOverrides

  // === RESPONSIVE OVERRIDES ===
  responsive?: ResponsiveOverrides

  // === CUSTOM CSS ===
  customCSS?: string  // Raw CSS that applies to this block

  // === VISIBILITY & DISPLAY ===
  hideOnMobile?: boolean
  hideOnDesktop?: boolean

  // === ACCESSIBILITY ===
  ariaLabel?: string
  ariaDescribedBy?: string
  role?: string

  // === INTERACTION ===
  cursor?: string
  pointerEvents?: "auto" | "none"
  userSelect?: "auto" | "none" | "text" | "all"

  // === ADVANCED ===
  containerQuery?: boolean  // Enable container queries
  printStyles?: Partial<BlockStyleOverrides>  // Print-specific styles
}

// Block type enum values
export const BLOCK_TYPES = [
  // Core blocks
  "hero",
  "text",
  "heading",
  "image",
  "gallery",
  "video",
  "spacer",
  "divider",
  "cta",
  // Artist/Talent blocks
  "artist-bio",
  "music-links",
  "social-links",
  "tour-dates",
  "music-player",
  // Event blocks
  "events-list",
  "event-card",
  "countdown",
  // Inventory/Merch blocks
  "products-grid",
  "product-card",
  "featured-products",
  // Utility blocks
  "contact-form",
  "newsletter",
  "map",
  "faq",
  "testimonials",
  "html",
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

// Pages table
export const pages = pgTable("pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Page info
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),

  // SEO
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  ogImage: text("og_image"),

  // Status
  isPublished: boolean("is_published").default(false).notNull(),
  isHomepage: boolean("is_homepage").default(false).notNull(),

  // Settings
  showNavigation: boolean("show_navigation").default(true).notNull(),
  showFooter: boolean("show_footer").default(true).notNull(),

  // Order for navigation
  sortOrder: integer("sort_order").default(0).notNull(),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("pages_tenant_slug_idx").on(table.tenantId, table.slug),
  index("pages_tenant_idx").on(table.tenantId),
  index("pages_published_idx").on(table.tenantId, table.isPublished),
  index("pages_homepage_idx").on(table.tenantId, table.isHomepage),
])

// Page Blocks table
export const pageBlocks = pgTable("page_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Block type
  type: text("type").notNull(), // 'hero', 'text', 'image', etc.

  // Block content (JSONB for flexibility)
  content: jsonb("content").$type<BlockContent>().notNull().default({}),

  // Block settings (JSONB)
  settings: jsonb("settings").$type<BlockSettings>().default({}),

  // Positioning
  sortOrder: integer("sort_order").notNull().default(0),

  // Visibility
  isVisible: boolean("is_visible").default(true).notNull(),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("page_blocks_page_idx").on(table.pageId),
  index("page_blocks_sort_idx").on(table.pageId, table.sortOrder),
  index("page_blocks_tenant_idx").on(table.tenantId),
])

// Relations
export const pagesRelations = relations(pages, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [pages.tenantId],
    references: [tenants.id],
  }),
  blocks: many(pageBlocks),
}))

export const pageBlocksRelations = relations(pageBlocks, ({ one }) => ({
  page: one(pages, {
    fields: [pageBlocks.pageId],
    references: [pages.id],
  }),
  tenant: one(tenants, {
    fields: [pageBlocks.tenantId],
    references: [tenants.id],
  }),
}))

// Types
export type Page = typeof pages.$inferSelect
export type NewPage = typeof pages.$inferInsert
export type PageBlock = typeof pageBlocks.$inferSelect
export type NewPageBlock = typeof pageBlocks.$inferInsert
