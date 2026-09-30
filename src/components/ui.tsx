import Link from "next/link"
import { CopyButton } from "@/components/copy-button"

export function PageHeader({
  title,
  description,
  action,
  meta,
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  meta?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        {meta}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

const TONES: Record<string, string> = {
  good: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
  warn: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
  bad: "bg-red-400/10 text-red-300 ring-red-400/20",
  info: "bg-sky-400/10 text-sky-300 ring-sky-400/20",
  test: "bg-violet-400/10 text-violet-300 ring-violet-400/20",
  muted: "bg-white/5 text-muted ring-white/10",
}
const GOOD = /^(active|published|sent|received|complete|completed|delivered|passed|approved|confirmed|captured|fulfilled|succeeded|paid|refunded)$/
const BAD = /^(failed|cancelled|rejected|quarantine|discrepancy_found|archived|out_of_stock|deleted|bounced|expired|disputed)$/
const INFO = /^(in_progress|in_transit|sending|shipped|processing|scheduled|partially_.*|partial|authorized|pending|retrying)$/

export function StatusBadge({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>
  const v = String(value)
  if (v === "test") return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${TONES.test}`}>test</span>
  const tone = GOOD.test(v) ? "good" : BAD.test(v) ? "bad" : INFO.test(v) ? "info" : v === "draft" ? "muted" : "warn"
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ${TONES[tone]}`}>{v.replaceAll("_", " ")}</span>
}

export function Stat({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  href?: string
  tone?: "warn" | "good"
}) {
  const body = (
    <div className={`card h-full p-5 transition ${href ? "hover:border-accent/40" : ""}`}>
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${tone === "warn" ? "text-amber-300" : ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <div className="mb-4 grid size-10 place-items-center rounded-full border border-dashed border-line text-muted">—</div>
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warn" | "good"
  title?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  const styles = {
    info: "border-sky-400/30 bg-sky-400/5",
    warn: "border-amber-400/30 bg-amber-400/5",
    good: "border-emerald-400/30 bg-emerald-400/5",
  }[tone]
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${styles}`}>
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className="mt-1 text-sm text-muted">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** A labelled pair, used throughout the detail panes. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm">{children}</dd>
    </div>
  )
}

export function Code({ children, copyable }: { children: string; copyable?: boolean }) {
  return (
    <div className="relative">
      <pre className="card overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-muted">{children}</pre>
      {copyable && <CopyButton value={children} />}
    </div>
  )
}

export { CopyButton }

/** A short, dense bar chart. No chart library — this is 30 numbers and an svg. */
export function Sparkline({ points, height = 56 }: { points: number[]; height?: number }) {
  if (points.length < 2) return <div className="text-xs text-muted">Not enough data yet</div>
  const max = Math.max(...points, 1)
  const width = 100
  const step = width / (points.length - 1)
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(height - (p / max) * (height - 4) - 2).toFixed(2)}`).join(" ")
  const area = `${path} L${width},${height} L0,${height} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Volume over time">
      <path d={area} fill="var(--accent)" opacity="0.1" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
