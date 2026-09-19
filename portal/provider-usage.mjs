import {createHash,randomUUID} from 'node:crypto';

const integer=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:/-]{1,180}$/.test(value)?value:null;
const operations=new Set(['conversation','post','creation_plan','image','agent','contextual_review','operational_validation']);

// Provider measurements only. Missing fields stay unknown, never estimated as zero.
// Cached input is a subset of input; reasoning output is a subset of output.
export function measuredTokens(usage){
 const input=integer(usage?.input_tokens),output=integer(usage?.output_tokens);
 let cachedInput=integer(usage?.input_tokens_details?.cached_tokens);
 let reasoningOutput=integer(usage?.output_tokens_details?.reasoning_tokens);
 if(input!==null&&cachedInput!==null&&cachedInput>input)cachedInput=null;
 if(output!==null&&reasoningOutput!==null&&reasoningOutput>output)reasoningOutput=null;
 return {input,cachedInput,output,total:integer(usage?.total_tokens),reasoningOutput,
  imageInput:integer(usage?.input_tokens_details?.image_tokens),textInput:integer(usage?.input_tokens_details?.text_tokens)};
}

// Internal records cannot be written through the public records API. No prompts,
// outputs, file names, API keys, headers or provider error messages are persisted.
export async function recordProviderUsage(db,job,response,{operation,model,observedAt=Date.now()}={}){
 if(!job?.org_id||(!job.id&&!identifier(job.operationId))||!operations.has(operation))throw new Error('Invalid usage context');
 const responseId=identifier(response?.id)||identifier(response?.responseId);
 const requestId=identifier(response?.requestId);
 const identity=responseId?'response:'+responseId:requestId?'request:'+requestId:'unidentified:'+randomUUID();
 const externalId='openai:'+createHash('sha256').update(identity).digest('hex');
 const tokens=measuredTokens(response?.usage),at=integer(observedAt)??Date.now();
 const value={schemaVersion:1,provider:'openai',operation,orgId:job.org_id,jobId:job.id||null,operationId:identifier(job.operationId),
  model:identifier(response?.model)||identifier(model),configuredModel:identifier(model),
  responseId,requestId,observedAt:at,usageAvailable:Object.values(tokens).some(n=>n!==null),tokens};
 try{
  const saved=await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'provider_usage',?,?,?,?) ON CONFLICT(org_id,kind,external_id) DO NOTHING").run(randomUUID(),job.org_id,JSON.stringify(value),externalId,at,at);
  return {recorded:saved.changes===1,externalId};
 }catch{
  // A charged response may already exist: prevent an automatic duplicate call.
  throw Object.assign(new Error('A resposta chegou, mas o registro técnico de consumo falhou. Confira esta tentativa antes de repetir.'),{state:'uncertain',code:'provider_usage_storage_failed'});
 }
}


// The financial measurement window never uses the operational quota reset.
// Only aggregates leave the server; identifiers and raw ledger data stay private.
export async function providerUsageSummary(db,org,now=Date.now()){
 const since=now-86400000;
 const rows=await db.prepare("SELECT data FROM records WHERE org_id=? AND kind='provider_usage' AND created_at>=? AND created_at<=?").all(org,since,now);
 const totals={input:null,cachedInput:null,output:null},coverage={input:0,cachedInput:0,output:0},groups=new Map();
 let measuredCalls=0;
 for(const row of rows){
  let data;try{data=JSON.parse(row.data);}catch{data={};}
  const tokens=Object.fromEntries(['input','cachedInput','output','total','reasoningOutput','imageInput','textInput'].map(k=>[k,integer(data?.tokens?.[k])]));
  if(tokens.input!==null&&tokens.cachedInput!==null&&tokens.cachedInput>tokens.input)tokens.cachedInput=null;
  const measured=Object.values(tokens).some(n=>n!==null);
  if(measured)measuredCalls++;
  for(const field of Object.keys(totals))if(tokens[field]!==null){
   coverage[field]++;
   // An unsafe total must not become an apparently exact number.
   if(coverage[field]===1)totals[field]=tokens[field];
   else if(totals[field]!==null)totals[field]=integer(totals[field]+tokens[field]);
  }
  const operation=operations.has(data?.operation)?data.operation:'unknown',model=identifier(data?.model),key=JSON.stringify([operation,model]);
  const group=groups.get(key)||{operation,model,calls:0,measuredCalls:0};group.calls++;if(measured)group.measuredCalls++;groups.set(key,group);
 }
 return {windowStart:since,windowEnd:now,calls:rows.length,measuredCalls,unknownCalls:rows.length-measuredCalls,tokens:totals,coverage,
  groups:[...groups.values()].sort((a,b)=>b.calls-a.calls||a.operation.localeCompare(b.operation)||String(a.model).localeCompare(String(b.model)))};
}
