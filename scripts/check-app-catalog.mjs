import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire} from 'node:module'
const require=createRequire(process.cwd()+'/package.json'),ts=require('typescript'),exports={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/all-apps-switcher.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,URL,require:name=>({})})
const app={key:'work',name:'Work',url:'https://work.axxes.club/dashboard?x=1',status:'live',workspaceLaunch:true}
const tenant='00000000-0000-4000-8000-000000000002'
assert.equal(exports.appLaunchUrl(app,tenant),`https://work.axxes.club/api/organization/open?tenant=${tenant}`)
assert.equal(exports.appLaunchUrl(app,'forged'),app.url)
assert.equal(exports.appLaunchUrl({...app,workspaceLaunch:false},tenant),app.url)
assert.equal(exports.appLaunchUrl(app),app.url)
for(const url of ['javascript:alert(1)','http://work.axxes.club','https://user:password@work.axxes.club'])assert.throws(()=>exports.appLaunchUrl({...app,url},tenant))
console.log('App links: validated UUID hints, native-org exclusions and unsafe URL rejection passed')
