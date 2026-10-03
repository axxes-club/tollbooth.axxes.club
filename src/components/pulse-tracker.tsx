import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { PulseTrackerClient } from "./pulse-tracker-client";
/** Caller supplies the organization from its validated live membership context. */
export async function PulseTracker({
  tenantId,
  userId,
  appKey,
}: {
  tenantId: string;
  userId: string;
  appKey: string;
}) {
  try {
    const h = await headers();
    const origin =
      "https://" + (h.get("x-forwarded-host") || h.get("host") || "");
    const result = await db.execute(
      sql`select public_id,identity_mode,allowed_origins from pulse_sites where tenant_id=${tenantId} and integration_key=${appKey} and environment='production' and enabled=true and exists(select 1 from tenant_memberships m join tenants t on t.id=m.tenant_id where m.tenant_id=${tenantId} and m.user_id=${userId} and m.deleted_at is null and t.deleted_at is null and t.status not in ('suspended','cancelled')) order by created_at desc`,
    );
    const rows = (
      Array.isArray(result)
        ? result
        : (
            result as unknown as {
              rows: Array<{
                public_id: string;
                identity_mode: string;
                allowed_origins: string[];
              }>;
            }
          ).rows
    ) as Array<{
      public_id: string;
      identity_mode: string;
      allowed_origins: string[];
    }>;
    const site = rows.find((row) => row.allowed_origins.includes(origin));
    if (!site) return null;
    return (
      <PulseTrackerClient
        siteId={site.public_id}
        persistent={site.identity_mode === "persistent"}
      />
    );
  } catch {
    return null;
  }
}
