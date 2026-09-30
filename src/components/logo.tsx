import { product } from "@/product.config"

/**
 * A toll gate: a post with a raised barrier. It's the one idea the product is named
 * after, and it reads at 16px, which a letter in a rounded square never does.
 */
function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden className="shrink-0">
      <rect width="28" height="28" rx="7" fill="var(--accent)" />
      <path d="M9 20V8.5" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 9.5L19.5 14L9 18.5V9.5Z" fill="var(--accent-ink)" />
    </svg>
  )
}

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const large = size === "lg"
  return (
    <span className="flex items-center gap-2.5">
      <Mark size={large ? 34 : 28} />
      <span className="leading-tight">
        <span className={`block font-semibold tracking-tight ${large ? "text-xl" : "text-[15px]"}`}>{product.name}</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-muted">by AXXES</span>
      </span>
    </span>
  )
}

/** Just the badge, for the collapsed rail where the wordmark has no room. */
export function LogoMark() {
  return (
    <span className="mx-auto grid size-7 place-items-center rounded-lg bg-accent font-mono text-sm font-bold text-accent-ink">
      {product.name[0]}
    </span>
  )
}
