import {randomUUID} from 'node:crypto';
import {verifyStripeEvent} from './stripe-signature.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const terminal=new Set(['canceled','incomplete_expired']);
const offerKinds={plan:'subscription',strategy:'payment','market-research':'payment','brand-identity':'payment'};
function originFrom(env){try{const u=new URL(env.HELPU_PUBLIC_URL);if(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash)return u.origin;}catch{}return null;}
function stripeUrl(value,hosts){try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&hosts.includes(u.hostname))return u.href;}catch{}return null;}
export function stripeCatalog(env={}){
  if(!env.STRIPE_CATALOG_JSON)return /^price_\w+$/.test(env.STRIPE_PRICE_ID||'')?{offers:[{id:'plan',mode:'subscription',priceId:env.STRIPE_PRICE_ID}],legacy:true}:{offers:[],legacy:true};
  try{
    const offers=JSON.parse(env.STRIPE_CATALOG_JSON);
    if(!Array.isArray(offers)||offers.length<1||offers.length>4||offers.filter(o=>o?.id==='plan').length!==1||new Set(offers.map(o=>o?.id)).size!==offers.length)throw new Error();
    for(const offer of offers)if(!offer||typeof offer!=='object'||Array.isArray(offer)||Object.keys(offer).some(k=>!['id','mode','priceId'].includes(k))||!Object.hasOwn(offerKinds,offer.id)||offer.mode!==offerKinds[offer.id]||!/^price_\w+$/.test(offer.priceId||''))throw new Error();
    if(new Set(offers.map(o=>o.priceId)).size!==offers.length)throw new Error();
    return {offers,legacy:false};
  }catch{return {offers:[],error:'O catálogo de contratação ainda não está configurado corretamente.'};}
}

