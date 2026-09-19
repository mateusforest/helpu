import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../portal/database.mjs';
import {providerUsageSummary,recordProviderUsage} from '../portal/provider-usage.mjs';
import {usageSnapshot,usageDay} from '../portal/usage.mjs';
import {technicalUsageCard} from '../dist/assets/usage-ui.js';

for(const postgres of [false,true])test('resumo técnico isola empresa, janela e desconhecidos; reset não apaga medição em '+(postgres?'PostgreSQL':'SQLite'),async()=>{
 let pg,db;
 if(postgres){pg=await PGlite.create();await pg.exec('CREATE SCHEMA helpu');let queue=Promise.resolve();db=createDatabase({pool:{async connect(){const previous=queue;let release;queue=new Promise(r=>release=r);await previous;return {async query(sql,args){const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows};},release};},async end(){}}});}
 else db=createDatabase({filename:':memory:'});
 try{
  const schema=postgres?'helpu.':'';
  await db.exec('CREATE TABLE '+schema+'records(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,external_id TEXT,created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,UNIQUE(org_id,kind,external_id))');
  await db.exec('CREATE TABLE '+schema+'usage_reservations(org_id TEXT,category TEXT,day TEXT,created_at BIGINT)');
  const now=1800000000000,org='private-org',job={org_id:org,id:'private-job'},policy={timeZone:'America/Sao_Paulo',dailyRuns:8,dailyMedia:8,dailyMessages:30};
  const save=(id,usage,at=now-1000,orgId=org)=>recordProviderUsage(db,{...job,org_id:orgId},{id,model:'test-model',usage},{operation:'conversation',model:'test-model',observedAt:at});
  await save('private-response-one',{input_tokens:100,input_tokens_details:{cached_tokens:40},output_tokens:10});
  await save('private-response-one',{input_tokens:100,input_tokens_details:{cached_tokens:40},output_tokens:10});
  await save('private-response-two',{input_tokens:200});await save('private-response-three',undefined);
  await save('private-outside',{input_tokens:9000},now-86400001);await save('private-future',{input_tokens:9000},now+1);await save('private-other',{input_tokens:9000},now-1000,'other-company');
  await db.prepare("INSERT INTO usage_reservations(org_id,category,day,created_at) VALUES(?,'agent',?,?)").run(org,usageDay(policy,now),now-1000);
  const summary=await providerUsageSummary(db,org,now);
  assert.equal(summary.calls,3);assert.equal(summary.measuredCalls,2);assert.equal(summary.unknownCalls,1);
  assert.deepEqual(summary.tokens,{input:300,cachedInput:40,output:10});assert.deepEqual(summary.coverage,{input:2,cachedInput:1,output:1});
  assert.deepEqual(summary.groups,[{operation:'conversation',model:'test-model',calls:3,measuredCalls:2}]);assert.doesNotMatch(JSON.stringify(summary),/private-|other-company|responseId|jobId/);
  const before=await usageSnapshot(db,org,policy,now),after=await usageSnapshot(db,org,{...policy,usageResetAt:now-500},now);
  assert.equal(before.used.dailyRuns,1);assert.equal(after.used.dailyRuns,0);assert.deepEqual(before.technicalUsage,after.technicalUsage);assert.deepEqual(after.technicalUsage,summary);
  await save('private-unknown',undefined,now-1000,'unknown-company');const unknown=await providerUsageSummary(db,'unknown-company',now);assert.deepEqual(unknown.tokens,{input:null,cachedInput:null,output:null});assert.equal(unknown.measuredCalls,0);
  const empty=await providerUsageSummary(db,'empty-company',now);assert.equal(empty.calls,0);assert.deepEqual(empty.tokens,{input:null,cachedInput:null,output:null});
 }finally{await db.close();if(pg)await pg.close();}
});

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('resumo visível distingue soma parcial, quantidade desconhecida e medição de cobrança',()=>{
 const usage={calls:3,measuredCalls:2,unknownCalls:1,tokens:{input:300,cachedInput:null,output:0},coverage:{input:2,cachedInput:0,output:1},groups:[{operation:'image',model:'<script>bad</script>',calls:3,measuredCalls:2}]};
 const html=technicalUsageCard(usage,esc);
 assert.match(html,/3 chamadas registradas/);assert.match(html,/2 de 3 chamadas; soma parcial/);assert.match(html,/Não informado/);assert.match(html,/>0<\/strong>/);assert.match(html,/cache já faz parte da entrada/);assert.match(html,/preserva o histórico ao zerar/);assert.match(html,/não representa créditos do plano nem o valor da fatura/);assert.doesNotMatch(html,/<script>|R\$/);assert.match(html,/&lt;script&gt;/);
 assert.match(technicalUsageCard(null,esc),/ainda não está disponível/);assert.doesNotMatch(technicalUsageCard(null,esc),/0 chamadas/);
 assert.match(technicalUsageCard({calls:0},esc),/Nenhuma resposta de IA registrada/);
});
