import { defineProduct } from "@/lib/product"

export const product = defineProduct({
  name: "Tollbooth",
  tagline: "Payment infrastructure for AXXES businesses.",
  accent: "#00e5a0",
  nav: [
    { href: "/dashboard", label: "Overview", group: "Money" },
    { href: "/dashboard/payments", label: "Payments", group: "Money" },
    { href: "/dashboard/refunds", label: "Refunds", group: "Money" },
    { href: "/dashboard/customers", label: "Customers", group: "Money" },
    { href: "/dashboard/products", label: "Products & prices", group: "Sell" },
    { href: "/dashboard/links", label: "Payment links", group: "Sell" },
    { href: "/dashboard/webhooks", label: "Webhooks", group: "Build" },
    { href: "/dashboard/developers", label: "API keys", group: "Build" },
    { href: "/dashboard/settings", label: "Payouts & settings", group: "Build" },
  ],
  resources: [],
})
