import "server-only"
import {randomUUID} from "node:crypto"
import type {IdempotencyGuard} from "./idempotency"
import type Stripe from "stripe"
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm"
import { db, schema } from "@/lib/db"
import { refundFeeDelta } from "@/lib/fees"
import { stripe } from "@/lib/stripe"
import { emitPayment, emitRefund } from "@/lib/webhooks"
import type { TbRefund } from "@/lib/db/schema/tollbooth"

export class RefundError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    message: string
  ) {
    super(message)
    this.name = "RefundError"
  }
}

type Args = {
  mode?:"test"|"live"
  operation?:IdempotencyGuard|null
  tenantId: string
  paymentId: string
  amount?: number
  reason?: string | null
  note?: string | null
  apiKeyId?: string | null
  createdByKind: "api" | "dashboard"
  idempotencyKey?: string | null
}

/**
 * Refunds a payment, in full or in part.
 *
 * Two things happen that are easy to get wrong by hand: the transfer back to the
 * connected account is reversed (`reverse_transfer`), and the application fee
 * covering the refunded amount is returned (`refund_application_fee`). Skip either
 * and the merchant pays for a refund out of their own pocket.
 */
export async function createRefund(args: Args): Promise<TbRefund> {
  const operation=args.operation;
  const [payment]=await db.select().from(schema.tollboothPayments).where(and(eq(schema.tollboothPayments.id,args.paymentId),eq(schema.tollboothPayments.tenantId,args.tenantId)));
  if(!payment||(args.mode&&payment.mode!==args.mode))throw new RefundError(404,'resource_missing','No such payment');
  if(operation?.checkpoint && (operation.checkpoint.kind!=='refund'||operation.checkpoint.mode!==payment.mode||operation.checkpoint.paymentId!==payment.id))throw new RefundError(409,'refund_conflict','Refund operation identity mismatch');
  const refundId=operation?.checkpoint?.refundId?String(operation.checkpoint.refundId):randomUUID();
  const [existing]=await db.select().from(schema.tollboothRefunds).where(and(eq(schema.tollboothRefunds.id,refundId),eq(schema.tollboothRefunds.tenantId,args.tenantId)));
  if(existing?.stripeRefundId)return (await reconcileProviderRefund(await stripe(payment.mode as 'test'|'live').refunds.retrieve(existing.stripeRefundId)))??existing;
  if(existing&&['failed','canceled'].includes(existing.status))return existing;
  const amount=operation?.checkpoint?Number(operation.checkpoint.amount):args.amount===undefined?payment.amount-payment.amountRefunded:Number(args.amount);
  const base=operation?.checkpoint?Number(operation.checkpoint.baseRefunded):payment.amountRefunded;
  const feeReturned=operation?.checkpoint?Number(operation.checkpoint.feeReturned):refundFeeDelta(payment.applicationFee,payment.applicationFee-payment.netFee,amount,payment.amount,base+amount);
  if(!Number.isInteger(amount)||amount<1||base+amount>payment.amount)throw new RefundError(400,'invalid_request_error',`Only ${payment.amount-base} of this payment is left to refund`);
  if(!payment.paymentIntentId||(!operation?.checkpoint&&!['succeeded','partially_refunded'].includes(payment.status)))throw new RefundError(400,'payment_not_refundable',`A payment with status "${payment.status}" cannot be refunded`);
  if(operation&&!operation.checkpoint)await operation.saveCheckpoint({kind:'refund',mode:payment.mode,paymentId:payment.id,refundId,amount,baseRefunded:base,feeReturned});
  await operation?.assertOwnership();
  // Own an unresolved operation without pretending that Stripe has returned money.
  if(payment.pendingRefundId!==refundId){const [claimed]=await db.update(schema.tollboothPayments).set({pendingRefundId:refundId,updatedAt:new Date()}).where(and(eq(schema.tollboothPayments.id,payment.id),eq(schema.tollboothPayments.tenantId,args.tenantId),isNull(schema.tollboothPayments.pendingRefundId),eq(schema.tollboothPayments.amountRefunded,base),inArray(schema.tollboothPayments.status,['succeeded','partially_refunded']))).returning();if(!claimed)throw new RefundError(409,'refund_conflict','Another refund is pending reconciliation');}
  await operation?.assertOwnership();
  const refund=existing??(await db.insert(schema.tollboothRefunds).values({id:refundId,tenantId:args.tenantId,paymentId:payment.id,amount,currency:payment.currency,feeReturned,reason:args.reason??null,note:args.note??null,status:'pending',apiKeyId:args.apiKeyId??null,createdByKind:args.createdByKind}).returning())[0];
  const preparedAt=operation?.checkpoint?.preparedAt?new Date(String(operation.checkpoint.preparedAt)):refund.createdAt;
  let remote:Stripe.Refund;
  try{
    await operation?.assertOwnership();
    if(Date.now()-preparedAt.getTime()>23*3600000){const matches=(await stripe(payment.mode as 'test'|'live').refunds.list({payment_intent:payment.paymentIntentId,limit:100})).data.filter(item=>item.metadata?.tollbooth_refund_id===refundId);if(matches.length!==1)throw new RefundError(409,'refund_conflict','Unresolved refund requires provider reconciliation; a new charge will not be issued');remote=matches[0];}
    else remote=await stripe(payment.mode as 'test'|'live').refunds.create({payment_intent:payment.paymentIntentId,amount,reverse_transfer:true,refund_application_fee:true,reason:(args.reason??undefined)as'duplicate'|'fraudulent'|'requested_by_customer'|undefined,metadata:{tollbooth_payment_id:payment.id,tenant_id:payment.tenantId,tollbooth_refund_id:refundId}},{idempotencyKey:`tollbooth-refund:${refundId}`});
    if(remote.amount!==amount||remote.currency!==payment.currency||remote.metadata?.tollbooth_payment_id!==payment.id||remote.metadata?.tollbooth_refund_id!==refundId)throw new RefundError(409,'refund_conflict','Provider refund identity or amount mismatch');
  }catch(error){await operation?.assertOwnership();const definitive=typeof error==='object'&&error!==null&&'type'in error&&['StripeCardError','StripeInvalidRequestError','card_error','invalid_request_error'].includes(String(error.type));if(definitive){await db.update(schema.tollboothRefunds).set({status:'failed'}).where(eq(schema.tollboothRefunds.id,refundId));await db.update(schema.tollboothPayments).set({pendingRefundId:null,updatedAt:new Date()}).where(and(eq(schema.tollboothPayments.id,payment.id),eq(schema.tollboothPayments.pendingRefundId,refundId)));}throw error;}
  await operation?.assertOwnership();
  return (await reconcileProviderRefund(remote))??refund;
}

