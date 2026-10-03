import {eq} from 'drizzle-orm';
import {db,schema} from '@/lib/db';
import {withApi,jsonResponse} from '@/lib/api';
// The authenticated key's workspace and mode are the sole authority. No account,
// bank, customer or credential fields cross this integration boundary.
export const GET=withApi(async({caller})=>{
 const [account]=await db.select({chargesEnabled:schema.tollboothAccounts.chargesEnabled,payoutsEnabled:schema.tollboothAccounts.payoutsEnabled,detailsSubmitted:schema.tollboothAccounts.detailsSubmitted}).from(schema.tollboothAccounts).where(eq(schema.tollboothAccounts.tenantId,caller.tenantId));
 const key=caller.mode==='test'?process.env.STRIPE_SECRET_KEY_TEST:process.env.STRIPE_SECRET_KEY;
 const platformConfigured=Boolean(key&&(key.startsWith(`sk_${caller.mode}_`)||key.startsWith(`rk_${caller.mode}_`)));
 const charges=account?.chargesEnabled===1,payouts=account?.payoutsEnabled===1,details=account?.detailsSubmitted===1;
 return jsonResponse({object:'account',tenant_id:caller.tenantId,mode:caller.mode,charges_enabled:charges,payouts_enabled:payouts,details_submitted:details,platform_configured:platformConfigured,ready:charges&&payouts&&details&&platformConfigured});
},{scope:'payments:read'});
