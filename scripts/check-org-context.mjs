import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire} from 'node:module'
const require=createRequire(process.cwd()+'/package.json')
const ts=require('typescript')
let selected, rows=[], authenticated=true, writes=[], conditions=[], redirects=[]
const schema=new Proxy({}, {get:(_,name)=>new Proxy({}, {get:(_,field)=>`${name}.${field}`})})
const chain={select(){return this},from(){return this},innerJoin(){return this},where(condition){conditions.push(condition);return this},orderBy(){return Promise.resolve(rows)},limit(){return Promise.resolve(rows)}}
const mocks={ 'server-only':{}, react:{cache:f=>f}, 'next/headers':{headers:async()=>new Map(),cookies:async()=>({get:()=>selected?{value:selected}:undefined,set:(...args)=>writes.push(args)})},'next/navigation':{redirect:path=>redirects.push(path)},'drizzle-orm':{and:(...x)=>x,desc:x=>x,eq:(...x)=>x,isNull:x=>x,ne:(...x)=>x},'@/lib/auth':{auth:{api:{getSession:async()=>authenticated?{user:{id:'user',name:'User',email:'user@example.com'}}:null}}},'@/lib/db':{db:chain,schema}}
function load(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(!(n in mocks))throw Error(n);return mocks[n]},process:{env:{NODE_ENV:'test'}}});return exports}
const context=load('src/lib/context.ts');mocks['@/lib/context']=context
rows=[{tenantId:'a',name:'A',slug:'a',role:'owner',isPrimary:true},{tenantId:'b',name:'B',slug:'b',role:'viewer',isPrimary:false}]
selected='b';assert.equal((await context.getContext()).tenant.id,'b')
assert.ok(JSON.stringify(conditions).includes('tenantMemberships.deletedAt'))
assert.ok(JSON.stringify(conditions).includes('tenants.deletedAt'))
selected='forged';assert.equal((await context.getContext()).tenant.id,'a')
if(context.getContext.length) {
assert.equal((await context.getContext('b')).tenant.id,'b')
assert.equal(await context.getContext('forged'),null)
}
rows=[];assert.equal(await context.getContext(),null)
const actions=load('src/lib/actions/org.ts')
assert.ok((await actions.switchOrganization('forged')).error);assert.equal(writes.length,0)
assert.ok((await actions.switchOrganization('00000000-0000-4000-8000-000000000003')).error);assert.equal(writes.length,0)
conditions=[];rows=[{id:'membership'}];assert.deepEqual(Object.keys(await actions.switchOrganization('00000000-0000-4000-8000-000000000002')),[]);assert.equal(writes[0][0],'axxes_org');assert.equal(writes[0][1],'00000000-0000-4000-8000-000000000002');assert.equal(writes[0][2].httpOnly,true)
assert.ok(JSON.stringify(conditions).includes('tenantMemberships.userId'))
assert.ok(JSON.stringify(conditions).includes('tenantMemberships.deletedAt'))
assert.ok(JSON.stringify(conditions).includes('tenants.deletedAt'))
authenticated=false;assert.ok((await actions.switchOrganization('00000000-0000-4000-8000-000000000002')).error);assert.equal(writes.length,1)
authenticated=true
await actions.openInOrganization('00000000-0000-4000-8000-000000000002','/\\evil.example')
assert.equal(redirects[0],'/dashboard')
console.log('Organization context: selected, forged, hinted, missing membership and signed-out checks passed')
