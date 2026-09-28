import { product } from "@/product.config"

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid place-items-center rounded-lg bg-accent font-mono font-bold text-accent-ink ${size === "lg" ? "size-10 text-lg" : "size-7 text-sm"}`}
      >
        {product.name[0]}
      </span>
      <span className="leading-tight">
        <span className={`block font-semibold tracking-tight ${size === "lg" ? "text-xl" : "text-[15px]"}`}>{product.name}</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-muted">by AXXES</span>
      </span>
    </div>
  )
}
