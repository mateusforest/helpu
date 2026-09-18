import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createCreationSchedules,nextWeekly} from '../portal/creation-schedules.mjs';
test('recorrência usa dias e hora locais de São Paulo e atravessa mudança de horário de verão',()=>{
 assert.equal(new Date(nextWeekly({weekdays:[1,3,5],time:'09:00',timeZone:'America/Sao_Paulo'},Date.parse('2026-09-18T12:00:00Z'))).toISOString(),'2026-09-21T12:00:00.000Z');
 assert.equal(new Date(nextWeekly({weekdays:[1],time:'09:00',timeZone:'America/New_York'},Date.parse('2026-03-06T12:00:00Z'))).toISOString(),'2026-03-09T13:00:00.000Z');
});
test('agendamento respeita data, recorrência, pausa, cancelamento, isolamento e remoção de acesso',async()=>{
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE records(id TEXT PRIMARY KEY,org_id TEXT,kind TEXT,data TEXT,external_id TEXT,created_at INTEGER,updated_at INTEGER); CREATE TABLE conversations(id TEXT,org_id TEXT); CREATE TABLE assets(id TEXT,org_id TEXT); CREATE TABLE memberships(org_id TEXT,user_id INTEGER); INSERT INTO conversations VALUES(\'chat\',\'org\'); INSERT INTO memberships VALUES(\'org\',1);');
 const db={prepare:s=>raw.prepare(s)};let clock=Date.parse('2026-09-18T10:00:00Z');const calls=[];
 const service=createCreationSchedules({db,now:()=>clock,company:async()=>({policy:{enabled:true,timeZone:'America/Sao_Paulo'}}),creations:{submit:async(...args)=>{calls.push(args);return {id:'creation-'+calls.length};}}});
 const input={format:'reels',prompt:'Criar Reels',duration:15,scheduledAt:'2026-09-18T08:00:00-03:00'};
 const once=await service.create('org',1,input,'chat');await service.tick();assert.equal(calls.length,0);
 clock=Date.parse(input.scheduledAt);await service.tick();await service.tick();assert.equal(calls.length,1);assert.equal((await service.list('org',1))[0].enabled,false);
 assert.deepEqual(await service.list('org',2),[]);await assert.rejects(service.update('org',2,once.id,'cancel'));
 const weekly=await service.create('org',1,{...input,repeat:'weekly',weekdays:[1,3,5],time:'09:00'},'chat','unique');
 assert.equal((await service.create('org',1,{...input,repeat:'weekly',weekdays:[1,3,5],time:'09:00'},'chat','unique')).id,weekly.id);
 await service.update('org',1,weekly.id,'pause');clock=weekly.nextAt;await service.tick();assert.equal(calls.length,1);
 const resumed=await service.update('org',1,weekly.id,'resume');clock=resumed.nextAt;await service.tick();assert.equal(calls.length,2);
 await service.update('org',1,weekly.id,'cancel');clock+=7*86400000;await service.tick();assert.equal(calls.length,2);
 const revoked=await service.create('org',1,{...input,repeat:'weekly',weekdays:[1],time:'09:00'},'chat');raw.exec('DELETE FROM memberships');clock=revoked.nextAt;await service.tick();assert.equal(calls.length,2);assert.equal((await service.list('org',1)).find(s=>s.id===revoked.id).enabled,false);raw.close();
});
