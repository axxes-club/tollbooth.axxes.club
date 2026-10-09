import {test} from "node:test";
import assert from "node:assert/strict";
import {accountAllowed,accountSessionAllowed} from "../src/lib/security/account.mjs";
test("global account suspension applies with entitlement feature disabled",async()=>{
 process.env.AXXES_PLATFORM_ACCESS_ENABLED="false";
 assert.equal(await accountAllowed({query:async()=>({rows:[{id:"user",state:"suspended"}]})},"user"),false);
 assert.equal(await accountAllowed({query:async()=>({rows:[]})},"deleted"),false);
 assert.equal(await accountAllowed({query:async()=>({rows:[{id:"user",state:"unknown"}]})},"user"),false);
});
test("cached sessions require a live matching unexpired session",async()=>{
 const expired={query:async(sql)=>({rows:sql.includes('FROM "session"')?[]:[{id:"user",state:"active"}]})};
 assert.equal(await accountSessionAllowed(expired,"user","session"),false);
 const live={query:async()=>({rows:[{id:"session",state:"active"}]})};
 assert.equal(await accountSessionAllowed(live,"user","session"),true);
 assert.equal(await accountSessionAllowed(live,"user"),false);
});
test("policy datastore outage fails closed with unavailable status",async()=>{
 await assert.rejects(accountAllowed({query:async()=>{throw new Error("outage")}},"user"),error=>error.status===503);
});
