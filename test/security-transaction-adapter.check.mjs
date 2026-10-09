import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

test('Neon HTTP reads use the PostgreSQL adapter for rollback admission',()=>{
 const http={transaction:()=>{throw new Error('Neon HTTP does not support interactive transactions');}};
 const postgres={transaction:()=>true};let pools=0;
 class Pool{constructor(options){pools++;assert.equal(options.max,2);}listenerCount(){return 1;}}
 const module={exports:{}};
 const stubs={
  '@neondatabase/serverless':{neon:()=>({})},
  'drizzle-orm/neon-http':{drizzle:()=>http},
  'drizzle-orm/node-postgres':{drizzle:()=>postgres},
  pg:{Pool},'./schema':{},
 };
 runInNewContext(ts.transpileModule(readFileSync('src/lib/db/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,URL,process:{env:{DATABASE_URL:'postgresql://synthetic:synthetic@synthetic.neon.tech/security_test'}},console,require:id=>stubs[id]});
 assert.equal(module.exports.db,http);
 assert.equal(module.exports.transactionDb(),postgres);
 assert.equal(module.exports.transactionDb(),postgres);
 assert.equal(pools,1,'reuse the bounded process pool');
});
