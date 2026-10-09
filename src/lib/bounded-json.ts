export class RequestBodyError extends Error {
  constructor(readonly status: number) { super('Invalid request body'); }
}
export async function boundedJson(request: Request, maxBytes=16384, timeoutMs=5000): Promise<Record<string, unknown>> {
  const declared=request.headers.get('content-length');
  if(declared && (!/^\d+$/.test(declared) || Number(declared)>maxBytes))throw new RequestBodyError(413);
  if(!request.body)throw new RequestBodyError(400);
  const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new RequestBodyError(408)),timeoutMs);});
  try{
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.byteLength;if(size>maxBytes)throw new RequestBodyError(413);chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!value || typeof value!=='object' || Array.isArray(value))throw new RequestBodyError(400);
    return value as Record<string,unknown>;
  }catch(error){void reader.cancel().catch(()=>{});throw error instanceof RequestBodyError?error:new RequestBodyError(400);}
  finally{clearTimeout(timer);try{reader.releaseLock();}catch{}}
}
