import {parseEnv} from 'node:util';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function mergeStagingEnv(product,database){
 const app=parseEnv(product),db=parseEnv(database);
 if(!db.DATABASE_URL)throw new Error('Staging database secret must define DATABASE_URL.');
 let url;try{url=new URL(db.DATABASE_URL);}catch{throw new Error('Staging database URL is invalid.');}
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Staging database must use PostgreSQL.');
 for(const key of Object.keys(app))if(!key.startsWith('DATABASE_')&&/^(NEXT_PUBLIC_|AUTH_URL$|BETTER_AUTH_URL$|.*ORIGIN$|.*BASE_URL$|APP_URL$)/.test(key)&&db[key]!==undefined&&db[key]!==app[key])throw new Error('Staging database secret must not override public origins.');
 const merged=product.replace(/\s*$/,'')+'\n'+database.replace(/\s*$/,'')+'\n';
 const values=parseEnv(merged);if(values.DATABASE_URL!==db.DATABASE_URL)throw new Error('Staging database merge precedence failed.');
 return {merged,duplicateDatabaseKey:app.DATABASE_URL!==undefined,productKeyCount:Object.keys(app).length,databaseKeyCount:Object.keys(db).length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const [product,database,target]=process.argv.slice(2);if(!product||!database||!target)throw new Error('Expected product secret, database secret, and build env paths.');const result=mergeStagingEnv(readFileSync(product,'utf8'),readFileSync(database,'utf8'));writeFileSync(target,result.merged,{mode:0o600});unlinkSync(product);unlinkSync(database);console.log(JSON.stringify({stagingEnvPrepared:true,duplicateDatabaseKey:result.duplicateDatabaseKey,productKeyCount:result.productKeyCount,databaseKeyCount:result.databaseKeyCount}));}catch{console.error('Staging build environment preparation failed; secret values are not logged.');process.exitCode=1;}
}