/** Authoritative GETs settle a persisted operation; repeated events never add its amount twice. */
export async function reconcileProviderRefund(remote:Stripe.Refund,eventMode?:"test"|"live"):Promise<TbRefund|undefined>{
 const id=remote.metadata?.tollbooth_refund_id;
 if(!id||!/^[-a-f0-9]{36}$/i.test(id))return undefined;
 const [refund]=await db.select().from(schema.tollboothRefunds).where(eq(schema.tollboothRefunds.id,id));if(!refund)return undefined;
 const [payment]=await db.select().from(schema.tollboothPayments).where(and(eq(schema.tollboothPayments.id,refund.paymentId),eq(schema.tollboothPayments.tenantId,refund.tenantId)));if(!payment)return undefined;
 if(remote.metadata?.tenant_id!==payment.tenantId||remote.metadata?.tollbooth_payment_id!==payment.id||remote.amount!==refund.amount||remote.currency!==payment.currency||(refund.stripeRefundId&&refund.stripeRefundId!==remote.id))throw new RefundError(409,'refund_conflict','Provider refund identity or amount mismatch');
 if(eventMode&&eventMode!==payment.mode)throw new RefundError(409,'refund_conflict','Provider refund mode mismatch');
 remote=await stripe(payment.mode as 'test'|'live').refunds.retrieve(remote.id);
 if(remote.metadata?.tenant_id!==payment.tenantId||remote.metadata?.tollbooth_payment_id!==payment.id||remote.metadata?.tollbooth_refund_id!==refund.id||remote.amount!==refund.amount||remote.currency!==payment.currency)throw new RefundError(409,'refund_conflict','Provider refund identity or amount mismatch');
 const chargeId=typeof remote.charge==='string'?remote.charge:remote.charge?.id;if(!chargeId)throw new RefundError(409,'refund_conflict','Provider refund charge is missing');
 const charge=await stripe(payment.mode as 'test'|'live').charges.retrieve(chargeId);const intent=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
 if(intent!==payment.paymentIntentId||charge.currency!==payment.currency||charge.livemode!==(payment.mode==='live')||charge.amount_refunded<0||charge.amount_refunded>payment.amount||(remote.status==='succeeded'&&charge.amount_refunded<refund.amount))throw new RefundError(409,'refund_conflict','Provider refund charge or mode mismatch');
 if(refund.status==='succeeded'&&remote.status!=='succeeded')return refund;
 const status=remote.status==='succeeded'||remote.status==='pending'?remote.status:remote.status==='canceled'?'canceled':'failed';
 const [updated]=await db.update(schema.tollboothRefunds).set({stripeRefundId:remote.id,status}).where(and(eq(schema.tollboothRefunds.id,refund.id),status==='succeeded'?undefined:ne(schema.tollboothRefunds.status,'succeeded'))).returning();
 if(!updated)return (await db.select().from(schema.tollboothRefunds).where(eq(schema.tollboothRefunds.id,refund.id)))[0];
 let settled=payment;
 if(status==='succeeded'){
  [settled]=await db.update(schema.tollboothPayments).set({amountRefunded:sql`greatest(${schema.tollboothPayments.amountRefunded},${charge.amount_refunded})`,status:sql`case when ${schema.tollboothPayments.status}='disputed' then 'disputed' when greatest(${schema.tollboothPayments.amountRefunded},${charge.amount_refunded})>=${schema.tollboothPayments.amount} then 'refunded' else 'partially_refunded' end`,netFee:sql`greatest(0,${schema.tollboothPayments.applicationFee}-floor(${schema.tollboothPayments.applicationFee}*greatest(${schema.tollboothPayments.amountRefunded},${charge.amount_refunded})/greatest(${schema.tollboothPayments.amount},1)))`,pendingRefundId:sql`case when ${schema.tollboothPayments.pendingRefundId}=${refund.id}::uuid then null else ${schema.tollboothPayments.pendingRefundId} end`,updatedAt:new Date()}).where(and(eq(schema.tollboothPayments.id,payment.id),eq(schema.tollboothPayments.tenantId,payment.tenantId))).returning();
 }else if(status!=='pending'){
  [settled]=await db.update(schema.tollboothPayments).set({pendingRefundId:null,updatedAt:new Date()}).where(and(eq(schema.tollboothPayments.id,payment.id),eq(schema.tollboothPayments.pendingRefundId,refund.id))).returning();settled??=payment;
 }
 await emitRefund(updated,settled).catch(()=>{});if(status==='succeeded')await emitPayment(settled,settled.status==='refunded'?'payment.refunded':'payment.succeeded',{status:payment.status}).catch(()=>{});
 return updated;
}
