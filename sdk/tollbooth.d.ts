export type Mode = "live" | "test";
export type Currency = string;

export interface Payment {
  object: "payment";
  id: string;
  mode: Mode;
  status: "pending" | "succeeded" | "failed" | "expired" | "refunded" | "partially_refunded" | "disputed";
  /** Minor units. 2500 = $25.00. */
  amount: number;
  amount_refunded: number;
  currency: Currency;
  application_fee: number;
  net_fee: number;
  description: string | null;
  customer: string | null;
  customer_email: string | null;
  reference: string | null;
  metadata: Record<string, string>;
  source: "api" | "link";
  /** Only present while status is "pending". */
  checkout_url: string | null;
  success_url: string | null;
  created: number;
  expires_at: number | null;
  updated: number;
}

export interface Refund {
  object: "refund";
  id: string;
  payment: string;
  amount: number;
  currency: Currency;
  fee_returned: number;
  reason: string | null;
  note: string | null;
  status: "pending" | "succeeded" | "failed" | "canceled";
  created: number;
}

export interface Customer {
  object: "customer";
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  metadata: Record<string, string>;
  total_spent: number;
  payment_count: number;
  first_paid_at: number | null;
  last_paid_at: number | null;
  created: number;
}

export interface Product {
  object: "product";
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  active: boolean;
  metadata: Record<string, string>;
  created: number;
}

export interface Price {
  object: "price";
  id: string;
  product: string | null;
  product_name: string | null;
  nickname: string | null;
  amount: number;
  currency: Currency;
  /** Stable handle you can hardcode instead of an id. */
  lookup_key: string | null;
  active: boolean;
  created: number;
}

export interface PaymentLink {
  object: "payment_link";
  id: string;
  name: string;
  slug: string;
  /** Relative path; prefix with your site URL to share it. */
  url: string;
  price: string | null;
  amount: number | null;
  currency: Currency | null;
  allow_quantity: boolean;
  success_url: string | null;
  cancel_url: string | null;
  active: boolean;
  view_count: number;
  payment_count: number;
  created: number;
}

export interface WebhookEndpoint {
  object: "webhook_endpoint";
  id: string;
  url: string;
  description: string | null;
  events: string[];
  mode: Mode;
  enabled: boolean;
  status: "active" | "failing" | "disabled";
  last_delivery_status: string | null;
  last_delivery_at: number | null;
  failure_count: number;
  created: number;
}

export interface List<T> {
  object: "list";
  data: T[];
  has_more: boolean;
}

export interface Balance {
  object: "balance";
  mode: Mode;
  available: number;
  pending: number;
  currency: Currency;
  payouts_enabled: boolean;
  next_payout_at: number | null;
  fee: string;
  net_after_fee_on_100: number;
}

export interface CreateCheckoutParams {
  /** Price id or `lookup_key`. Preferred: the amount stays server-side. */
  price?: string;
  /** Minor units. Required when `price` is omitted. */
  amount?: number;
  currency?: Currency;
  description?: string;
  quantity?: number;
  reference?: string;
  customer?: string;
  customer_email?: string;
  metadata?: Record<string, string>;
  success_url?: string;
  cancel_url?: string;
}

export interface CreateRefundParams {
  payment_id: string;
  /** Minor units. Omit to refund the remainder. */
  amount?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer" | "expired_uncaptured_charge";
  note?: string;
}

export class TollboothError extends Error {
  status: number;
  type: string;
  requestId?: string;
  /** True when the same request could succeed if retried (includes a 409 whose request is still in flight). */
  readonly retryable: boolean;
  constructor(message: string, info?: { status?: number; type?: string; requestId?: string });
}

export interface TollboothOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Retries for network errors, 429s and 5xx. Defaults to 2. */
  maxRetries?: number;
}

export declare class Tollbooth {
  constructor(options: TollboothOptions);
  readonly apiKey: string;
  readonly baseUrl: string;
  /** Derived from the key prefix: a `tb_test_` key can never move real money. */
  readonly mode: Mode;

  request<T = unknown>(path: string, options?: { method?: string; body?: unknown; query?: Record<string, string | number | undefined>; idempotencyKey?: string; headers?: Record<string, string> }): Promise<T>;

  readonly checkout: {
    create(params: CreateCheckoutParams, options?: { idempotencyKey?: string }): Promise<Payment>;
  };
  readonly payments: {
    retrieve(params: { id: string }): Promise<Payment>;
    list(params?: { limit?: number; starting_after?: string; status?: string; customer?: string; reference?: string; mode?: Mode }): Promise<List<Payment>>;
  };
  readonly refunds: {
    create(params: CreateRefundParams, options?: { idempotencyKey?: string }): Promise<Refund>;
    retrieve(params: { id: string }): Promise<Refund>;
    list(params?: { payment_id?: string; limit?: number }): Promise<List<Refund>>;
  };
  readonly customers: {
    create(params: { email: string; name?: string; phone?: string; metadata?: Record<string, string> }, options?: { idempotencyKey?: string }): Promise<Customer>;
    retrieve(params: { id: string }): Promise<Customer>;
    list(params?: { email?: string; q?: string; limit?: number }): Promise<List<Customer>>;
    update(params: { id: string; name?: string; phone?: string; metadata?: Record<string, string> }): Promise<Customer>;
  };
  readonly products: {
    create(params: { name: string; description?: string; metadata?: Record<string, string> }, options?: { idempotencyKey?: string }): Promise<Product>;
    retrieve(params: { id: string }): Promise<Product>;
    list(params?: { limit?: number }): Promise<List<Product>>;
  };
  readonly prices: {
    create(params: { product?: string; amount: number; currency?: Currency; nickname?: string; lookup_key?: string }, options?: { idempotencyKey?: string }): Promise<Price>;
    retrieve(params: { id: string }): Promise<Price>;
    list(params?: { product?: string; limit?: number }): Promise<List<Price>>;
  };
  readonly links: {
    create(params: { price: string; name?: string; slug?: string; success_url?: string; cancel_url?: string; allow_quantity?: boolean }, options?: { idempotencyKey?: string }): Promise<PaymentLink>;
    retrieve(params: { id: string }): Promise<PaymentLink>;
    list(params?: { limit?: number }): Promise<List<PaymentLink>>;
  };
  readonly webhooks: {
    create(params: { url: string; events?: string[]; description?: string }, options?: { idempotencyKey?: string }): Promise<WebhookEndpoint & { secret: string }>;
    retrieve(params: { id: string }): Promise<WebhookEndpoint>;
    list(params?: { limit?: number }): Promise<List<WebhookEndpoint>>;
    remove(params: { id: string }): Promise<{ object: "webhook_endpoint"; id: string; deleted: true }>;
    deliveries(params: { id: string; status?: "delivered" | "failed" | "pending"; limit?: number }): Promise<List<{ object: "event_delivery"; id: string; event_type: string; status: string; attempts: number; response_status: number | null; error: string | null; created: number }>>;
  };

  balance(): Promise<Balance>;
}

/** Verify a `Tollbooth-Signature` header against the raw request body. */
export declare function verifySignature(options: { payload: string; header: string; secret: string; toleranceSeconds?: number }): Promise<boolean>;

/** Build a signed header, for testing a handler without a live delivery. */
export declare function signPayload(secret: string, payload: string, timestamp?: number): Promise<{ header: string; timestamp: number; mac: string }>;

export declare const version: string;
export default Tollbooth;
