import { pgTable, text, uuid, timestamp, jsonb, boolean } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { tenants } from "./tenants"

// Comprehensive brand profile for generating tickets, websites, merchandise, etc.
export const brandProfiles = pgTable("brand_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // === BASIC INFO ===
  brandName: text("brand_name").notNull(),
  tagline: text("tagline"),
  description: text("description"),
  shortDescription: text("short_description"), // For limited space contexts

  // === VISUAL IDENTITY - COLORS ===
  primaryColor: text("primary_color").default("#000000"), // Main brand color
  secondaryColor: text("secondary_color"), // Supporting color
  accentColor: text("accent_color"), // Highlight/CTA color
  backgroundColor: text("background_color").default("#FFFFFF"),
  backgroundColorDark: text("background_color_dark").default("#0A0A0A"),
  textColor: text("text_color").default("#000000"),
  textColorDark: text("text_color_dark").default("#FFFFFF"),

  // Extended color palette (for merchandise, gradients, etc.)
  colorPalette: jsonb("color_palette").$type<{
    colors: Array<{ name: string; hex: string; usage?: string }>
  }>(),

  // === VISUAL IDENTITY - LOGOS ===
  logoUrl: text("logo_url"), // Primary logo
  logoLightUrl: text("logo_light_url"), // For dark backgrounds
  logoDarkUrl: text("logo_dark_url"), // For light backgrounds
  logoIconUrl: text("logo_icon_url"), // Square icon/mark only
  logoHorizontalUrl: text("logo_horizontal_url"), // Horizontal lockup
  logoVerticalUrl: text("logo_vertical_url"), // Vertical/stacked lockup
  faviconUrl: text("favicon_url"),

  // === VISUAL IDENTITY - TYPOGRAPHY ===
  headingFont: text("heading_font").default("Inter"), // Display/heading font
  bodyFont: text("body_font").default("Inter"), // Body text font
  accentFont: text("accent_font"), // Special use (quotes, callouts)
  fontUrls: jsonb("font_urls").$type<{
    fonts: Array<{ name: string; url: string; weights?: string[] }>
  }>(),

  // === DESIGN RULES ===
  designRules: jsonb("design_rules").$type<{
    logoMinSize?: string // e.g., "40px"
    logoClearSpace?: string // e.g., "2x logo height"
    cornerRadius?: string // e.g., "8px", "rounded", "sharp"
    buttonStyle?: "filled" | "outline" | "ghost"
    imageStyle?: "sharp" | "rounded" | "circular"
    shadowStyle?: "none" | "subtle" | "medium" | "dramatic"
    gradientDirection?: string
    doList?: string[] // Things to do
    dontList?: string[] // Things to avoid
    notes?: string
  }>(),

  // === SOCIAL & CONTACT ===
  website: text("website"),
  email: text("email"),
  phone: text("phone"),
  socialLinks: jsonb("social_links").$type<{
    instagram?: string
    tiktok?: string
    twitter?: string
    facebook?: string
    youtube?: string
    linkedin?: string
    spotify?: string
    soundcloud?: string
    [key: string]: string | undefined
  }>(),

  // === LEGAL & COMPLIANCE ===
  copyrightText: text("copyright_text"),
  legalName: text("legal_name"), // Registered business name
  taxId: text("tax_id"),

  // === TICKET-SPECIFIC ===
  ticketDefaults: jsonb("ticket_defaults").$type<{
    showLogo?: boolean
    showQrCode?: boolean
    showBarcode?: boolean
    ticketSize?: "standard" | "compact" | "large"
    orientation?: "portrait" | "landscape"
    backgroundImage?: string
    footerText?: string
    termsUrl?: string
  }>(),

  // === MERCHANDISE-SPECIFIC ===
  merchandiseDefaults: jsonb("merchandise_defaults").$type<{
    labelStyle?: string
    taglinePosition?: "top" | "bottom" | "none"
    preferredPrintMethod?: string
    packagingNotes?: string
  }>(),

  // === WEBSITE-SPECIFIC ===
  websiteDefaults: jsonb("website_defaults").$type<{
    headerStyle?: "fixed" | "static" | "hidden"
    footerStyle?: "minimal" | "full" | "none"
    heroStyle?: "image" | "video" | "gradient" | "minimal"
    ctaText?: string
    navigationStyle?: "horizontal" | "hamburger" | "sidebar"
  }>(),

  // === MEDIA ASSETS ===
  bannerUrl: text("banner_url"), // Wide banner image
  coverImageUrl: text("cover_image_url"), // Social cover/og image
  backgroundPatternUrl: text("background_pattern_url"),

  // Additional assets (photos, graphics, etc.)
  mediaAssets: jsonb("media_assets").$type<{
    assets: Array<{
      id: string
      name: string
      url: string
      type: "image" | "video" | "document"
      category?: string
      description?: string
    }>
  }>(),

  // === VOICE & TONE ===
  voiceTone: jsonb("voice_tone").$type<{
    personality?: string[] // e.g., ["bold", "energetic", "inclusive"]
    writingStyle?: string // e.g., "casual", "professional", "playful"
    keywords?: string[] // Brand keywords to use
    avoidWords?: string[] // Words to avoid
    samplePhrases?: string[] // Example on-brand phrases
  }>(),

  // === META ===
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const brandProfilesRelations = relations(brandProfiles, ({ one }) => ({
  tenant: one(tenants, {
    fields: [brandProfiles.tenantId],
    references: [tenants.id],
  }),
}))

export type BrandProfile = typeof brandProfiles.$inferSelect
export type NewBrandProfile = typeof brandProfiles.$inferInsert
