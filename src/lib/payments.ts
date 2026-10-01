import "server-only"
import type Stripe from "stripe"
import {randomUUID} from "node:crypto"
import type {IdempotencyGuard} from "./idempotency"
import {IdempotencyError} from "./idempotency"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { applicationFee } from "@/lib/fees"
import { stripe } from "@/lib/stripe"
import { emitPayment } from "@/lib/webhooks"
import type { TbAccount, TbMode, TbPayment } from "@/lib/db/schema/tollbooth"

/**
 * How long a checkout stays payable.
 *
 * Stripe's documented maximum for `expires_at` is 24 hours, and a value sitting
 * exactly on that boundary is fragile across API changes. A few minutes of margin
 * keeps the session alive for effectively the same period without ever tripping the
 * limit, which would fail the whole charge.
 */
export const CHECKOUT_TTL_SECONDS = 60 * 60 * 24 - 300

/**
 * Loopback hosts, where plain http is fine because nothing leaves the machine.
 * Everything else must be https.
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"])

/**
 * Validates a caller-supplied URL.
 *
 * The rule is deliberately based on the host rather than `NODE_ENV`: a check that
 * only fires when `NODE_ENV` is exactly "production" silently allows plaintext
 * everywhere else — preview deploys, a misconfigured box, a test run. For a webhook
 * endpoint that means posting payment details over http, and it lets a caller aim the
 * gateway at a service on the internal network.
 */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol === "https:") return url.toString()
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname.toLowerCase())) return url.toString()
  return null
}

export class NotReadyError extends Error {
  constructor(readonly account: TbAccount | null) {
    super(
      account
        ? "This workspace can't take payments yet. Stripe reports: " + (account.chargesDisabledReason ?? "payout setup is incomplete")
        : "This workspace hasn't set up payouts yet"
    )
    this.name = "NotReadyError"
  }
}

export async function requireReadyAccount(tenantId: string): Promise<TbAccount> {
  const [account] = await db.select().from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId, tenantId))
  if (!account?.chargesEnabled) throw new NotReadyError(account ?? null)
  return account
}

type CreateCheckout = {
  operation?:IdempotencyGuard|null
  tenantId: string
  mode: TbMode
  apiKeyId?: string | null
  amount: number
  currency: string
  description: string
  customerEmail?: string | null
  customerId?: string | null
  reference?: string | null
  metadata?: Record<string, string>
  priceId?: string | null
  linkId?: string | null
  successUrl: string
  cancelUrl: string
  quantity?: number
  source?: "api" | "link"
  idempotencyKey?: string | null
}

/**
 * Creates the payment row and its Stripe Checkout session together.
 *
 * The local row is written first and carries `client_reference_id`, so the Stripe
 * webhook can always find the payment even if the response to the caller is lost.
 * If Stripe rejects, the row is marked failed rather than deleted, which keeps the
 * merchant's view honest about attempts that were made.
 */
