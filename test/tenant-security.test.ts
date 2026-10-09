import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasDatabase,resetTestData,sql,suiteFor} from './helpers/db';
import {mintApiKey,call} from './helpers/api';
import {authenticateApiKey} from '../src/lib/api-keys';
import {POST} from '../src/app/api/pay/[slug]/route';
const suite=suiteFor('tenant-admission-security');
test('suspended, deleted, pending and missing tenants deny existing bearer keys and links',{skip:!hasDatabase()},async()=>{
 await resetTestData(suite);
 const key=await mintApiKey(suite.tenant);
 const request=new Request('https://test',{headers:{authorization:`Bearer ${key}`}});
 assert.ok(await authenticateApiKey(request));
 const slug=`tenant-security-${suite.tenant}`;
 await sql().query("insert into tollbooth_links (tenant_id,slug,name) values ($1,$2,'security')",[suite.tenant,slug]);
 for(const state of ['suspended','pending','cancelled','unknown']){
  await sql().query('update tenants set status=$2 where id=$1',[suite.tenant,state]);
  assert.equal(await authenticateApiKey(request),null);
  const response=await call(POST,{method:'POST',params:{slug},body:{email:'buyer@example.test'}});
  assert.equal(response.status,404);
 }
 await sql().query("update tenants set status='active',deleted_at=now() where id=$1",[suite.tenant]);
 assert.equal(await authenticateApiKey(request),null);
 await sql().query('delete from tenants where id=$1',[suite.tenant]);
 assert.equal(await authenticateApiKey(request),null);
 await resetTestData(suite);
});
