import Link from "next/link"

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

const TONES: Record<string, string> = {
  good: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
  warn: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
  bad: "bg-red-400/10 text-red-300 ring-red-400/20",
  info: "bg-sky-400/10 text-sky-300 ring-sky-400/20",
  muted: "bg-white/5 text-muted ring-white/10",
}
const GOOD = /^(active|published|sent|received|complete|completed|delivered|passed|approved|confirmed|captured|fulfilled|succeeded|paid|refunded)$/
const BAD = /^(failed|cancelled|rejected|quarantine|discrepancy_found|archived|out_of_stock|deleted|bounced)$/
const INFO = /^(in_progress|in_transit|sending|shipped|processing|scheduled|partially_.*|partial|authorized)$/

export function StatusBadge({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>
  const v = String(value)
  const tone = GOOD.test(v) ? "good" : BAD.test(v) ? "bad" : INFO.test(v) ? "info" : v === "draft" ? "muted" : "warn"
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ${TONES[tone]}`}>{v.replaceAll("_", " ")}</span>
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="card h-full p-5 transition hover:border-accent/40">
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <div className="mb-4 size-10 rounded-full border border-dashed border-line" />
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
