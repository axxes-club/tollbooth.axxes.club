import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {parseEnv} from 'node:util';
import {mergeStagingEnv} from './gcp-staging-env.mjs';
test('database secret overrides duplicate URL and preserves public origin and multiline strings',()=>{const out=mergeStagingEnv('DATABASE_URL="postgres://old:old@legacy/db"\nNEXT_PUBLIC_APP_URL=https://stage.example.com\nTEXT="one\ntwo"\n','DATABASE_URL="postgresql://ci:only@127.0.0.1/db?host=/cloudsql/project:region:stage"\n');const parsed=parseEnv(out.merged);assert.equal(parsed.NEXT_PUBLIC_APP_URL,'https://stage.example.com');assert.equal(parsed.TEXT,'one\ntwo');assert.match(parsed.DATABASE_URL,/cloudsql/);assert.equal(out.duplicateDatabaseKey,true);});
test('missing database or public-origin overrides fail without displaying values',()=>{assert.throws(()=>mergeStagingEnv('NEXT_PUBLIC_APP_URL=https://stage.example.com','DATABASE_URL=postgresql://ci:only@host/db\nNEXT_PUBLIC_APP_URL=https://prod.example.com'),/public origins/);assert.throws(()=>mergeStagingEnv('DATABASE_URL=postgresql://old:old@host/db',''),/must define/);});
