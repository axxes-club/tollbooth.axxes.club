import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { product } from "@/product.config"
import "./globals.css"

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.TOLLBOOTH_SITE_URL ?? "https://tollbooth.axxes.club"),
  title: { default: `${product.name} — payments for AXXES`, template: `%s · ${product.name}` },
  description: product.tagline,
  applicationName: product.name,
  openGraph: {
    title: `${product.name} — payments for AXXES`,
    description: product.tagline,
    type: "website",
    siteName: product.name,
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ "--product-accent": product.accent } as React.CSSProperties}>
      <body className={`${sans.variable} ${mono.variable} min-h-dvh antialiased`}>{children}</body>
    </html>
  )
}
