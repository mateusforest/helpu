import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyStripeEvent(bytes,header,secret,now=Date.now()){
 const fail=()=>{throw Object.assign(new Error('Evento Stripe inválido.'),{status:400});};
 if(!/^whsec_/.test(secret||''))throw Object.assign(new Error('Webhook Stripe não configurado.'),{status:503});
 const parts=String(header||'').split(',').map(s=>s.trim().split('=')),timestamps=parts.filter(([k])=>k==='t');
 if(timestamps.length!==1||!/^\d+$/.test(timestamps[0][1]))fail();const time=Number(timestamps[0][1]);if(Math.abs(now/1000-time)>300)fail();
 const expected=createHmac('sha256',secret).update(time+'.').update(bytes).digest();
 if(!parts.some(([k,v])=>k==='v1'&&/^[a-f\d]{64}$/.test(v)&&timingSafeEqual(expected,Buffer.from(v,'hex'))))fail();
 let event;try{event=JSON.parse(bytes.toString('utf8'));}catch{fail();}
 if(!/^evt_\w+$/.test(event?.id||'')||typeof event.livemode!=='boolean'||event.account||!event.data?.object)fail();return event;
}
