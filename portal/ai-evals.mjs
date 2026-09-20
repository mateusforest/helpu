import {CONVERSATION_CONTEXT_RULES,applyMediaContext} from './conversation-context.mjs';
import {normalizeVideoOptions} from './video-styles.mjs';
import {conversationEvaluationTools} from './conversation.mjs';
export const EVAL_CASES=[
 {id:'duration',name:'Última correção de duração',messages:['Quero um Reels de 15 segundos usando foto-a.','Corrigindo: faça 30 segundos, vertical, usando a mesma foto.'],expected:{format:'reels',duration:30,attachments:['foto-a']}},
 {id:'music',name:'Última escolha de música',messages:['Vídeo de 15 segundos sem música usando foto-a.','Agora use a música do arquivo musica-mp4, mantenha a foto. Gere.'],expected:{format:'reels',music:'musica-mp4'}},
 {id:'all',name:'Todas as imagens',messages:['Enviei foto-a, foto-b e foto-c para um Reels.','Crie 15 segundos usando todas as imagens.'],expected:{format:'reels',attachments:['foto-a','foto-b','foto-c']}},
 {id:'prior',name:'Referência anterior preservada',messages:['Enviei foto-a como imagem do produto.','Crie um story com ela.'],expected:{format:'story',attachments:['foto-a']}},
 {id:'receipt',name:'Anexo sem pedido de geração',messages:['Receba foto-a como referência. Ainda não crie nada.'],expected:{noCreate:true}},
 {id:'pending',name:'Pedido em produção não é duplicado',messages:['Meu Reels já está em produção, criação job-pendente.','Já terminou? Confira sem criar outro.'],expected:{status:true}},
 {id:'style',name:'Vídeo de estilo separado do material',messages:['foto-a é o produto. video-estilo é apenas referência de edição, não pode aparecer na peça.','Crie Reels de 15 segundos usando a foto e essa referência de estilo.'],expected:{format:'reels',reference:['video-estilo']}},
 {id:'brand',name:'Marca conflitante exige esclarecimento',messages:['A empresa ativa é Marca Verde. foto-a mostra o logo de outra empresa, Marca Laranja.','Crie um anúncio com essa imagem. Ainda não decidi qual marca divulgar.'],expected:{noCreate:true,question:true}}
];
export function evaluationRequest(model,c){return {model,service_tier:'default',store:false,reasoning:{effort:'medium'},max_output_tokens:2000,parallel_tool_calls:false,instructions:'Você é Astra, assistente de criação da Helpu. Modo executar, sem publicar. Empresa fictícia Marca Verde, cores verde e branco. Os arquivos foto-a, foto-b e foto-c são imagens válidas; musica-mp4 é MP4 com trilha autorizada; video-estilo é referência de estilo. Escolha o próximo passo para o pedido, usando ferramentas quando necessário. Nenhuma ferramenta será executada nesta avaliação. Nunca diga que gerou ou entregou um arquivo. '+CONVERSATION_CONTEXT_RULES,input:c.messages.map(content=>({role:'user',content})),tools:conversationEvaluationTools()};}
export function gradeEvaluation(response,c){
 const calls=(response.output||[]).filter(x=>x.type==='function_call'),text=(response.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');let args={};try{args=JSON.parse(calls.find(x=>x.name==='create_media')?.arguments||'{}');}catch{return {passed:false,notes:['Argumentos inválidos']};}
 const e=c.expected,notes=[];
 if(calls.some(x=>x.name==='create_media')){const ids=[...new Set(c.messages.join(' ').match(/foto-[abc]|musica-mp4|video-estilo/g)||[])];try{args=applyMediaContext(args,{current:{text:c.messages.at(-1)},referenceIds:ids},ids.map(id=>({id,mime:id.startsWith('foto-')?'image/png':'video/mp4'})));if(args.format==='reels')normalizeVideoOptions(args.videoOptions);if((args.attachments||[]).some(id=>!ids.includes(id))||(args.referenceOnlyIds||[]).some(id=>!args.attachments.includes(id)))notes.push('Referência indisponível');}catch{notes.push('Parâmetros incompatíveis com o editor');}}
 if(response.status!=='completed')notes.push('Resposta incompleta');
 if(e.noCreate&&calls.some(x=>!['operation_status','creation_library'].includes(x.name)))notes.push('Ação não solicitada');
 if(e.noCreate&&!text.trim()&&!calls.length)notes.push('Resposta vazia');
 if(e.question&&!text.includes('?'))notes.push('Não esclareceu a marca');
 if(e.status&&(!calls.some(x=>['operation_status','creation_library'].includes(x.name))||calls.some(x=>x.name==='create_media')))notes.push('Não consultou o estado ou duplicou a geração');
 if(e.format&&(calls.filter(x=>x.name==='create_media').length!==1||args.format!==e.format))notes.push('Formato ou ação incorretos');
 if(e.duration&&args.duration!==e.duration)notes.push('Duração anterior prevaleceu');
 if(e.attachments&&e.attachments.some(id=>!args.attachments?.includes(id)))notes.push('Perdeu materiais anteriores');
 if(e.music&&args.videoOptions?.musicAssetId!==e.music)notes.push('Ignorou a música atual');
 if(e.reference&&e.reference.some(id=>!args.referenceOnlyIds?.includes(id)))notes.push('Confundiu referência de estilo com material');
 return {passed:notes.length===0,notes};
}
// Execute only simulated read tools. Never dispatch a creation, send or write.
export async function runEvaluation(model,c,ask){const body=evaluationRequest(model,c),responses=[];let response;for(let step=0;step<3;step++){
 response=await ask(body,step);responses.push(response);const calls=(response.output||[]).filter(x=>x.type==='function_call');
 if(!calls.length||calls.some(x=>!['operation_status','creation_library'].includes(x.name))||c.expected.status)break;
 body.input.push(...(response.output||[]));for(const call of calls)body.input.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify({capabilities:{images:true,reels:true},creations:[],jobs:[],message:'Consulta simulada: serviço disponível, arquivos do pedido disponíveis, não há criação anterior. Siga o pedido atual.'})});
 }return {response,responses,grade:gradeEvaluation(response,c)};}