export async function createCheckout(input:CreateCheckout):Promise<TbPayment>{
 const operation=input.operation;
 if(operation?.checkpoint&&(operation.checkpoint.kind!=='checkout'||operation.checkpoint.mode!==input.mode))throw new IdempotencyError('Checkout operation mode or identity mismatch');
 const existing=operation?.checkpoint?.paymentId?(await db.select().from(schema.tollboothPayments).where(and(eq(schema.tollboothPayments.id,String(operation.checkpoint.paymentId)),eq(schema.tollboothPayments.tenantId,input.tenantId))))[0]:undefined;
 if(existing&&(existing.checkoutSessionId||existing.status!=='pending'))return existing;
 if(operation?.checkpoint?.preparedAt&&Date.now()-new Date(String(operation.checkpoint.preparedAt)).getTime()>23*3600000)throw new IdempotencyError('Unresolved checkout requires provider reconciliation before retry');
 const successUrl=input.successUrl.trim(),cancelUrl=input.cancelUrl.trim();if((successUrl&&!safeUrl(successUrl))||(cancelUrl&&!safeUrl(cancelUrl)))throw Error('Checkout return URLs must use HTTPS');
 const account=await requireReadyAccount(input.tenantId),client=stripe(input.mode);
 const plannedId=operation?.checkpoint?.paymentId?String(operation.checkpoint.paymentId):randomUUID();
 const expiresAt=operation?.checkpoint?.expiresAt?new Date(String(operation.checkpoint.expiresAt)):new Date(Date.now()+CHECKOUT_TTL_SECONDS*1000);
 const amount=input.amount*(input.quantity??1),fee=operation?.checkpoint?.paymentValues?Number((operation.checkpoint.paymentValues as {applicationFee:number}).applicationFee):applicationFee(amount);
 const site=new URL(process.env.TOLLBOOTH_SITE_URL||'https://tollbooth.axxes.club');
 const originalValues={id:plannedId,tenantId:input.tenantId,apiKeyId:input.apiKeyId??null,amount,currency:input.currency,applicationFee:fee,netFee:fee,description:input.description,customerEmail:input.customerEmail??null,customerId:input.customerId??null,priceId:input.priceId??null,linkId:input.linkId??null,reference:input.reference??null,metadata:input.metadata??{},source:input.source??'api',mode:input.mode,successUrl,expiresAt,status:'pending'};
 const savedValues=operation?.checkpoint?.paymentValues as typeof originalValues|undefined;
 const values=savedValues?{...savedValues,expiresAt:new Date(String(savedValues.expiresAt))}:originalValues;
 const originalParams:Stripe.Checkout.SessionCreateParams={mode:'payment',line_items:[{quantity:input.quantity??1,price_data:{currency:input.currency,unit_amount:input.amount,product_data:{name:input.description,...(input.metadata?.image_url?{images:[input.metadata.image_url]}:{})}}}],customer_email:input.customerEmail??undefined,success_url:successUrl?appendQuery(successUrl,{tollbooth_payment_id:plannedId}):new URL(`/pay/complete/${plannedId}`,site).toString(),cancel_url:cancelUrl||new URL(`/pay/cancelled/${plannedId}`,site).toString(),client_reference_id:plannedId,expires_at:Math.floor(expiresAt.getTime()/1000),metadata:{tollbooth_payment_id:plannedId,tenant_id:input.tenantId},payment_intent_data:{application_fee_amount:fee||undefined,transfer_data:{destination:account.stripeAccountId},metadata:{...input.metadata,tollbooth_payment_id:plannedId}}};
 const params=JSON.parse(JSON.stringify(operation?.checkpoint?.stripeParams??originalParams))as Stripe.Checkout.SessionCreateParams;
 const providerKey=String(operation?.checkpoint?.providerKey??`tollbooth-checkout:${plannedId}`);
 if(values.tenantId!==input.tenantId||values.mode!==input.mode||params.metadata?.tenant_id!==input.tenantId||params.client_reference_id!==plannedId)throw new IdempotencyError('Persisted checkout identity mismatch');
 if(operation&&!operation.checkpoint)await operation.saveCheckpoint({kind:'checkout',mode:input.mode,paymentId:plannedId,expiresAt:expiresAt.toISOString(),paymentValues:values,stripeParams:params,providerKey});
 await operation?.assertOwnership();
 const payment=existing??(await db.insert(schema.tollboothPayments).values(values).returning())[0];
 try{
  await operation?.assertOwnership();
  const session=await client.checkout.sessions.create(params,{idempotencyKey:providerKey});
  await operation?.assertOwnership();
  const [updated]=await db.update(schema.tollboothPayments).set({checkoutSessionId:session.id,checkoutUrl:session.url,expiresAt:session.expires_at?new Date(session.expires_at*1000):expiresAt,updatedAt:new Date()}).where(eq(schema.tollboothPayments.id,payment.id)).returning();const settled=updated??payment;await emitPayment(settled,'payment.created').catch(()=>{});return settled;
 }catch(error){
  await operation?.assertOwnership();
  const definitive=typeof error==='object'&&error!==null&&'type'in error&&['StripeCardError','StripeInvalidRequestError','card_error','invalid_request_error'].includes(String(error.type));
  await db.update(schema.tollboothPayments).set({status:definitive?'failed':'pending',lastError:error instanceof Error?error.message.slice(0,500):'Provider outcome unknown',updatedAt:new Date()}).where(and(eq(schema.tollboothPayments.id,payment.id),eq(schema.tollboothPayments.status,'pending')));throw error;
 }
}

function appendQuery(url: string, params: Record<string, string>) {
  const next = new URL(url)
  for (const [k, v] of Object.entries(params)) next.searchParams.set(k, v)
  return next.toString()
}

