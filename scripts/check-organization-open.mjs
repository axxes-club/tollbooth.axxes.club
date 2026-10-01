import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire} from 'node:module'
const require=createRequire(process.cwd()+'/package.json'), ts=require('typescript')
const source=fs.readFileSync('src/app/api/organization/open/route.ts','utf8')
const landing=process.argv[2]
assert.ok(landing,'Pass expected fixed landing')
const tenant='00000000-0000-4000-8000-000000000002'
let signedIn=true, permitted=true, actionCalls=[], query
const schema=new Proxy({}, {get:(_,name)=>new Proxy({}, {get:(_,field)=>`${name}.${field}`})})
const chain={select(){return this},from(){return this},innerJoin(){return this},where(value){query=value;return this},limit(){return Promise.resolve(permitted?[{id:'membership'}]:[])}}
const response=(status,body,location)=>({status,body,location,writes:[],cookies:{set(...args){this.owner.writes.push(args)},owner:null}})
const attach=r=>{r.cookies.owner=r;return r}
const mocks={'next/server':{NextResponse:{json:(body,options)=>attach(response(options?.status??200,body)),redirect:url=>attach(response(307,null,url.href))}},'next/headers':{headers:async()=>new Map()},'@/lib/actions/org':{switchOrganization:async id=>{actionCalls.push(id);return !signedIn?{error:'Please sign in again.'}:!permitted?{error:'No access.'}:{}}},'drizzle-orm':{and:(...x)=>x,eq:(...x)=>x,isNull:x=>x,ne:(...x)=>x},'@/lib/auth':{auth:{api:{getSession:async()=>signedIn?{user:{id:'user'}}:null}}},'@/lib/db':{db:chain,schema},'@/lib/context':{WORKSPACE_COOKIE:'workspace_cookie'},'@/lib/tenant-context':{TENANT_COOKIE:'workspace_cookie',getTenantContext:async()=>signedIn?{userId:'user'}:null},'@/lib/prisma-base':{__esModule:true,default:{tenant_memberships:{findFirst:async value=>{query=value;return permitted?{id:'membership'}:null}}}}}
const exports={}
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in mocks,n);return mocks[n]},URL,process:{env:{NODE_ENV:'production'}}})
const call=query=>exports.GET(new Request(`https://product.axxes.club/api/organization/open?${query}`))
assert.equal((await call('tenant=invalid')).status,400);assert.equal(actionCalls.length,0)
signedIn=false;assert.equal((await call(`tenant=${tenant}`)).status,401)
signedIn=true;permitted=false;const denied=await call(`tenant=${tenant}`);assert.equal(denied.status,403);assert.equal(denied.writes.length,0)
permitted=true;const allowed=await call(`tenant=${tenant}&next=https://evil.example`);assert.equal(allowed.status,307);assert.equal(allowed.location,`https://product.axxes.club${landing}`)
if(source.includes('switchOrganization')) assert.equal(actionCalls.at(-1),tenant)
else {assert.equal(allowed.writes[0][1],tenant);assert.equal(allowed.writes[0][2].httpOnly,true);assert.ok(JSON.stringify(query).includes(source.includes('basePrisma')?'deleted_at':'deletedAt'));assert.ok(JSON.stringify(query).includes('suspended'))}
console.log('Organization opener: malformed400, signed-out401, denied403/no cookie, authorized307/fixed local landing passed')
