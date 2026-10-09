import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedJson,RequestBodyError} from '../src/lib/bounded-json';
test('checkout JSON has a byte limit without trusting Content-Length',async()=>{
 await assert.rejects(boundedJson(new Request('https://test',{method:'POST',body:JSON.stringify({email:'x'.repeat(17000)})})),(error:unknown)=>error instanceof RequestBodyError&&error.status===413);
 assert.deepEqual(await boundedJson(new Request('https://test',{method:'POST',body:'{"email":"buyer@example.test"}'})),{email:'buyer@example.test'});
});
test('slow bodies time out even when stream cancellation never resolves',async()=>{
 const body=new ReadableStream<Uint8Array>({pull:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})});
 const request=new Request('https://test',{method:'POST',body,duplex:'half'} as RequestInit);
 await assert.rejects(boundedJson(request,16384,20),(error:unknown)=>error instanceof RequestBodyError&&error.status===408);
});
