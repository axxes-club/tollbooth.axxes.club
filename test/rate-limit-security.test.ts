import {test} from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../src/lib/db';
import {rateLimit,rateAdmission,RATE_LIMITS} from '../src/lib/rate-limit';
import {PgDialect} from 'drizzle-orm/pg-core';
test('composite transactions set lock and statement deadlines before counters',async()=>{
 const original=db.transaction;const statements:string[]=[];const dialect=new PgDialect();
 db.transaction=(async(callback: (tx:unknown)=>Promise<boolean>)=>callback({execute:async(statement:Parameters<PgDialect['sqlToQuery']>[0])=>{
  statements.push(dialect.sqlToQuery(statement).sql);return {rows:[{count:1,reset_at:new Date().toISOString()}]};
 }})) as unknown as typeof db.transaction;
 try{
  assert.equal(await rateAdmission([{key:'synthetic',...RATE_LIMITS.public}]),true);
  assert.equal(statements[0],"SET LOCAL lock_timeout='3s'");assert.equal(statements[1],"SET LOCAL statement_timeout='3s'");assert.match(statements[2],/INSERT INTO tollbooth_security_rate_limits/);
 }finally{db.transaction=original;}
});
test('rate limiting denies work when shared storage fails',async()=>{
 const original=db.execute;
 db.execute=(async()=>{throw new Error('synthetic outage')}) as unknown as typeof db.execute;
 try {assert.equal((await rateLimit('synthetic',RATE_LIMITS.write)).ok,false);}
 finally {db.execute=original;}
});
test('public checkout denies before customer writes when shared admission storage fails',async()=>{
 const {POST}=await import('../src/app/api/pay/[slug]/route');
 const transaction=db.transaction;const select=db.select;const execute=db.execute;const insert=db.insert;let writes=0;let reads=0;
 db.transaction=(async()=>{throw new Error('synthetic outage')}) as unknown as typeof db.transaction;
 db.select=(()=>({from:()=>({where:async()=>{reads++;return reads===1?[{active:true,tenantId:'tenant',priceId:'price'}]:[{active:true,id:'price'}];}})})) as unknown as typeof db.select;
 db.execute=(async()=>({rows:[{id:'tenant'}]})) as unknown as typeof db.execute;
 db.insert=(()=>{writes++;throw new Error('customer must not be written');}) as unknown as typeof db.insert;
 try{
  const result=await POST(new Request('https://test/api/pay/slug',{method:'POST',body:JSON.stringify({email:'test@example.test'})}),{params:Promise.resolve({slug:'slug'})});
  assert.equal(result.status,429);assert.equal(writes,0);
 }finally{db.transaction=transaction;db.select=select;db.execute=execute;db.insert=insert;}
});
test('bearer credentials deny when current tenant is absent',async()=>{
 const {authenticateApiKey}=await import('../src/lib/api-keys');
 const select=db.select,execute=db.execute,update=db.update;
 db.select=(()=>({from:()=>({where:async()=>[{id:'key',tenantId:'00000000-0000-4000-8000-000000000001',mode:'test',scopes:[]}]})})) as unknown as typeof db.select;
 db.execute=(async()=>({rows:[]})) as unknown as typeof db.execute;
 db.update=(()=>({set:()=>({where:()=>Promise.resolve()})})) as unknown as typeof db.update;
 try{assert.equal(await authenticateApiKey(new Request('https://test',{headers:{authorization:'Bearer tb_test_synthetic'}})),null);}
 finally{db.select=select;db.execute=execute;db.update=update;}
});
