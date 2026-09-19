import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';
import {stripeCatalog} from '../portal/stripe-billing.mjs';
import {createBillingUI} from '../dist/assets/billing-ui.js';

async function fixture(t,{configured=true,env={}}={}){
 const calls=[],state={subscriptions:[],sessions:[],invoices:[],failCheckout:false,gate:null,extraPrices:{},coupon:{id:'launch_fixture',valid:true,duration:'once',percent_off:20,amount_off:null,livemode:false}};
 const price={id:'price_helpu',active:true,type:'recurring',billing_scheme:'per_unit',unit_amount:9900,currency:'brl',recurring:{interval:'month',interval_count:1,usage_type:'licensed'},product:{id:'prod_helpu',name:'Plano de teste',active:true}};
 const server=await createHelpuServer({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'helpu-stripe-')),portalOptions:{startScheduler:false,stripeEnv:configured?{STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:price.id,HELPU_PUBLIC_URL:'https://helpu.example',...env}:{},stripeFetch:async(url,options)=>{
  const u=new URL(url),route=u.pathname.replace('/v1/',''),body=new URLSearchParams(options.body);calls.push({route,method:options.method,body,headers:options.headers,query:u.searchParams});
  assert.equal(u.hostname,'api.stripe.com');assert.equal(options.headers.Authorization,'Bearer sk_test_fixture');
  if(route==='prices/price_helpu')return Response.json(price);
  if(route.startsWith('prices/')&&state.extraPrices[route.slice(7)])return Response.json(state.extraPrices[route.slice(7)]);
  if(route==='coupons/launch_fixture')return Response.json(state.coupon);
  if(route==='customers')return Response.json({id:'cus_fixture'});
  if(route==='subscriptions')return Response.json({data:state.subscriptions,has_more:false});
  if(route.startsWith('subscriptions/'))return Response.json(state.previousSubscription||{status:'active'});
  if(route==='invoices')return Response.json({data:state.invoices,has_more:false});
  if(route==='checkout/sessions'&&options.method==='GET')return Response.json({data:state.sessions.filter(s=>s.status==='open'),has_more:false});
  if(/^checkout\/sessions\/[^/]+\/line_items$/.test(route))return Response.json(state.sessions.find(s=>s.id===route.split('/')[2])?.lineItems||{data:[],has_more:false});
  if(route.startsWith('checkout/sessions/'))return Response.json(state.previousSession||state.sessions.find(s=>s.id===route.split('/').at(-1))||{status:'expired'});
  if(route==='checkout/sessions'){
   if(state.gate)await state.gate;
   if(state.failCheckout){state.failCheckout=false;throw new Error('network error containing sk_test_fixture');}
   const session={id:'cs_fixture_'+calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST').length,url:'https://checkout.stripe.com/c/pay/test_fixture',mode:body.get('mode'),client_reference_id:body.get('client_reference_id'),status:'open',payment_status:'unpaid',lineItems:{data:[{price:{id:body.get('line_items[0][price]')},quantity:Number(body.get('line_items[0][quantity]'))}],has_more:false},metadata:{helpu_offer:body.get('metadata[helpu_offer]'),helpu_launch_coupon:body.get('metadata[helpu_launch_coupon]')}};
   state.sessions.push(session);return Response.json(session);
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

const catalogFixture=JSON.stringify([{id:'plan',mode:'subscription',priceId:'price_helpu'},{id:'strategy',mode:'payment',priceId:'price_strategy'}]);
const servicePrice={id:'price_strategy',active:true,type:'one_time',billing_scheme:'per_unit',unit_amount:14900,currency:'brl',product:{id:'prod_strategy',name:'Sessão de estratégia',active:true}};

test('catálogo aceita somente ofertas e preços do servidor e falha fechado quando inválido',async t=>{
 assert.equal(stripeCatalog({STRIPE_PRICE_ID:'price_legacy'}).offers[0].priceId,'price_legacy');
 for(const value of ['{bad}',JSON.stringify([{id:'strategy',mode:'payment',priceId:'price_strategy'}]),JSON.stringify([{id:'plan',mode:'payment',priceId:'price_x'}]),JSON.stringify([{id:'plan',mode:'subscription',priceId:'price_x',amount:1}]),JSON.stringify([{id:'plan',mode:'subscription',priceId:'price_x'},{id:'plan',mode:'subscription',priceId:'price_y'}])])assert.equal(stripeCatalog({STRIPE_CATALOG_JSON:value}).offers.length,0);
 const f=await fixture(t,{env:{STRIPE_CATALOG_JSON:'{bad}'}});
 const state=(await f.bill()).data;assert.equal(state.canCheckout,false);assert.match(state.setupMessage,/catálogo/);assert.deepEqual(state.services,[]);
 assert.equal((await f.bill('/checkout',{offerId:'strategy',priceId:'price_injected'})).status,409);assert.equal(f.calls.length,0);
});

test('serviço avulso usa payment e preço permitido, deduplica tentativa e aguarda pagamento confirmado',async t=>{
 const f=await fixture(t,{env:{STRIPE_CATALOG_JSON:catalogFixture,STRIPE_LAUNCH_COUPON_ID:'launch_fixture'}});f.state.extraPrices.price_strategy=servicePrice;
 assert.equal((await f.bill('/checkout',{offerId:'not-allowed'})).status,409);assert.equal(f.calls.length,0);
 const state=(await f.bill()).data;assert.equal(state.services[0].price.amount,14900);assert.equal(state.services[0].canCheckout,true);
 const result=await f.bill('/checkout',{offerId:'strategy',mode:'subscription',priceId:'price_attacker',amount:1,coupon:'attacker'});assert.equal(result.status,200);
 const created=f.calls.find(c=>c.route==='checkout/sessions'&&c.method==='POST');assert.equal(created.body.get('mode'),'payment');assert.equal(created.body.get('line_items[0][price]'),'price_strategy');assert.equal(created.body.get('line_items[0][quantity]'),'1');assert.equal(created.body.get('discounts[0][coupon]'),null);assert.equal(created.body.get('invoice_creation[enabled]'),null);assert.equal(created.headers['Stripe-Version'],'2026-08-26.dahlia');
 assert.equal((await f.bill('/checkout',{offerId:'strategy'})).data.url,result.data.url);assert.equal(f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST').length,1);
 f.state.sessions[0].status='complete';assert.equal((await f.bill('/checkout',{offerId:'strategy'})).status,409);
 let updated=(await f.bill()).data;assert.equal(updated.services[0].paymentStatus,'pending');assert.equal(updated.services[0].canCheckout,false);assert.equal(updated.subscription,null);
 f.state.sessions[0].payment_status='paid';updated=(await f.bill()).data;assert.equal(updated.services[0].paymentStatus,'paid');assert.equal((await f.bill('/checkout',{offerId:'strategy'})).status,409);
 assert.equal((await f.bill('/checkout',{})).status,200);assert.equal(f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST')[1].body.get('mode'),'subscription');
});

test('cupom de lançamento vem do servidor e aplica só uma cobrança mensal a cliente novo',async t=>{
 const f=await fixture(t,{env:{STRIPE_LAUNCH_COUPON_ID:'launch_fixture'}});
 const state=(await f.bill()).data;assert.deepEqual(state.launchOffer,{firstAmount:7920,regularAmount:9900,currency:'brl',duration:'once'});assert.doesNotMatch(JSON.stringify(state),/launch_fixture|sk_test/);
 assert.equal((await f.bill('/checkout',{coupon:'malicious',percentOff:100})).status,200);
 let checkouts=f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST');assert.equal(checkouts[0].body.get('discounts[0][coupon]'),'launch_fixture');assert.equal(checkouts[0].body.get('allow_promotion_codes'),null);
 assert.equal((await f.bill('/checkout',{})).status,200);assert.equal(f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST').length,1);
 f.state.sessions=[];f.state.previousSession={status:'expired'};f.state.subscriptions=[{id:'sub_old',status:'canceled'}];
 assert.equal((await f.bill()).data.launchOffer,null);assert.equal((await f.bill('/checkout',{})).status,200);
 checkouts=f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST');assert.equal(checkouts[1].body.get('discounts[0][coupon]'),null);
});

test('cupom permanente, vencido, de outro produto ou moeda não inicia cobrança',async t=>{
 const f=await fixture(t,{env:{STRIPE_LAUNCH_COUPON_ID:'launch_fixture'}}),valid={...f.state.coupon};
 for(const change of [{duration:'forever'},{duration:'repeating'},{valid:false},{redeem_by:1},{applies_to:{products:['prod_other']}},{percent_off:null,amount_off:100,currency:'usd'},{percent_off:-5},{livemode:true}]){
  f.state.coupon={...valid,...change};assert.equal((await f.bill('/checkout',{})).status,409);assert.equal(f.calls.some(c=>c.route==='customers'),false);
 }
 f.state.coupon=valid;f.price.recurring.interval='year';assert.equal((await f.bill('/checkout',{})).status,409);assert.equal(f.calls.some(c=>c.route==='customers'),false);
});

test('avulso mantém tentativa idempotente se Stripe não devolver confirmação',async t=>{
 const f=await fixture(t,{env:{STRIPE_CATALOG_JSON:catalogFixture}});f.state.extraPrices.price_strategy=servicePrice;f.state.failCheckout=true;
 assert.equal((await f.bill('/checkout',{offerId:'strategy'})).status,502);assert.equal((await f.bill('/checkout',{offerId:'strategy'})).status,200);
 const calls=f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST');assert.equal(calls.length,2);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
});

test('interface mostra primeiro mês e avulsos sem afirmar pagamento ou liberar entrega',()=>{
 const esc=s=>String(s??'').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const ui=createBillingUI({esc,getState:()=>({company:{name:'Empresa',policy:{}}})});
 const data={status:'ready',mode:'test',canCheckout:true,invoices:[],price:{name:'Plano',amount:9900,currency:'brl',interval:'month',intervalCount:1},launchOffer:{firstAmount:7920,regularAmount:9900,currency:'brl'},services:[{id:'strategy',mode:'payment',price:{name:'<Estratégia>',amount:14900,currency:'brl'},canCheckout:true}]};
 let html=ui.plan(data);assert.match(html,/Primeiro mês/);assert.match(html,/79,20/);assert.match(html,/99,00/);assert.match(html,/data-offer-id="strategy"/);assert.match(html,/&lt;Estratégia&gt;/);assert.doesNotMatch(html,/<Estratégia>/);
 data.services[0].canCheckout=false;data.services[0].paymentStatus='pending';html=ui.plan(data);assert.match(html,/aguardando confirmação/);assert.doesNotMatch(html,/data-offer-id="strategy"/);
});


test('mudança do preço no catálogo bloqueia Checkout antigo mesmo após perda do registro local',async t=>{
 const f=await fixture(t,{env:{STRIPE_CATALOG_JSON:catalogFixture}});f.state.extraPrices.price_strategy=servicePrice;
 for(const [offerId,mode,oldPrice] of [['plan','subscription','price_previous_plan'],['strategy','payment','price_previous_strategy']])for(const hasLedger of [true,false]){
  // This open session belongs to the previous deployment/catalog. The current
  // app and UI use the new configured price, regardless of local ledger loss.
  const session={id:'cs_previous',status:'open',mode,client_reference_id:f.org,url:'https://checkout.stripe.com/c/pay/old_price',metadata:{helpu_offer:offerId},lineItems:{data:[{price:{id:oldPrice},quantity:1}],has_more:false}};
  f.state.sessions=[session];
  const saved={customerId:'cus_fixture',...(hasLedger?(mode==='subscription'?{checkoutId:session.id}:{services:{[offerId]:{checkoutId:session.id}}}):{})};
  const time=Date.now();await f.server.database.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'connection_validation',?,'billing:stripe:test',?,?) ON CONFLICT(org_id,kind,external_id) DO UPDATE SET data=excluded.data").run('billing_fixture',f.org,JSON.stringify(saved),time,time);
  const shown=(await f.bill()).data;assert.equal(shown.price.amount,9900);assert.equal(shown.services[0].price.amount,14900);
  const result=await f.bill('/checkout',{offerId});assert.equal(result.status,409);assert.match(result.data.error,/pagamento pendente mudaram/);assert.equal(result.data.url,undefined);
  assert.equal(f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST').length,0);
 }
});

test('retomada de Checkout exige exatamente um item completo com quantidade um',async t=>{
 const f=await fixture(t);assert.equal((await f.bill('/checkout',{})).status,200);const session=f.state.sessions[0],valid={price:{id:'price_helpu'},quantity:1};
 for(const items of [{data:[{...valid,quantity:2}],has_more:false},{data:[valid,valid],has_more:false},{data:[valid],has_more:true},{data:[],has_more:false}]){
  session.lineItems=items;assert.equal((await f.bill('/checkout',{})).status,409);
 }
 session.lineItems={data:[valid],has_more:false};assert.equal((await f.bill('/checkout',{})).status,200);
 assert.equal(f.calls.filter(c=>c.route==='checkout/sessions'&&c.method==='POST').length,1);
});
