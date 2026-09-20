import fs from 'node:fs';import path from 'node:path';
import {loadConfiguration} from './runtime.mjs';
import {EVAL_CASES,runEvaluation} from '../portal/ai-evals.mjs';
import {requestOpenAIResponse} from '../portal/providers.mjs';
import {measuredTokens} from '../portal/provider-usage.mjs';
import {estimateTextCost} from '../portal/ai-costs.mjs';
if(!process.argv.includes('--live'))throw Error('Use --live somente para autorizar 16 avaliações pagas, até 48 chamadas, com casos fictícios.');
const source=process.argv.find(a=>a.startsWith('--config='))?.slice(9)||process.cwd();loadConfiguration(source);
if(!process.env.OPENAI_API_KEY)throw Error('Chave OpenAI indisponível.');
const output=path.resolve('.local-data/ai-evaluation-'+Date.now()+'.json');fs.mkdirSync(path.dirname(output),{recursive:true});
const report={startedAt:Date.now(),scope:'Casos fictícios e ferramentas reais, sem execução de ferramentas. Não avalia pixels ou render final.',results:[]};
const selected=process.argv.find(a=>a.startsWith('--case='))?.slice(7);if(selected&&!EVAL_CASES.some(c=>c.id===selected))throw Error('Caso desconhecido.');
for(const c of EVAL_CASES.filter(c=>!selected||c.id===selected)){for(const model of ['gpt-5.6-sol','gpt-6-astra']){
 const start=Date.now(),calls=[];try{
  const evaluated=await runEvaluation(model,c,async body=>{const at=Date.now(),response=await requestOpenAIResponse({apiKey:process.env.OPENAI_API_KEY},body);const observedAt=Date.now(),tokens=measuredTokens(response.usage);calls.push({tokens,latencyMs:observedAt-at,cost:estimateTextCost({model:response.model||model,operation:'model_evaluation',tokens,observedAt,serviceTier:response.service_tier||'default'}),output:(response.output||[]).filter(x=>['message','function_call'].includes(x.type)).map(x=>x.type==='function_call'?{tool:x.name,arguments:x.arguments}:{text:(x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n')})});return response;});
  report.results.push({caseId:c.id,model,observedAt:Date.now(),latencyMs:Date.now()-start,...evaluated.grade,calls,cost:{usd:calls.every(x=>x.cost.usd!==null)?calls.reduce((n,x)=>n+x.cost.usd,0):null}});
 }catch(e){report.results.push({caseId:c.id,model,passed:false,calls,error:'Resposta não confirmada',diagnostic:e.providerDiagnostic?{status:e.providerDiagnostic.status,code:e.providerDiagnostic.code}:null});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({stopped:true,output,last:report.results.at(-1)}));process.exitCode=1;break;}
 fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({caseId:c.id,model,passed:report.results.at(-1).passed,latencyMs:report.results.at(-1).latencyMs}));
}if(process.exitCode)break;}
console.log(JSON.stringify({output,evaluations:report.results.length,calls:report.results.reduce((n,r)=>n+r.calls.length,0),summary:['gpt-5.6-sol','gpt-6-astra'].map(model=>{const r=report.results.filter(x=>x.model===model);return {model,passed:r.filter(x=>x.passed).length,cases:r.length,knownUsd:r.reduce((n,x)=>n+(x.cost?.usd||0),0),unpriced:r.filter(x=>typeof x.cost?.usd!=='number').length};})}));
