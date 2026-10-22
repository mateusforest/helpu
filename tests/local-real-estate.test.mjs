import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createHelpuServer} from '../server.mjs';

test('imobiliária: cadastro, aprovação, visita e anúncios de imóveis',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-real-estate-'));
 const server=await createHelpuServer({dataDir:dir,portalOptions:{startScheduler:false,localEmailEnv:{},operatorEnv:{HELPU_OPERATOR_USER_IDS:'1'},whatsappChatEnv:{},openaiEnv:{}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 async function req(url,data,cookie='',status=200){const response=await fetch(origin+url,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data?JSON.stringify(data):undefined});const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return {data:body,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 const password='Real-estate-test-only',itemId=randomUUID();let admin,owner,business;
 try{
  admin=(await req('/api/auth/signup',{name:'Equipe',email:'admin@estate.test',password},'',201)).cookie;
  owner=(await req('/api/local/customer/register',{name:'Imobiliária de teste',email:'owner@estate.test',password,phone:'54999998888',sector:'Imobiliárias',sellerType:'Loja'})).cookie;
  await t.test('página comercial aceita o segmento e só aparece depois da aprovação',async()=>{
   business=(await req('/api/local/customer/me',null,owner)).data.business;assert.equal(business.sector,'Imobiliárias');
   await req('/api/local/customer/profile',{version:business.version,name:business.name,sector:'Imobiliárias',description:'Imobiliária fictícia para testes de compra e venda de imóveis.',address:'Vacaria',hours:'Segunda a sexta',offer:'Atendimento imobiliário',publicPhone:'54999998888',photos:[],catalog:[{id:itemId,name:'Casa de teste',description:'Casa fictícia para testes.',brand:'Casa',priceCents:45000000,available:true}],publish:true},owner);
   assert.equal((await req('/api/local/businesses')).data.businesses.length,0);
   business=(await req('/api/local/customer/me',null,owner)).data.business;
   await req('/api/portal/local-admin',{action:'moderate',id:business.id,version:business.version,state:'Publicado'},admin);
   const list=(await req('/api/local/businesses')).data.businesses;assert.equal(list[0].sector,'Imobiliárias');assert.equal(list[0].catalog[0].brand,'Casa');
  });
  await t.test('visita registra interesse no imóvel com data, sem confirmar agendamento automaticamente',async()=>{
   const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
   await req('/api/local/lead',{businessId:business.id,type:'visita',itemId,date,time:'14:00',name:'Interessado de teste',phone:'54999997777',message:'Gostaria de conhecer o imóvel.',consent:true,requestKey:randomUUID()});
   const leads=(await req('/api/local/customer/me',null,owner)).data.leads;assert.equal(leads.length,1);assert.equal(leads[0].state,'Novo');assert.match(leads[0].message,/Tipo de imóvel: Casa/);assert.match(leads[0].message,/Data desejada:/);
  });
  await t.test('categoria Imóveis funciona no anúncio, na revisão e na vitrine',async()=>{
   const input={title:'Casa em Vacaria',description:'Casa fictícia para verificar categoria e moderação de imóveis.',category:'Imóveis',condition:'Usado',priceCents:45000000,city:'Vacaria, RS',phone:'54999998888',photos:[],submit:true};
   const p=(await req('/api/local/customer/products',input,owner)).data;assert.equal(p.category,'Imóveis');assert.equal(p.state,'Em análise');
   assert.equal((await req('/api/local/products')).data.products.length,0);
   await req('/api/portal/local-products',{id:p.id,version:p.version,state:'Publicado'},owner,401);
   const approved=(await req('/api/portal/local-products',{id:p.id,version:p.version,state:'Publicado'},admin)).data;
   assert.equal((await req('/api/local/products')).data.products[0].category,'Imóveis');
   await req('/api/local/customer/product-state',{id:p.id,version:approved.version,state:'Pausado'},owner);assert.equal((await req('/api/local/products')).data.products.length,0);
  });
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
