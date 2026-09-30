import { requireContext } from "@/lib/context"
import { getPayments } from "@/app/dashboard/queries"

/**
 * GET /api/dashboard/payments.csv
 *
 * Spreadsheet export of every payment for this workspace. Amounts are plain numbers
 * in minor units plus a currency column, so a pivot table in Sheets or Excel adds up
 * correctly without any cleverness.
 */
export async function GET() {
  const ctx = await requireContext()
  const payments = await getPayments(ctx.tenant.id, 10_000)

  const header = ["id", "created_at", "status", "mode", "amount", "amount_refunded", "currency", "fee", "net_fee", "description", "customer_email", "reference", "source"]
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value)
    // Prefix formula characters so a description can't execute in a spreadsheet.
    const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return `"${guarded.replaceAll('"', '""')}"`
  }

  const rows = payments.map((p) =>
    [
      p.id,
      p.createdAt.toISOString(),
      p.status,
      p.mode,
      p.amount,
      p.amountRefunded,
      p.currency,
      p.netFee,
      p.netFee,
      p.description ?? "",
      p.customerEmail ?? "",
      p.reference ?? "",
      p.source,
    ]
      .map(escape)
      .join(","),
  )

  return new Response([header.join(","), ...rows].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tollbooth-payments-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  })
}
