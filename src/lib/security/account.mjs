export class AdmissionError extends Error { constructor(status=503){super('Account admission unavailable');this.status=status;} }
export async function accountAllowed(db,userId){
 let row;try{row=(await db.query(`SELECT u.id,coalesce(p.state,'active') AS state FROM "user" u LEFT JOIN platform_subject_policy p ON p.subject_kind='user' AND p.subject_id=u.id WHERE u.id=$1`,[userId])).rows[0];}catch{throw new AdmissionError(503);}
 return !!row&&row.state==='active';
}
export async function accountSessionAllowed(db,userId,sessionId){
 if(!sessionId||!await accountAllowed(db,userId))return false;
 try{return !!(await db.query('SELECT id FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>now()',[sessionId,userId])).rows[0];}catch{throw new AdmissionError(503);}
}
