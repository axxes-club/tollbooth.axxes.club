import { defineProduct } from "@/lib/product"

export const product = defineProduct({
  name: "Tollbooth",
  tagline: "Payments for every AXXES business, powered by Stripe.",
  accent: "#a78bfa",
  nav: [
    { href: "/dashboard/payments", label: "Payments" },
    { href: "/dashboard/developers", label: "Developers" },
    { href: "/dashboard/settings", label: "Payouts & settings" },
  ],
  resources: [],
})
