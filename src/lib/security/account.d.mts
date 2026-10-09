type DB={query:(text:string,values:unknown[])=>Promise<{rows:Record<string,unknown>[]}>};
export function accountAllowed(db:DB,userId:string):Promise<boolean>;
export function accountSessionAllowed(db:DB,userId:string,sessionId?:string):Promise<boolean>;
