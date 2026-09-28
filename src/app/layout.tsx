import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { product } from "@/product.config"
import "./globals.css"

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: `${product.name} · AXXES`, template: `%s · ${product.name}` },
  description: product.tagline,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ "--product-accent": product.accent } as React.CSSProperties}>
      <body className={`${sans.variable} ${mono.variable} min-h-dvh`}>{children}</body>
    </html>
  )
}
