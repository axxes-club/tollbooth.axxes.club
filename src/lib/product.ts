import type { Resource } from "@/lib/resource"

export type Product = {
  /** Codename shown in the UI. */
  name: string
  tagline: string
  /** Brand accent (CSS color). */
  accent: string
  /** Extra top-level pages, listed above resources. */
  nav?: { href: string; label: string }[]
  resources: Resource[]
}

export function defineProduct(p: Product) {
  return p
}