/** The workspace's real balance, straight from Stripe. Never estimated from our rows. */
export async function fetchBalance(stripeAccountId: string, mode: TbMode) {
  const client = stripe(mode)
  const [balance, payouts] = await Promise.all([
    client.balance.retrieve({}, { stripeAccount: stripeAccountId }),
    client.payouts.list({ limit: 1 }, { stripeAccount: stripeAccountId }),
  ])

  // A connected account can hold several currencies; report the one it settles in.
  const primary = balance.available[0]
  const currency = (primary?.currency ?? "usd").toLowerCase()
  const sum = (list: { amount: number; currency: string }[]) =>
    list.filter((entry) => entry.currency.toLowerCase() === currency).reduce((total, entry) => total + entry.amount, 0)

  const next = payouts.data[0]
  return {
    available: primary?.amount ?? 0,
    pending: sum(balance.pending),
    currency,
    payoutsEnabled: !!(await client.accounts.retrieve(stripeAccountId)).payouts_enabled,
    nextPayoutAt: next?.arrival_date ? new Date(next.arrival_date * 1000) : null,
    nextPayoutAmount: next ? Math.abs(next.amount) : null,
  }
}

/**
 * Marks a payment paid and rolls its effects up to the customer and the link that
 * sold it. Idempotent: a repeated webhook for the same session is a no-op.
 */
export async function markSucceeded(paymentId: string, patch: { paymentIntentId?: string; customerEmail?: string | null }) {
  const [payment] = await db.select().from(schema.tollboothPayments).where(eq(schema.tollboothPayments.id, paymentId))
  if (!payment || !["pending", "failed", "expired"].includes(payment.status)) return payment ?? null

  const now = new Date()
  const [updated] = await db
    .update(schema.tollboothPayments)
    .set({
      status: "succeeded",
      paymentIntentId: patch.paymentIntentId ?? payment.paymentIntentId,
      customerEmail: patch.customerEmail ?? payment.customerEmail,
      lastError: null,
      updatedAt: now,
    })
    .where(and(eq(schema.tollboothPayments.id, paymentId), inArray(schema.tollboothPayments.status, ["pending", "failed", "expired"])))
    .returning()

  if (!updated) {
    const [current] = await db.select().from(schema.tollboothPayments).where(eq(schema.tollboothPayments.id, paymentId))
    return current ?? payment
  }
  const settled = updated

  // Roll up to the customer. The WHERE guard keeps concurrent webhooks from
  // double-counting the same payment into total_spent.
  if (settled.customerId) {
    await db
      .update(schema.tollboothCustomers)
      .set({
        totalSpent: sql`${schema.tollboothCustomers.totalSpent} + ${settled.amount}`,
        paymentCount: sql`${schema.tollboothCustomers.paymentCount} + 1`,
        lastPaidAt: now,
        firstPaidAt: sql`coalesce(${schema.tollboothCustomers.firstPaidAt}, ${now})`,
        updatedAt: now,
      })
      .where(eq(schema.tollboothCustomers.id, settled.customerId))
  }
  if (settled.linkId) {
    await db
      .update(schema.tollboothLinks)
      .set({ paymentCount: sql`${schema.tollboothLinks.paymentCount} + 1`, updatedAt: now })
      .where(eq(schema.tollboothLinks.id, settled.linkId))
  }

  await emitPayment(settled, "payment.succeeded", { status: payment.status }).catch((e) =>
    console.error("[tollbooth] payment.succeeded emit failed", e)
  )
  return settled
}

/** Terminal states other than success. Returns null when the payment is already final. */
export async function markTerminal(paymentId: string, status: "failed" | "expired", reason?: string) {
  const [payment] = await db.select().from(schema.tollboothPayments).where(eq(schema.tollboothPayments.id, paymentId))
  if (!payment || payment.status !== "pending") return null

  const [updated] = await db
    .update(schema.tollboothPayments)
    .set({ status, lastError: reason?.slice(0, 500) ?? null, updatedAt: new Date() })
    .where(and(eq(schema.tollboothPayments.id, paymentId), eq(schema.tollboothPayments.status, "pending")))
    .returning()

  if (!updated) return null
  const type = status === "expired" ? "payment.expired" : "payment.failed"
  await emitPayment(updated, type, { status: payment.status }).catch((e) => console.error(`[tollbooth] ${type} emit failed`, e))
  return updated
}
