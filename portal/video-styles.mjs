import {VIDEO_FONTS,VIDEO_RECIPES} from './video-recipes.mjs';
import {parseVideoSubtitles} from './video-subtitles.mjs';
import {createHash} from 'node:crypto';
export const VIDEO_TRANSITIONS=['cut','fade','smoothleft','wipeleft','circleopen'];
export const VIDEO_FITS=['contain','cover','blur'];

export const VIDEO_PRESETS = [
  {id:'clean',name:'Claro e natural',description:'Texto limpo, aproximação discreta e cortes suaves.',font:'sans',motion:'zoom-in',textAnimation:'fade',transition:'fade',accent:'#16804a',fontSize:60},
  {id:'editorial',name:'Editorial',description:'Serifa, títulos com presença e movimento contido.',font:'serif',motion:'zoom-out',textAnimation:'rise',transition:'fade',accent:'#cf4935',fontSize:72},
  {id:'dynamic',name:'Dinâmico',description:'Palavras em sequência, destaque de cor e deslocamento lateral.',font:'condensed',motion:'pan',textAnimation:'words',transition:'smoothleft',accent:'#ff5318',fontSize:68},
  {id:'property',name:'Tour de imóvel',description:'Movimento lento, imagens em destaque e texto na área inferior.',font:'sans',motion:'zoom-in',textAnimation:'rise',transition:'fade',accent:'#16804a',fontSize:56,position:'bottom'},
  {id:'product',name:'Produto',description:'Enquadramento completo, título com entrada de escala e fundo da marca.',font:'sans',motion:'none',textAnimation:'pop',transition:'smoothleft',accent:'#ff5318',fontSize:64,fit:'contain'}
];
VIDEO_PRESETS.push(...VIDEO_RECIPES);
export const VIDEO_TECHNIQUES = [
  {name:'Zoom, pan e reenquadramento',status:'available',detail:'Movimentos programados; sem rastreamento automático do assunto.'},
  {name:'Transições suaves',status:'available',detail:'Dissolução, deslocamento, revelação lateral ou circular e corte direto.'},
  {name:'Fundo desfocado',status:'available',detail:'Preserva a imagem inteira com fundo derivado do próprio material.'},
  {name:'Texto animado',status:'available',detail:'Entrada suave, subida, escala e palavras em sequência; fontes sans, serifada e condensada.'},
  {name:'Cor nas palavras',status:'available',detail:'Destaque configurável, tamanho e posição por cena.'},
  {name:'Música e áudio enviado',status:'available',detail:'Faixa de fundo com volume e fades; áudio da gravação pode ser preservado ou silenciado.'},
  {name:'Efeitos sonoros',status:'available',detail:'Whoosh sintetizado opcional nos cortes, em volume discreto.'},
  {name:'Acompanhamento e recorte de pessoas',status:'planned',detail:'Requer rastreamento e máscaras por quadro; ainda não disponível.'},
  {name:'Colagem, cartões 3D e luz cinematográfica',status:'planned',detail:'Catalogados como referências; ainda não oferecidos pelo renderizador online.'},
  {name:'Legendas sincronizadas por SRT',status:'available',detail:'Tempos fornecidos pelo cliente; ainda sem transcrição automática da fala.'},
  {name:'Locução sintética',status:'planned',detail:'Piper e Kokoro foram usados localmente; serviço de voz ainda precisa ser hospedado e integrado.'}
];
const fail=message=>{throw Object.assign(new Error(message),{status:400,state:'blocked'});};
const choose=(v,options,fallback)=>{if(v===undefined||v===null)return fallback;if(!options.includes(v))fail('Opção de vídeo inválida: '+String(v).slice(0,40));return v;};
export function normalizeVideoOptions(raw={}){
  const preset=VIDEO_PRESETS.find(p=>p.id===(raw.preset||'clean'));if(!preset)fail('Estilo de vídeo não encontrado.');
  const fontSize=Number(raw.fontSize??preset.fontSize),musicVolume=Number(raw.musicVolume??0.15);
  if(!Number.isFinite(fontSize)||fontSize<36||fontSize>96||!Number.isFinite(musicVolume)||musicVolume<0||musicVolume>1)fail('Tamanho do texto ou volume inválido.');
  const accent=raw.accent??preset.accent;if(!/^#[a-f\d]{6}$/i.test(accent))fail('Cor de destaque inválida.');
  parseVideoSubtitles(raw.subtitlesSrt);
  return {subtitlesSrt:raw.subtitlesSrt||'',highlight:choose(raw.highlight,['last','none'],preset.highlight||'last'),textBox:choose(raw.textBox,['auto','outline','none'],preset.textBox||'auto'),preset:preset.id,aspectRatio:choose(raw.aspectRatio,['9:16','16:9'],'9:16'),quality:choose(raw.quality,['standard','high'],'high'),
    font:choose(raw.font,Object.keys(VIDEO_FONTS),preset.font),fontSize,accent,
    motion:choose(raw.motion,['none','zoom-in','zoom-out','pan'],preset.motion),
    textAnimation:choose(raw.textAnimation,['fade','rise','pop','words'],preset.textAnimation),
    transition:choose(raw.transition,VIDEO_TRANSITIONS,preset.transition),
    fit:choose(raw.fit,VIDEO_FITS,preset.fit||'cover'),sourceAudio:raw.sourceAudio!==false,musicVolume,
    soundEffects:choose(raw.soundEffects,['none','subtle'],'none'),
    musicAssetId:raw.musicAssetId?String(raw.musicAssetId):null};
}
export const dimensions=options=>options.aspectRatio==='16:9'?{width:1920,height:1080}:{width:1080,height:1920};
export function normalizeSceneTypography(raw){
 if(raw===undefined||raw===null)return {};
 if(typeof raw!=='object'||Array.isArray(raw))fail('Tipografia da cena inválida.');
 const keys=['font','fontSize','textAnimation','accent','highlight','textBox'];
 if(Object.keys(raw).some(k=>!keys.includes(k)))fail('Opção de tipografia inválida.');
 const options=normalizeVideoOptions(raw);
 return Object.fromEntries(keys.filter(k=>Object.hasOwn(raw,k)).map(k=>[k,options[k]]));
}
export function createVideoStyles({db}){
  const decode=row=>({id:row.id,...JSON.parse(row.data)});
  const list=async org=>(await db.prepare("SELECT id,data FROM records WHERE org_id=? AND kind='video_style' ORDER BY created_at DESC LIMIT 100").all(org)).map(decode);
  async function get(org,id){const row=await db.prepare("SELECT id,data FROM records WHERE org_id=? AND id=? AND kind='video_style'").get(org,id);if(!row)fail('Estilo não encontrado nesta empresa.');return decode(row);}
  async function save(org,user,{name,options,sourceCreationId,scenes=[]}){
    name=String(name||'').trim();if(!name||name.length>80)fail('Dê um nome ao estilo, com até 80 caracteres.');
    const key='style:'+createHash('sha256').update(JSON.stringify([org,sourceCreationId,name])).digest('hex');
    const existing=await db.prepare("SELECT id,data FROM records WHERE org_id=? AND kind='video_style' AND external_id=?").get(org,key);if(existing)return decode(existing);
    if(!Array.isArray(scenes)||!scenes.length||scenes.length>8||scenes.some(s=>!Number.isFinite(s.duration)||s.duration<.2||s.duration>15))fail('O vídeo não tem uma receita válida para salvar.');
    const duration=scenes.reduce((n,s)=>n+s.duration,0),recipe=scenes.slice(0,8).map(s=>({share:s.duration/duration,position:s.position||'center',typography:normalizeSceneTypography(s.typography)}));
    const now=Date.now(),id=key,data={name,options:{...normalizeVideoOptions(options),musicAssetId:null,subtitlesSrt:''},sourceCreationId,recipe,userId:user,version:2};
    await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'video_style',?,?,?,?) ON CONFLICT(org_id,kind,external_id) DO NOTHING").run(id,org,JSON.stringify(data),key,now,now);
    return get(org,id);
  }
  return {list,get,save};
}
