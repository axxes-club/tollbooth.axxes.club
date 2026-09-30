"use client"

import { createContext, useContext } from "react"
import type { CustomerBrand } from "@/lib/white-label"

const BrandContext = createContext<CustomerBrand | null>(null)

/** The signed-in organization's white-label brand, or null for standard AXXES. */
export function useBrand() {
  return useContext(BrandContext)
}

/**
 * Wraps the app for a white-label customer: provides the brand to the logo and
 * turns the theme accent into their color. `display: contents` keeps it out of
 * the layout; the CSS variables still inherit.
 */
export function BrandScope({ brand, children }: { brand: CustomerBrand | null; children: React.ReactNode }) {
  const style = brand?.accent
    ? ({ display: "contents", "--accent": brand.accent, "--product-accent": brand.accent, "--accent-fg": "#ffffff", "--accent-ink": "#ffffff" } as React.CSSProperties)
    : ({ display: "contents" } as React.CSSProperties)
  return (
    <BrandContext.Provider value={brand}>
      <div style={style}>{children}</div>
    </BrandContext.Provider>
  )
}

/** The customer's mark: their square icon, else their logo, else their initial. */
export function CustomerMark({ brand, size = 28 }: { brand: CustomerBrand; size?: number }) {
  const src = brand.iconUrl ?? brand.logoUrl
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-md bg-white object-contain" style={{ width: size, height: size }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-md font-bold text-white"
      style={{ width: size, height: size, background: brand.accent ?? "#555", fontSize: size * 0.45 }}
      aria-hidden
    >
      {brand.name.slice(0, 1)}
    </span>
  )
}

/** Product name under the customer's mark, with "Powered by AXXES" beneath. */
export function CustomerLogo({ brand, productName, large = false }: { brand: CustomerBrand; productName: string; large?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <CustomerMark brand={brand} size={large ? 40 : 28} />
      <span className="min-w-0 leading-tight">
        <span className={large ? "block truncate text-xl font-semibold tracking-tight" : "block truncate text-[15px] font-semibold tracking-tight"}>
          {productName}
        </span>
        <span className="block truncate text-[10px] opacity-60" title={brand.name}>
          {brand.name} · Powered by AXXES
        </span>
      </span>
    </div>
  )
}
