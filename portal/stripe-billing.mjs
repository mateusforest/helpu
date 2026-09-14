import {randomUUID} from 'node:crypto';

const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const terminal=new Set(['canceled','incomplete_expired']);
function originFrom(env){try{const u=new URL(env.HELPU_PUBLIC_URL);if(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash)return u.origin;}catch{}return null;}
function stripeUrl(value,hosts){try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&hosts.includes(u.hostname))return u.href;}catch{}return null;}
export function createStripeBilling({db,metadata,saveMetadata,company,env=process.env,fetcher=fetch,now=Date.now}){
  const origin=originFrom(env),key=env.STRIPE_SECRET_KEY,priceId=env.STRIPE_PRICE_ID;
  const connected=!!(origin&&/^sk_(test|live)_/.test(key||'')),ready=!!(connected&&/^price_[\w]+$/.test(priceId||''));
  const mode=key?.startsWith('sk_live_')?'live':'test',storageKey='billing:stripe:'+mode;
  async function request(route,method='GET',params={},idempotency){
    if(!connected)fail('O Stripe ainda não foi configurado na hospedagem.',409);
    const form=new URLSearchParams(params),headers={Authorization:'Bearer '+key};
    let url='https://api.stripe.com/v1/'+route,body;
    if(method==='GET'){if(form.size)url+='?'+form;}
    else {headers['Content-Type']='application/x-www-form-urlencoded';body=form;if(idempotency)headers['Idempotency-Key']=idempotency;}
    let response,data;
    try{response=await fetcher(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(15000)});data=await response.json();}
    catch{fail('Não foi possível consultar o Stripe. Tente novamente em instantes.',502);}
    if(!response.ok||data.error)fail('O Stripe não concluiu a solicitação. Confira a configuração de pagamentos e tente novamente.',502);
    return data;
  }
  async function owner(org,user){
    const member=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);
    if(member?.role!=='owner')fail('Somente o responsável pela empresa pode acessar o faturamento.',403);
  }
  async function subscription(customer){
    const result=await request('subscriptions','GET',{customer,status:'all',limit:'100'});
    if(result.has_more)fail('Há muitas assinaturas nesta conta. Confira o cadastro no Stripe antes de continuar.',409);
    return result.data.find(s=>!terminal.has(s.status))||null;
  }
  function priceView(price){
    if(!price||!Number.isSafeInteger(price.unit_amount)||!price.currency)return null;
    return {name:typeof price.product==='object'&&!price.product.deleted?price.product.name:'Plano Helpu',amount:price.unit_amount,currency:price.currency,interval:price.recurring?.interval,intervalCount:price.recurring?.interval_count||1};
  }
  async function offeredPrice(){
    if(!ready)return null;
    const price=await request('prices/'+priceId,'GET',{'expand[]':'product'});
    if(!price.active||price.type!=='recurring'||price.billing_scheme!=='per_unit'||price.recurring?.usage_type!=='licensed'||!priceView(price)||price.product?.deleted||price.product?.active===false)fail('Configure no Stripe um preço recorrente ativo e fixo para o plano Helpu.',409);
    return price;
  }
  async function state(org,user){
    const member=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);
    if(member?.role!=='owner')return {provider:'stripe',status:'restricted',canManage:false,invoices:[]};
    if(!connected)return {provider:'stripe',status:'not_configured',canManage:true,invoices:[]};
    const saved=await metadata(org,storageKey);
    const [price,sub,invoices]=await Promise.all([
      offeredPrice(),saved.customerId?subscription(saved.customerId):null,
      saved.customerId?request('invoices','GET',{customer:saved.customerId,limit:'12'}):{data:[],has_more:false},
    ]);
    return {provider:'stripe',status:'ready',mode,canManage:true,canCheckout:ready&&!sub,canPortal:!!saved.customerId,
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
  async function action(org,user,kind){
    await owner(org,user);
    if(!['checkout','portal'].includes(kind))fail('Recurso não encontrado.',404);
    if(!connected)fail('O Stripe ainda não foi configurado na hospedagem.',409);
    return locked(org,async()=>{
      let saved=await metadata(org,storageKey);
      if(kind==='portal')return portal(org,saved);
      if(!ready)fail('O preço do plano ainda não foi configurado no Stripe.',409);
      await offeredPrice();
      if(!saved.customerId){
        const c=await company(org);
        // Stable key allows safe recovery if the customer was created before a network failure.
        const customer=await request('customers','POST',{name:c.name,'metadata[helpu_company]':org},'helpu-customer:'+org);
        if(!/^cus_\w+$/.test(customer.id||''))fail('O Stripe não retornou um cadastro válido.',502);
        saved={customerId:customer.id};await saveMetadata(org,storageKey,saved);
      }
      if(await subscription(saved.customerId))return portal(org,saved);
      const open=await request('checkout/sessions','GET',{customer:saved.customerId,status:'open',limit:'100'});
      if(open.has_more)fail('Confira os pagamentos pendentes no Stripe antes de continuar.',409);
      const existing=open.data.find(s=>s.mode==='subscription'&&s.client_reference_id===org);
      if(existing){const url=stripeUrl(existing.url,['checkout.stripe.com']);if(url){saved.checkoutId=existing.id;await saveMetadata(org,storageKey,saved);return {url};}fail('Não foi possível retomar o pagamento pendente.',409);}
      if(saved.checkoutId){
        const previous=await request('checkout/sessions/'+encodeURIComponent(saved.checkoutId));
        let ended=false;
        if(previous.status==='complete'&&typeof previous.subscription==='string')ended=terminal.has((await request('subscriptions/'+encodeURIComponent(previous.subscription))).status);
        if(previous.status==='complete'&&!ended)fail('Seu pagamento está sendo confirmado pelo Stripe. Atualize o plano em instantes.',409);
        if(previous.status!=='expired'&&!ended)fail('Existe um pagamento em processamento. Tente novamente em instantes.',409);
        delete saved.attempt;delete saved.checkoutId;
      }
      // Persist the exact attempt before calling Stripe; retries reuse its idempotency key.
      if(saved.attempt&&now()-saved.attempt.createdAt>23*3600000)fail('Há uma tentativa de pagamento sem confirmação. Confira no Stripe antes de abrir outra.',409);
      if(saved.attempt&&saved.attempt.price!==priceId)fail('O plano mudou durante o pagamento. Confira a tentativa anterior no Stripe.',409);
      if(!saved.attempt)saved.attempt={id:randomUUID(),createdAt:now(),price:priceId};
      await saveMetadata(org,storageKey,saved);
      const result=await request('checkout/sessions','POST',{
        mode:'subscription',customer:saved.customerId,client_reference_id:org,'line_items[0][price]':saved.attempt.price,'line_items[0][quantity]':'1',
        success_url:returnUrl(org),cancel_url:returnUrl(org),'metadata[helpu_company]':org,'subscription_data[metadata][helpu_company]':org,
      },'helpu-checkout:'+saved.attempt.id);
      if(!/^cs_\w+$/.test(result.id||''))fail('O Stripe não retornou um pagamento válido.',502);
      saved.checkoutId=result.id;await saveMetadata(org,storageKey,saved);
      const url=stripeUrl(result.url,['checkout.stripe.com']);if(!url)fail('O Stripe não retornou um endereço de pagamento válido.',502);return {url};
    });
  }
  return {state,action};
}
