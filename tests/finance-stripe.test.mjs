import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyStripeEvent} from '../portal/stripe-signature.mjs';
import {createStripeBilling} from '../portal/stripe-billing.mjs';
const now=1800532800000,secret='whsec_fixture';
const bytes=(type='checkout.session.completed')=>Buffer.from(JSON.stringify({id:'evt_fixture',type,livemode:false,created:now/1000,data:{object:{id:type==='invoice.paid'?'in_fixture':'cs_fixture'}}}));
const signature=b=>'t='+now/1000+',v1='+createHmac('sha256',secret).update(now/1000+'.').update(b).digest('hex');
test('Stripe valida corpo original, assinatura, tolerância e origem sem Connect',()=>{
 const b=bytes();assert.equal(verifyStripeEvent(b,signature(b),secret,now).id,'evt_fixture');
 for(const [payload,header,time] of [[Buffer.concat([b,Buffer.from(' ')]),signature(b),now],[b,'t=1,v1='+'0'.repeat(64),now],[b,signature(b),now+301000]])assert.throws(()=>verifyStripeEvent(payload,header,secret,time));
 assert.throws(()=>verifyStripeEvent(b,signature(b),'',now),/não configurado/);
 const connected=Buffer.from(JSON.stringify({...JSON.parse(b),account:'acct_foreign'}));assert.throws(()=>verifyStripeEvent(connected,signature(connected),secret,now));
});
test('Stripe exige pagamento confirmado, consulta fonte e confere vínculo do cliente',async()=>{
 let status='unpaid',customerOrg='org_fixture',stored='cus_fixture',invoice=false,mode=false;
 const billing=createStripeBilling({db:{prepare:()=>({get:async()=>({id:'org_fixture'})})},metadata:async()=>({customerId:stored}),saveMetadata:async()=>{throw new Error('no writes');},company:async()=>({}),now:()=>now,env:{HELPU_PUBLIC_URL:'https://helpu.example',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:secret},fetcher:async url=>({ok:true,json:async()=>url.includes('/customers/')?{id:'cus_fixture',metadata:{helpu_company:customerOrg}}:{id:invoice?'in_fixture':'cs_fixture',livemode:mode,currency:'brl',customer:'cus_fixture',mode:'payment',payment_status:status,status:status==='paid'?'paid':'open',amount_total:10000,amount_paid:10000,status_transitions:{paid_at:now/1000}}})});
 let b=bytes();assert.equal(await billing.financialEvent(b,signature(b)),null);status='paid';const p=await billing.financialEvent(b,signature(b));assert.equal(p.amountCents,10000);assert.equal(p.orgId,'org_fixture');
 stored='cus_other';assert.equal(await billing.financialEvent(b,signature(b)),null);stored='cus_fixture';mode=true;assert.equal(await billing.financialEvent(b,signature(b)),null);mode=false;
 customerOrg='';assert.equal(await billing.financialEvent(b,signature(b)),null);customerOrg='org_fixture';invoice=true;b=bytes('invoice.paid');assert.equal((await billing.financialEvent(b,signature(b))).objectId,'in_fixture');
});