export function createStripeBilling({db,metadata,saveMetadata,company,env=process.env,fetcher=fetch,now=Date.now}){
  const origin=originFrom(env),key=env.STRIPE_SECRET_KEY,catalog=stripeCatalog(env),offers=catalog.offers,main=offers.find(o=>o.id==='plan');
  const connected=!!(origin&&/^sk_(test|live)_/.test(key||'')),ready=!!(connected&&main);
  const mode=key?.startsWith('sk_live_')?'live':'test',storageKey='billing:stripe:'+mode;
  async function request(route,method='GET',params={},idempotency){
    if(!connected)fail('O Stripe ainda não foi configurado na hospedagem.',409);
    const form=new URLSearchParams(params),headers={Authorization:'Bearer '+key,'Stripe-Version':'2026-08-26.dahlia'};
    let url='https://api.stripe.com/v1/'+route,body;
    if(method==='GET'){if(form.size)url+='?'+form;}
    else {headers['Content-Type']='application/x-www-form-urlencoded';body=form;if(idempotency)headers['Idempotency-Key']=idempotency;}
    let response,data;
    try{response=await fetcher(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(15000)});data=await response.json();}
    catch{fail('Não foi possível consultar o Stripe. Tente novamente em instantes.',502);}
    if(!response.ok||data.error)fail('O Stripe não concluiu a solicitação. Confira a configuração de pagamentos e tente novamente.',502);
    return data;
  }
  async function owner(org,user){const member=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);if(member?.role!=='owner')fail('Somente o responsável pela empresa pode acessar o faturamento.',403);}
  async function subscriptions(customer){
    if(!customer)return [];
    const result=await request('subscriptions','GET',{customer,status:'all',limit:'100'});
    if(result.has_more)fail('Há muitas assinaturas nesta conta. Confira o cadastro no Stripe antes de continuar.',409);
    return result.data;
  }
  function priceView(price){
    if(!price||!Number.isSafeInteger(price.unit_amount)||price.unit_amount<1||!price.currency)return null;
    return {name:typeof price.product==='object'&&!price.product.deleted?price.product.name:'Plano Helpu',amount:price.unit_amount,currency:price.currency,interval:price.recurring?.interval,intervalCount:price.recurring?.interval_count||1};
  }
  async function offeredPrice(offer){
    if(!offer)return null;
    const price=await request('prices/'+offer.priceId,'GET',{'expand[]':'product'});
    const recurring=offer.mode==='subscription';
    if(!price.active||price.type!==(recurring?'recurring':'one_time')||price.billing_scheme!=='per_unit'||!priceView(price)||price.product?.deleted||price.product?.active===false||recurring&&price.recurring?.usage_type!=='licensed'||recurring&&!catalog.legacy&&(price.recurring?.interval!=='month'||price.recurring?.interval_count!==1))fail('Configure no Stripe um preço ativo e fixo compatível com esta contratação.',409);
    return price;
  }
  async function launchCoupon(price,history){
    const id=env.STRIPE_LAUNCH_COUPON_ID;
    if(!id||history.some(s=>s.status!=='incomplete_expired'))return null;
    if(!/^[a-zA-Z0-9_-]{1,200}$/.test(id)||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1)fail('O desconto de lançamento exige um cupom válido e assinatura mensal.',409);
    const coupon=await request('coupons/'+encodeURIComponent(id),'GET',{'expand[]':'applies_to'});
    const product=typeof price.product==='object'?price.product.id:price.product,scope=coupon.applies_to?.products;
    if(coupon.id!==id||coupon.valid!==true||coupon.duration!=='once'||coupon.livemode!==undefined&&coupon.livemode!==(mode==='live')||coupon.redeem_by&&coupon.redeem_by<=now()/1000||scope&&!scope.includes(product))fail('O desconto de lançamento não está disponível. Confira o cupom de primeira cobrança no Stripe.',409);
    const percent=coupon.percent_off,amount=coupon.amount_off,percentage=typeof percent==='number'&&Number.isFinite(percent)&&percent>0&&percent<=100,fixed=Number.isSafeInteger(amount)&&amount>0&&coupon.currency===price.currency;
    if(!(percentage&&amount==null||fixed&&percent==null))fail('O desconto de lançamento não é compatível com a moeda e o preço do plano.',409);
    return {id,firstAmount:Math.max(0,price.unit_amount-(typeof percent==='number'?Math.round(price.unit_amount*percent/100):amount)),regularAmount:price.unit_amount,currency:price.currency,duration:'once'};
  }
  const promotionView=coupon=>coupon?{firstAmount:coupon.firstAmount,regularAmount:coupon.regularAmount,currency:coupon.currency,duration:'once'}:null;
  async function state(org,user){
    const member=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);
    if(member?.role!=='owner')return {provider:'stripe',status:'restricted',canManage:false,invoices:[]};
    if(!connected)return {provider:'stripe',status:'not_configured',canManage:true,invoices:[]};
    const saved=await metadata(org,storageKey);
    const [prices,history,invoices]=await Promise.all([Promise.all(offers.map(offeredPrice)),subscriptions(saved.customerId),saved.customerId?request('invoices','GET',{customer:saved.customerId,limit:'12'}):{data:[],has_more:false}]);
    const sub=history.find(s=>!terminal.has(s.status))||null,price=prices[offers.indexOf(main)]||null,coupon=price&&!sub?await launchCoupon(price,history):null;
    const services=[];
    for(let i=0;i<offers.length;i++)if(offers[i].mode==='payment'){
      const offer=offers[i],previous=saved.services?.[offer.id]?.checkoutId?await request('checkout/sessions/'+encodeURIComponent(saved.services[offer.id].checkoutId)):null;
      const completed=previous?.status==='complete';
      services.push({id:offer.id,mode:'payment',price:priceView(prices[i]),canCheckout:!completed,paymentStatus:completed?(previous.payment_status==='paid'?'paid':'pending'):null});
    }
    return {provider:'stripe',status:'ready',mode,canManage:true,canCheckout:ready&&!sub,canPortal:!!saved.customerId,setupMessage:catalog.error||(!main?'O preço do plano ainda não está disponível.':null),services,launchOffer:promotionView(coupon),
      price:priceView(price),subscription:sub?{status:sub.status,cancelAtPeriodEnd:!!sub.cancel_at_period_end,renewsAt:sub.items?.data?.[0]?.current_period_end||sub.current_period_end||null,price:priceView(sub.items?.data?.[0]?.price)}:null,
      invoices:invoices.data.map(i=>({number:i.number,status:i.status,created:i.created,amount:i.status==='paid'?i.amount_paid:i.amount_due,currency:i.currency,url:stripeUrl(i.hosted_invoice_url,['invoice.stripe.com'])})),hasMoreInvoices:!!invoices.has_more};
  }
  async function locked(org,fn){
    const id=randomUUID(),time=now();
    await db.prepare("DELETE FROM records WHERE org_id=? AND kind='billing_lock' AND updated_at<?").run(org,time-180000);
    const row=await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'billing_lock','{}','stripe',?,?) ON CONFLICT(org_id,kind,external_id) DO NOTHING RETURNING id").get(id,org,time,time);
    if(!row)fail('Já existe uma solicitação de pagamento em andamento. Aguarde alguns instantes.',409);
    try{return await fn();}finally{await db.prepare("DELETE FROM records WHERE id=? AND kind='billing_lock'").run(id);}
  }
  const returnUrl=org=>origin+'/retorno.html?company='+encodeURIComponent(org)+'&billing=return';
  async function portal(org,saved){
    if(!saved.customerId)fail('Ainda não há um cadastro de cobrança para esta empresa.',409);
    const result=await request('billing_portal/sessions','POST',{customer:saved.customerId,return_url:returnUrl(org)});
    const url=stripeUrl(result.url,['billing.stripe.com']);if(!url)fail('O Stripe não retornou um endereço de faturamento válido.',502);return {url};
  }
  async function action(org,user,kind,input={}){
    await owner(org,user);
    if(!['checkout','portal'].includes(kind))fail('Recurso não encontrado.',404);
    if(!connected)fail('O Stripe ainda não foi configurado na hospedagem.',409);
    const offer=kind==='checkout'?offers.find(o=>o.id===(input?.offerId||'plan')):null;
    if(kind==='checkout'&&!offer)fail(catalog.error||'Esta contratação ainda não está disponível.',409);
    return locked(org,async()=>{
      let saved=await metadata(org,storageKey);
      if(kind==='portal')return portal(org,saved);
      const price=await offeredPrice(offer),history=await subscriptions(saved.customerId),recurring=offer.mode==='subscription';
      if(recurring&&history.some(s=>!terminal.has(s.status)))return portal(org,saved);
      const coupon=recurring?await launchCoupon(price,history):null;
      if(!saved.customerId){
        const c=await company(org),customer=await request('customers','POST',{name:c.name,'metadata[helpu_company]':org},'helpu-customer:'+org);
        if(!/^cus_\w+$/.test(customer.id||''))fail('O Stripe não retornou um cadastro válido.',502);
        saved={...saved,customerId:customer.id};await saveMetadata(org,storageKey,saved);
      }
      // The subscription keeps its legacy metadata location; each service has
      // an independent durable attempt, so retries cannot charge a second item.
      if(!recurring)saved.services||={};
      const ledger=recurring?saved:(saved.services[offer.id]||={});
      const persist=()=>saveMetadata(org,storageKey,saved);
      const open=await request('checkout/sessions','GET',{customer:saved.customerId,status:'open',limit:'100'});
      if(open.has_more)fail('Confira os pagamentos pendentes no Stripe antes de continuar.',409);
      const existing=open.data.find(s=>s.mode===offer.mode&&s.client_reference_id===org&&(recurring||s.metadata?.helpu_offer===offer.id));
      if(existing){
        // A pending Checkout can outlive a catalog deployment or a lost local
        // attempt record. Never resume it using only its offer metadata.
        const items=await request('checkout/sessions/'+encodeURIComponent(existing.id)+'/line_items','GET',{limit:'100'});
        const item=items.data?.[0],itemPrice=typeof item?.price==='string'?item.price:item?.price?.id;
        if(items.has_more!==false||!Array.isArray(items.data)||items.data.length!==1||itemPrice!==offer.priceId||item.quantity!==1)fail('O preço ou os itens do pagamento pendente mudaram. Confira e encerre a tentativa anterior no Stripe antes de continuar.',409);
        if((coupon?.id||null)!==(existing.metadata?.helpu_launch_coupon||null))fail('Existe um pagamento anterior com outra condição. Confira essa tentativa no Stripe antes de continuar.',409);
        const url=stripeUrl(existing.url,['checkout.stripe.com']);if(!url)fail('Não foi possível retomar o pagamento pendente.',409);
        ledger.checkoutId=existing.id;await persist();return {url};
      }
      if(ledger.checkoutId){
        const previous=await request('checkout/sessions/'+encodeURIComponent(ledger.checkoutId));let ended=false;
        if(recurring&&previous.status==='complete'&&typeof previous.subscription==='string')ended=terminal.has((await request('subscriptions/'+encodeURIComponent(previous.subscription))).status);
        if(previous.status==='complete'&&!ended)fail(recurring?'Seu pagamento está sendo confirmado pelo Stripe. Atualize o plano em instantes.':previous.payment_status==='paid'?'Este serviço já foi pago. Acompanhe a entrega com a equipe Helpu.':'O pagamento deste serviço ainda aguarda confirmação. Não é necessário pagar novamente.',409);
        if(previous.status!=='expired'&&!ended)fail('Existe um pagamento em processamento. Tente novamente em instantes.',409);
        delete ledger.attempt;delete ledger.checkoutId;
      }
      if(ledger.attempt&&now()-ledger.attempt.createdAt>23*3600000)fail('Há uma tentativa de pagamento sem confirmação. Confira no Stripe antes de abrir outra.',409);
      if(ledger.attempt&&(ledger.attempt.price!==offer.priceId||(ledger.attempt.couponId||null)!==(coupon?.id||null)))fail('A condição mudou durante o pagamento. Confira a tentativa anterior no Stripe.',409);
      if(!ledger.attempt)ledger.attempt={id:randomUUID(),createdAt:now(),price:offer.priceId,couponId:coupon?.id||null};
      await persist();
      const params={mode:offer.mode,customer:saved.customerId,client_reference_id:org,'line_items[0][price]':ledger.attempt.price,'line_items[0][quantity]':'1',success_url:returnUrl(org),cancel_url:returnUrl(org),'metadata[helpu_company]':org,'metadata[helpu_offer]':offer.id,locale:'pt-BR'};
      if(recurring)params['subscription_data[metadata][helpu_company]']=org;
      else {params['payment_intent_data[metadata][helpu_company]']=org;params['payment_intent_data[metadata][helpu_offer]']=offer.id;}
      if(coupon){params['discounts[0][coupon]']=coupon.id;params['metadata[helpu_launch_coupon]']=coupon.id;}
      const result=await request('checkout/sessions','POST',params,'helpu-checkout:'+ledger.attempt.id);
      if(!/^cs_\w+$/.test(result.id||''))fail('O Stripe não retornou um pagamento válido.',502);
      ledger.checkoutId=result.id;await persist();
      const url=stripeUrl(result.url,['checkout.stripe.com']);if(!url)fail('O Stripe não retornou um endereço de pagamento válido.',502);return {url};
    });
  }
  async function financialEvent(bytes,signature){
    const event=verifyStripeEvent(bytes,signature,env.STRIPE_WEBHOOK_SECRET,now());
    if(event.livemode!==(mode==='live'))fail('Modo Stripe incompatível.',400);
    const invoice=event.type==='invoice.paid',checkout=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type);
    if(!invoice&&!checkout)return null;
    const id=event.data.object.id;if(!(invoice?/^in_\w+$/:/^cs_\w+$/).test(id||''))fail('Objeto Stripe inválido.');
    const object=await request((invoice?'invoices/':'checkout/sessions/')+id);
    if(object.id!==id||object.livemode!==event.livemode||object.currency!=='brl')return null;
    if(invoice?object.status!=='paid':object.payment_status!=='paid'||object.mode!=='payment'||object.invoice)return null;
    const customerId=typeof object.customer==='string'?object.customer:object.customer?.id;
    if(!/^cus_\w+$/.test(customerId||''))return null;
    const customer=await request('customers/'+customerId),org=customer.metadata?.helpu_company;
    if(!org||!await db.prepare('SELECT id FROM companies WHERE id=?').get(org))return null;
    if((await metadata(org,storageKey)).customerId!==customerId)return null;
    const amountCents=invoice?object.amount_paid:object.amount_total;
    if(!Number.isSafeInteger(amountCents)||amountCents<1)return null;
    const timestamp=(invoice?object.status_transitions?.paid_at:event.created)||event.created;
    if(!Number.isFinite(timestamp))fail('Data Stripe inválida.',502);
    return {orgId:org,mode,objectId:id,eventId:event.id,amountCents,paidAt:timestamp*1000,dueAt:(invoice&&Number.isFinite(object.due_date)?object.due_date:timestamp)*1000,periodAt:(invoice&&Number.isFinite(object.period_start)?object.period_start:timestamp)*1000,description:invoice?'Fatura Stripe '+(object.number||id):'Pagamento Stripe '+id,reference:id};
  }
  return {state,action,financialEvent};
}
