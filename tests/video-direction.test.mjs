import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hasVideoDirection,hasVisualDirection,suppliesVideoDirection} from '../portal/creative-library.mjs';
import {videoRecipeFor,videoSceneCount,recipeTiming,reviewVideoPlan} from '../portal/video-direction.mjs';
import {normalizeVideoOptions} from '../portal/video-styles.mjs';
import {createReelsRenderer} from '../portal/reels-renderer.mjs';

test('paleta e referências de feed não substituem direção de edição',()=>{
 const company={profile:{visualIdentity:'Verde, branco, logo no rodapé'}},library={references:[{mime:'image/png'}],styles:[{format:'feed'}]};
 assert.equal(hasVisualDirection(company,{},library),true);
 assert.equal(hasVideoDirection(company,library),false);
 assert.equal(hasVideoDirection(company,{references:[{mime:'video/mp4'}]}),true);
 assert.equal(hasVideoDirection(company,{styles:[{format:'reels'}]}),true);
 assert.equal(hasVideoDirection(company,{references:[{mime:'image/png',notes:'Referência para estilo de vídeo'}]}),true);
 assert.equal(suppliesVideoDirection('transições suaves'),false);
 assert.equal(suppliesVideoDirection('vídeo minimalista'),true);
 assert.equal(suppliesVideoDirection('cortes rápidos, estilo editorial'),true);
});

test('receita da obra organiza cinco etapas e preserva receitas escolhidas',()=>{
 assert.equal(videoRecipeFor('Crie um vídeo da evolução da construção do escritório'),'construction');
 assert.equal(videoRecipeFor('Apresente o apartamento'),'architecture');
 assert.equal(videoRecipeFor('Pizza saindo do forno'),'gastronomy');
 const timing=recipeTiming('construction');assert.equal(timing.length,5);assert.ok(Math.abs(timing.reduce((n,s)=>n+s.share,0)-1)<.001);
 assert.equal(videoSceneCount({duration:15,editingVersion:2}),5);
 assert.equal(videoSceneCount({duration:30,editingVersion:2}),8);
 assert.equal(videoSceneCount({duration:15,styleRecipe:[{},{}]}),2);
 assert.equal(videoSceneCount({duration:15}),3); // queued legacy jobs keep their contract
 assert.equal(normalizeVideoOptions({preset:'construction'}).fit,'blur');
 assert.throws(()=>normalizeVideoOptions({transition:'wipeleft;movie=x'}));
});

test('revisão identifica repetições, títulos extensos e materiais ignorados',()=>{
 const request={referenceOnlyIds:['inspiration']},refs=[{id:'source',mime:'image/jpeg'},{id:'inspiration',mime:'image/png'}];
 assert.match(reviewVideoPlan([{text:'EME — Sistema Operacional do Corretor'}],{activeCompanyName:'EME',prompt:'Evolução da obra'},[]).join(' '),/assinatura/);
 assert.deepEqual(reviewVideoPlan([{text:'EME — Sistema Operacional do Corretor'}],{activeCompanyName:'EME',prompt:'Inclua a assinatura'},[]),[]);
 const slides=[{text:'O escritório ganha forma!',sourceAssetId:'source'},{text:'O escritório ganha forma.',sourceAssetId:'source'}];
 assert.match(reviewVideoPlan(slides,request,refs).join(' '),/repetido/);
 assert.deepEqual(reviewVideoPlan([{text:'A base',sourceAssetId:'source'},{text:'',sourceAssetId:'source'}],request,refs),[]);
 assert.match(reviewVideoPlan([{text:'Um título sem foto'}],request,refs).join(' '),/materiais/);
 assert.deepEqual(reviewVideoPlan([{text:'Nova ideia'}],request,[refs[1]]),[]);
 assert.match(reviewVideoPlan([{text:Array(15).fill('texto').join(' '),sourceAssetId:'source'}],request,refs).join(' '),/longo/);
});

test('MP4 real: fundo desfocado e revelações lateral/circular preservam duração e áudio',{skip:!process.env.HELPU_TEST_FFMPEG||!process.env.HELPU_TEST_FFPROBE,timeout:160000},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'helpu-direction-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const exec=promisify(execFile),ffmpeg=process.env.HELPU_TEST_FFMPEG,ffprobe=process.env.HELPU_TEST_FFPROBE;
 await exec(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=1','-frames:v','1',path.join(dir,'source.png')],{windowsHide:true});
 await exec(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=480x640:rate=24:duration=3','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'source.mp4')],{windowsHide:true});
 const assets=[{id:'photo',mime:'image/png',bytes:await fs.readFile(path.join(dir,'source.png'))},{id:'clip',mime:'video/mp4',bytes:await fs.readFile(path.join(dir,'source.mp4'))}];
 for(const transition of ['wipeleft','circleopen']){
  const result=await createReelsRenderer({ffmpegPath:ffmpeg,ffprobePath:ffprobe}).render({assets,options:{preset:'construction',transition,fit:'blur',motion:'none'},scenes:[{duration:1.5,text:'Do começo',sourceAssetId:'photo'},{duration:1.5,text:'Ao próximo passo',sourceAssetId:'clip'}]});
  assert.equal(result.width,1080);assert.equal(result.height,1920);assert.ok(Math.abs(result.duration-3)<.15);
  const file=path.join(dir,transition+'.mp4');await fs.writeFile(file,result.bytes);
  const check=JSON.parse((await exec(ffprobe,['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',file],{windowsHide:true})).stdout);
  assert.ok(check.streams.some(s=>s.codec_type==='audio'));
  // Sample padding area that would be white in the previous contain mode.
  const raw=(await exec(ffmpeg,['-v','error','-ss','0.5','-i',file,'-frames:v','1','-vf','crop=100:100:100:100,scale=1:1','-f','rawvideo','-pix_fmt','rgb24','-'],{windowsHide:true,encoding:'buffer'})).stdout;
  assert.ok([...raw].some(v=>v<200),'background must contain the source, not an empty white margin');
  if(process.env.HELPU_QA_OUTPUT){await fs.mkdir(process.env.HELPU_QA_OUTPUT,{recursive:true});await fs.writeFile(path.join(process.env.HELPU_QA_OUTPUT,transition+'.mp4'),result.bytes);}
 }
});
