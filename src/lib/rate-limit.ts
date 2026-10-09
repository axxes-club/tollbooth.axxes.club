import "server-only";
import {createHash} from "node:crypto";
import {sql} from "drizzle-orm";
import {db,transactionDb} from "./db";
export type RateLimit={limit:number;windowMs:number};
export type RateLimitResult={ok:boolean;limit:number;remaining:number;resetAt:number};
export const RATE_LIMITS={read:{limit:300,windowMs:60000},write:{limit:120,windowMs:60000},public:{limit:10,windowMs:60000}};
export async function rateLimit(key:string,{limit,windowMs}:RateLimit,executor:Pick<typeof db,"execute">=db):Promise<RateLimitResult>{
 const denied={ok:false,limit,remaining:0,resetAt:Date.now()+windowMs};
 try{
  const identity=createHash("sha256").update(key).digest("hex");
  const result=await executor.execute(sql`WITH cleanup AS (DELETE FROM tollbooth_security_rate_limits WHERE reset_at < CURRENT_TIMESTAMP - INTERVAL '1 hour' AND key <> ${identity} AND key IN (SELECT key FROM tollbooth_security_rate_limits WHERE reset_at < CURRENT_TIMESTAMP - INTERVAL '1 hour' AND key <> ${identity} LIMIT 20) RETURNING key)
   INSERT INTO tollbooth_security_rate_limits (key,count,reset_at)
   VALUES (${identity},1,CURRENT_TIMESTAMP + (${windowMs}::bigint * INTERVAL '1 millisecond'))
   ON CONFLICT(key) DO UPDATE SET count=CASE WHEN tollbooth_security_rate_limits.reset_at<=CURRENT_TIMESTAMP THEN 1 ELSE LEAST(tollbooth_security_rate_limits.count,${limit})+1 END,
   reset_at=CASE WHEN tollbooth_security_rate_limits.reset_at<=CURRENT_TIMESTAMP THEN EXCLUDED.reset_at ELSE tollbooth_security_rate_limits.reset_at END
   RETURNING count,reset_at`);
  const row=result.rows[0] as {count:number;reset_at:string}|undefined;
  if(!row)return denied;
  return {ok:row.count<=limit,limit,remaining:Math.max(0,limit-row.count),resetAt:new Date(row.reset_at).getTime()};
 }catch{return denied;}
}

export async function rateAdmission(budgets:Array<{key:string;limit:number;windowMs:number}>):Promise<boolean>{
 try{return await transactionDb().transaction(async tx=>{for(const {key,...config} of budgets)if(!(await rateLimit(key,config,tx)).ok)throw new Error('Admission denied');return true;});}catch{return false;}
}
