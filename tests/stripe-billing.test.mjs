import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';
import {createBillingUI} from '../dist/assets/billing-ui.js';

async function fixture(t,{configured=true}={}){
 const calls=[],state={subscriptions:[],sessions:[],invoices:[],failCheckout:false,gate:null};
 const price={id:'price_helpu',active:true,type:'recurring',billing_scheme:'per_unit',unit_amount:9900,currency:'brl',recurring:{interval:'month',interval_count:1,usage_type:'licensed'},product:{name:'Plano de teste',active:true}};
 const server=await createHelpuServer({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'helpu-stripe-')),portalOptions:{startScheduler:false,stripeEnv:configured?{STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:price.id,HELPU_PUBLIC_URL:'https://helpu.example'}:{},stripeFetch:async(url,options)=>{
  const u=new URL(url),route=u.pathname.replace('/v1/',''),body=new URLSearchParams(options.body);calls.push({route,method:options.method,body,headers:options.headers,query:u.searchParams});
  assert.equal(u.hostname,'api.stripe.com');assert.equal(options.headers.Authorization,'Bearer sk_test_fixture');
  if(route==='prices/price_helpu')return Response.json(price);
  if(route==='customers')return Response.json({id:'cus_fixture'});
  if(route==='subscriptions')return Response.json({data:state.subscriptions,has_more:false});
  if(route.startsWith('subscriptions/'))return Response.json(state.previousSubscription||{status:'active'});
  if(route==='invoices')return Response.json({data:state.invoices,has_more:false});
  if(route==='checkout/sessions'&&options.method==='GET')return Response.json({data:state.sessions,has_more:false});
  if(route.startsWith('checkout/sessions/'))return Response.json(state.previousSession||{status:'expired'});
  if(route==='checkout/sessions'){
   if(state.gate)await state.gate;
   if(state.failCheckout){state.failCheckout=false;throw new Error('network error containing sk_test_fixture');}
   const session={id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/test_fixture',mode:'subscription',client_reference_id:body.get('client_reference_id'),status:'open'};
   state.sessions=[session];return Response.json(session);
  }
  if(route==='billing_portal/sessions')return Response.json({url:'https://billing.stripe.com/p/session/test_fixture'});
  throw new Error('Unexpected mock route '+route);
 }}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=async(route,body,cookie='',sentOrigin=origin)=>{const res=await fetch(origin+route,{method:body?'POST':'GET',headers:{Origin:sentOrigin,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'manual'});return {status:res.status,headers:res.headers,data:await res.json()};};
 const a=await request('/api/auth/signup',{name:'Teste',company:'Empresa teste',email:'stripe@example.test',password:'test-only-password'}),cookie=a.headers.get('set-cookie').split(';')[0];
 const org=(await request('/api/portal/bootstrap',null,cookie)).data.companies[0].id;
 t.after(async()=>{await server.portal.shutdown();await new Promise(r=>server.close(r));});
 return {server,request,cookie,org,calls,state,price,bill:(tail='',body,c=cookie,site=origin)=>request('/api/portal/'+org+'/billing'+tail,body,c,site)};
}

test('Stripe sem configuração não inventa assinatura nem inicia pagamentos',async t=>{
 const f=await fixture(t,{configured:false});const result=await f.bill();assert.equal(result.data.status,'not_configured');assert.deepEqual(result.data.invoices,[]);
 assert.equal((await f.bill('/checkout',{})).status,409);assert.equal(f.calls.length,0);
});

test('Stripe usa preço do servidor, reutiliza pagamento e mostra assinatura/faturas reais',async t=>{
 const f=await fixture(t);
 assert.equal((await f.bill()).data.price.amount,9900);
 const checkout=await f.bill('/checkout',{priceId:'price_attacker',success_url:'https://evil.example',customer:'cus_other'});assert.equal(checkout.status,200);assert.match(checkout.data.url,/^https:\/\/checkout.stripe.com\//);
 const created=f.calls.find(c=>c.route==='checkout/sessions'&&c.method==='POST');assert.equal(created.body.get('line_items[0][price]'),'price_helpu');assert.equal(created.body.get('customer'),'cus_fixture');assert.ok(created.body.get('success_url').startsWith('https://helpu.example/retorno.html?'));assert.equal(created.body.get('client_reference_id'),f.org);
 assert.equal((await f.bill('/checkout',{})).data.url,checkout.data.url);assert.equal(f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST').length,1);
 f.state.subscriptions=[{id:'sub_fixture',status:'active',items:{data:[{price:f.price,current_period_end:1800000000}]}}];f.state.invoices=[{number:'TEST-0001',status:'paid',amount_paid:9900,amount_due:0,currency:'brl',created:1700000000,hosted_invoice_url:'https://invoice.stripe.com/i/test_fixture'}];
 const billed=(await f.bill()).data;assert.equal(billed.subscription.status,'active');assert.equal(billed.invoices[0].amount,9900);assert.equal(billed.canCheckout,false);assert.equal(billed.canPortal,true);assert.doesNotMatch(JSON.stringify(billed),/sk_test|cus_fixture|sub_fixture/);
 assert.match((await f.bill('/checkout',{})).data.url,/billing.stripe.com/);assert.equal(f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST').length,1);
 // A stale complete checkout may be replaced only after its subscription is terminal.
 f.state.subscriptions=[];f.state.sessions=[];f.state.previousSession={status:'complete',subscription:'sub_fixture'};
 assert.equal((await f.bill('/checkout',{})).status,409);
 f.state.previousSubscription={status:'canceled'};assert.equal((await f.bill('/checkout',{})).status,200);
 assert.notEqual(f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST')[1].headers['Idempotency-Key'],created.headers['Idempotency-Key']);
});

test('Stripe exige dono, sessão e origem; nenhuma empresa acessa cobrança de outra',async t=>{
 const f=await fixture(t);
 assert.equal((await f.bill('',undefined,'')).status,401);
 assert.equal((await f.bill('/checkout',{},f.cookie,'https://evil.example')).status,403);
 const signup=await f.request('/api/auth/signup',{name:'Outra pessoa',company:'Outra empresa',email:'other-stripe@example.test',password:'test-only-password'}),other=signup.headers.get('set-cookie').split(';')[0];
 assert.equal((await f.bill('',undefined,other)).status,404);assert.equal((await f.bill('/checkout',{},other)).status,404);
 await f.server.database.prepare("UPDATE memberships SET role='member' WHERE org_id=?").run(f.org);
 assert.equal((await f.bill()).data.status,'restricted');assert.equal((await f.bill('/checkout',{})).status,403);assert.equal(f.calls.length,0);
});

test('Stripe mantém idempotência após falha e bloqueia solicitações concorrentes',async t=>{
 const f=await fixture(t);f.state.failCheckout=true;
 const failed=await f.bill('/checkout',{});assert.equal(failed.status,502);assert.doesNotMatch(JSON.stringify(failed.data),/sk_test_fixture/);
 let release;f.state.gate=new Promise(r=>{release=r;});
 const pending=f.bill('/checkout',{});
 await new Promise((resolve,reject)=>{const deadline=Date.now()+5000;function poll(){if(f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST').length===2)return resolve();if(Date.now()>deadline)return reject(new Error('Checkout did not start'));setTimeout(poll,10);}poll();});
 try{assert.equal((await f.bill('/checkout',{})).status,409);}finally{release();}
 assert.equal((await pending).status,200);
 const calls=f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST');assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.equal(f.calls.filter(c=>c.route==='customers').length,1);
});

test('telas Stripe exibem valores e estados em português e escapam dados externos',()=>{
 const esc=s=>String(s??'').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const ui=createBillingUI({esc,getState:()=>({company:{name:'Empresa',policy:{}}})});
 assert.match(ui.plan({status:'not_configured'}),/Pagamentos pelo Stripe/);assert.doesNotMatch(ui.plan({status:'not_configured'}),/Assinar pelo Stripe/);
 const data={status:'ready',mode:'test',canCheckout:true,price:{name:'<script>unsafe</script>',amount:9900,currency:'brl',interval:'month',intervalCount:1},invoices:[]};
 const html=ui.plan(data);assert.match(html,/99,00/);assert.match(html,/mês/);assert.match(html,/Ambiente de teste/);assert.doesNotMatch(html,/<script>/);
 assert.match(ui.invoices(data),/Nenhuma fatura disponível/);
});
