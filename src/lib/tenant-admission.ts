import "server-only";
import {sql} from 'drizzle-orm';
import {db} from '@/lib/db';
/** Every bearer/public request observes the workspace's current lifecycle state. */
export async function tenantActive(tenantId:string):Promise<boolean>{
 const result=await db.execute(sql`SELECT id FROM tenants WHERE id=${tenantId} AND status='active' AND deleted_at IS NULL`);
 return result.rows.length===1;
}
