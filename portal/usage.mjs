// An explicit sentinel survives JSON and distinguishes unlimited from zero.
export const UNLIMITED = 'unlimited';
export const unlimited = value => value === UNLIMITED;
export function usageDay(policy, now = Date.now()) {
 return new Intl.DateTimeFormat('en-CA',{timeZone:policy.timeZone||'America/Sao_Paulo'}).format(new Date(now));
}
export const usageResetAt = policy => Number.isSafeInteger(policy.usageResetAt) && policy.usageResetAt > 0 ? policy.usageResetAt : 0;
export function parseUsageLimit(value) {
 if(unlimited(value))return UNLIMITED;
 const n=Number(value);
 if(value===null||typeof value==='boolean'||String(value).trim()===''||!Number.isSafeInteger(n)||n<0)throw Object.assign(new Error('Informe um limite inteiro não negativo ou escolha Sem limite.'),{status:400});
 return n;
}
export async function usageCount(db,org,category,day,policy) {
 return Number((await db.prepare('SELECT count(*) AS n FROM usage_reservations WHERE org_id=? AND category=? AND day=? AND created_at>?').get(org,category,day,usageResetAt(policy))).n);
}
export async function usageSnapshot(db,org,policy,now=Date.now()) {
 const day=usageDay(policy,now),used={};
 for(const [name,category] of [['dailyRuns','agent'],['dailyMedia','media'],['dailyMessages','send']])used[name]=await usageCount(db,org,category,day,policy);
 // WhatsApp conversation replies have their own idempotent delivery ledger.
 const outbox=await db.prepare("SELECT count(*) AS n FROM records WHERE org_id=? AND kind='whatsapp_chat_outbox' AND created_at>=? AND created_at>?").get(org,now-86400000,usageResetAt(policy));
 return {day,timeZone:policy.timeZone||'America/Sao_Paulo',resetAt:usageResetAt(policy)||null,used,whatsappRepliesLast24Hours:Number(outbox.n),limits:Object.fromEntries(['dailyRuns','dailyMedia','dailyMessages'].map(k=>[k,policy[k]]))};
}
