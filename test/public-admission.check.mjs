import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import ts from 'typescript';
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const bodyModule={exports:{}};
runInNewContext(compile('src/lib/bounded-json.ts'),{module:bodyModule,exports:bodyModule.exports,setTimeout,clearTimeout,TextDecoder,Uint8Array});
test('invalid public links and buyer payloads spend no global budget; outages cause no writes',async()=>{
 for(const scenario of ['email','missing-link','tenant','price','outage']){
  let admissions=0,writes=0,reads=0;const module={exports:{}};
  const db={select:()=>({from:()=>({where:async()=>{reads++;return reads===1?(scenario==='missing-link'?[]:[{active:true,tenantId:'tenant',priceId:'price'}]):[{active:scenario!=='price',id:'price'}];}})}),insert:()=>{writes++;throw new Error('unexpected write');}};
  const stubs={'@/lib/tenant-admission':{tenantActive:async()=>scenario!=='tenant'},'@/lib/rate-limit':{RATE_LIMITS:{public:{limit:10,windowMs:60000}},rateAdmission:async()=>{admissions++;return false;}},'@/lib/bounded-json':bodyModule.exports,'next/server':{NextResponse:Response},'drizzle-orm':{eq:()=>({}),and:()=>({})},'@/lib/db':{db,schema:{}},'@/lib/payments':{createCheckout:()=>{writes++;},NotReadyError:Error},'@/lib/stripe':{stripeMode:()=> 'test'}};
  stubs['@/lib/db'].schema=new Proxy({},{get:()=>new Proxy({},{get:()=>({})})});
  runInNewContext(compile('src/app/api/pay/[slug]/route.ts'),{module,exports:module.exports,require:id=>stubs[id],console});
  const response=await module.exports.POST(new Request('https://test',{method:'POST',body:JSON.stringify({email:scenario==='email'?'bad':'buyer@example.test'})}),{params:Promise.resolve({slug:'synthetic'})});
  assert.equal(response.status,scenario==='email'?400:scenario==='outage'?429:404);
  assert.equal(admissions,scenario==='outage'?1:0);assert.equal(writes,0);
 }
});
