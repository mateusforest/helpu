export const PRICE_SOURCE='https://developers.openai.com/api/docs/pricing';
export const PRICE_DATE='2026-09-20';
const rates={'gpt-5.6-sol':[4,.4,20],'gpt-6-astra':[10,1,50]};
export function estimateTextCost({model,tokens,operation,observedAt,serviceTier}){
 const r=rates[model],t=tokens||{},date=new Date(observedAt).toISOString().slice(0,10);
 if(!r||operation==='image')return {usd:null,reason:'Modelo ou modalidade sem tarifa validada'};
 if(date<PRICE_DATE||date>'2026-11-21')return {usd:null,reason:'Tarifa fora do período conferido'};
 if(serviceTier!=='default')return {usd:null,reason:'Modalidade de processamento não confirmada'};
 if(![t.input,t.cachedInput,t.output].every(n=>Number.isSafeInteger(n)&&n>=0)||t.cachedInput>t.input)return {usd:null,reason:'Medição de tokens incompleta'};
 if(t.cacheWriteInput>0)return {usd:null,reason:'Gravação de cache exige conciliação específica'};
 const long=t.input>272000;
 const usd=((t.input-t.cachedInput)*r[0]*(long?2:1)+t.cachedInput*r[1]*(long?2:1)+t.output*r[2]*(long?1.5:1))/1e6;
 return {usd,source:PRICE_SOURCE,priceDate:PRICE_DATE,currency:'USD',basis:'Standard; tokens de texto; estimativa, não fatura'};
}
export function estimateImageCost({model,tokens,observedAt,serviceTier}){
 const t=tokens||{},date=new Date(observedAt).toISOString().slice(0,10),unknown=reason=>({usd:null,reason});
 if(!['gpt-image-2.5-sunburst','gpt-image-2.5-sunburst-2026-09-08'].includes(model)||serviceTier!=='default'||date<PRICE_DATE||date>'2026-11-21')return unknown('Modelo, data ou processamento sem tarifa validada');
 if(![t.input,t.textInput,t.imageInput,t.cachedInput,t.output].every(n=>Number.isSafeInteger(n)&&n>=0)||t.textInput+t.imageInput!==t.input||t.cachedInput>t.input)return unknown('Medição multimodal incompleta');
 if(t.cachedInput>0&&t.textInput>0&&t.imageInput>0)return unknown('Cache misto sem divisão entre texto e imagem');
 const cachedText=t.imageInput===0?t.cachedInput:0,cachedImage=t.textInput===0?t.cachedInput:0;
 return {usd:((t.textInput-cachedText)*5+cachedText*1.25+(t.imageInput-cachedImage)*8+cachedImage*2+t.output*30)/1e6,currency:'USD',priceDate:PRICE_DATE,source:'https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst',basis:'Standard; uso multimodal medido; estimativa, não fatura'};
}
