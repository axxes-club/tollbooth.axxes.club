import {wrapAccountAuth} from "@/lib/security/auth-guard";
import {sql} from "drizzle-orm";
import {accountSessionAllowed} from "@/lib/security/account.mjs";
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db, schema } from "@/lib/db"

const baseURL =
  process.env.BETTER_AUTH_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")

// Shares the user/session/account tables with members.axxes.club, so every
// AXXES account can sign in here with the same credentials.
// With Handshake (handshake.axxes.club), every *.axxes.club app shares one session cookie
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN
const parentDomain = (cookieDomain || "axxes.club").replace(/^\./, "")

// Central AXXES sign-in; when unset the app uses its own sign-in page
export const HANDSHAKE_URL = process.env.HANDSHAKE_URL?.replace(/\/$/, "") || null

const baseAuth = betterAuth({
  disabledPaths: ["/sign-up/email"],
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    baseURL,
    `https://${parentDomain}`,
    `https://*.${parentDomain}`,
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
  advanced: cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } } : undefined,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, disableSignUp: true },
})

const accountDb={query:async(text:string,values:unknown[])=>{
 const [id,userId]=values;
 const result=await db.execute(text.includes('FROM "session"')
  ?sql`SELECT id FROM "session" WHERE id=${id} AND user_id=${userId} AND expires_at>now()`
  :sql`SELECT u.id,coalesce(p.state,'active') AS state FROM "user" u LEFT JOIN platform_subject_policy p ON p.subject_kind='user' AND p.subject_id=u.id WHERE u.id=${id}`);
 return {rows:result.rows as Record<string,unknown>[]};
}};
export async function getAppSession(h:Headers){
 const value=await auth.api.getSession({headers:h});
 return value;
}

export const auth=wrapAccountAuth(baseAuth,(userId,sessionId)=>accountSessionAllowed(accountDb,userId,sessionId));
