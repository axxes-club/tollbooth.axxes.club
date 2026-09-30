/**
 * Test-side API client.
 *
 * Route handlers are plain functions of (Request, context), so tests call them
 * directly instead of booting a server. That keeps the suite fast and free of port
 * flakiness while still exercising the real handler and every wrapper around it:
 * auth, scopes, rate limits, idempotency and request ids.
 */
import { createHash, randomBytes } from "node:crypto"
import { sql } from "./db"

/** Mints a real API key row, exactly as the dashboard does. */
export async function mintApiKey(
  tenant: string,
  mode: "live" | "test" = "test",
  scopes: string[] = ["payments:write", "payments:read", "refunds:write", "catalog:write", "webhooks:write"]
) {
  const secret = `tb_${mode}_${randomBytes(24).toString("base64url")}`
  await sql().query(
    `insert into tollbooth_api_keys (tenant_id, name, prefix, key_hash, mode, scopes, created_by_id)
     values ($1, 'test', $2, $3, $4, $5, 'test')`,
    [tenant, secret.slice(0, 11), createHash("sha256").update(secret).digest("hex"), mode, JSON.stringify(scopes)]
  )
  return secret
}

export type CallResult = {
  status: number
  headers: Headers
  body: any
  text: string
  header: (name: string) => string | null
}

type Invoke = (req: Request, ctx?: any) => Promise<Response>

export async function call(
  handler: Invoke,
  {
    method = "GET",
    path = "/",
    key,
    body,
    headers = {},
    params = {},
  }: { method?: string; path?: string; key?: string; body?: unknown; headers?: Record<string, string>; params?: Record<string, string> } = {}
): Promise<CallResult> {
  const request = new Request(new URL(path, "https://tollbooth.test"), {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })

  const response = await handler(request, { params: Promise.resolve(params) })
  const text = await response.text()
  let json: any
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }
  return { status: response.status, headers: response.headers, body: json, text, header: (n) => response.headers.get(n) }
}
