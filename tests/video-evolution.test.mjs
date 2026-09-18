import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createReelsRenderer,reelCaptions,normalizeReelScenes} from '../portal/reels-renderer.mjs';
import {normalizeVideoOptions,dimensions} from '../portal/video-styles.mjs';
import {inlineVideoHash} from '../portal/creations.mjs';
const command=promisify(execFile);

test('video settings bound executable options and are part of authorization',()=>{
 for(const value of [{aspectRatio:'1:1'},{font:'evil;path'},{fontSize:500},{accent:'#fff;movie=x'},{musicVolume:Infinity},{transition:'custom'},{motion:'track-person'}])assert.throws(()=>normalizeVideoOptions(value));
 assert.deepEqual(dimensions(normalizeVideoOptions({aspectRatio:'16:9'})),{width:1920,height:1080});
 const payload={scenes:[],referenceAssetIds:[],videoOptions:{aspectRatio:'9:16'}};
 assert.notEqual(inlineVideoHash({},payload),inlineVideoHash({},{...payload,videoOptions:{aspectRatio:'16:9'}}));
 const scene=normalizeReelScenes([{duration:4,text:'Olá {\\p1} mundo colorido',textColor:'#123456'}])[0];
 for(const textAnimation of ['rise','pop','words']){const captions=reelCaptions(scene,false,{textAnimation,aspectRatio:'16:9',font:'serif'});assert.match(captions,/PlayResX: 1920/);assert.match(captions,/DejaVu Serif/);assert.doesNotMatch(captions,/\{\\p1\}/);}
});

test('real exports preserve duration with mixed sources, transitions, music and effects-only audio', {skip:!process.env.HELPU_TEST_FFMPEG||!process.env.HELPU_TEST_FFPROBE,timeout:160000},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astra-evolution-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const ffmpeg=process.env.HELPU_TEST_FFMPEG,ffprobe=process.env.HELPU_TEST_FFPROBE;
 const picture=path.join(dir,'image.png'),music=path.join(dir,'music.wav'),source=path.join(dir,'source.mp4');
 await command(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=1','-frames:v','1',picture],{windowsHide:true});
 await command(ffmpeg,['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','pcm_s16le',music],{windowsHide:true});
 await command(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=384x848:rate=60:duration=9.985','-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=9.98','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source],{windowsHide:true});
 const assets=[{id:'photo',mime:'image/png',bytes:await fs.readFile(picture)},{id:'song',mime:'audio/wav',bytes:await fs.readFile(music)},{id:'footage',mime:'video/mp4',bytes:await fs.readFile(source)}];
 const renderer=createReelsRenderer({env:{},ffmpegPath:ffmpeg,ffprobePath:ffprobe,previewThresholdBytes:1});
 const samples=await renderer.sampleReferences({assets});assert.equal(samples.length,3);assert.deepEqual(samples.map(x=>x.id),['photo','footage','footage']);assert.ok(samples.every(x=>x.image.startsWith('data:image/jpeg;base64,')));
 for(const transition of ['fade','smoothleft']){
  const result=await renderer.render({options:{aspectRatio:'16:9',quality:'high',preset:'editorial',textAnimation:transition==='fade'?'words':'rise',transition,musicAssetId:transition==='fade'?'song':'footage',soundEffects:'subtle',sourceAudio:false},assets,scenes:[{duration:2,sourceAssetId:'photo',text:'Sua marca em movimento',background:'#ffffff',textColor:'#002200'},{duration:2,sourceAssetId:'footage',text:'Um novo olhar',background:'#222222',textColor:'#ffffff'}]});
  assert.equal(result.width,1920);assert.equal(result.height,1080);assert.ok(Math.abs(result.duration-4)<0.15,`duration ${result.duration}`);
  const out=path.join(dir,transition+'.mp4');await fs.writeFile(out,result.bytes);
  assert.ok(result.previewBytes?.length>0);assert.ok(result.previewBytes.length<16*1024*1024);
  const preview=path.join(dir,transition+'-preview.mp4');await fs.writeFile(preview,result.previewBytes);
  const inspected=JSON.parse((await command(ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',preview],{windowsHide:true})).stdout);
  const previewVideo=inspected.streams.find(s=>s.codec_type==='video');assert.equal(previewVideo.width,1280);assert.equal(previewVideo.height,720);assert.ok(Math.abs(Number(inspected.format.duration)-4)<0.15);
  assert.equal((await command(ffmpeg,['-v','error','-i',preview,'-f','null','-'],{windowsHide:true})).stderr,'');
  assert.equal((await command(ffmpeg,['-v','error','-i',out,'-f','null','-'],{windowsHide:true})).stderr,'');
  const sound=await command(ffmpeg,['-v','info','-i',out,'-af','volumedetect','-vn','-f','null','-'],{windowsHide:true});assert.doesNotMatch(sound.stderr,/max_volume: -inf/);assert.match(sound.stderr,/max_volume:/);
  if(process.env.HELPU_TEST_OUTPUT){await fs.mkdir(process.env.HELPU_TEST_OUTPUT,{recursive:true});await fs.copyFile(out,path.join(process.env.HELPU_TEST_OUTPUT,transition+'.mp4'));await command(ffmpeg,['-v','error','-y','-ss','1','-i',out,'-frames:v','1',path.join(process.env.HELPU_TEST_OUTPUT,transition+'.jpg')],{windowsHide:true});}
 }
 const effectsOnly=await renderer.render({options:{aspectRatio:'9:16',quality:'high',fit:'contain',transition:'fade',motion:'zoom-in',sourceAudio:false,soundEffects:'subtle'},assets,scenes:[
  {duration:5,sourceAssetId:'footage',loopSource:true,text:'Clientes e imóveis em um só lugar'},
  {duration:5,sourceAssetId:'photo',text:'Organize sua operação'},
  {duration:5,sourceAssetId:'photo',text:'EME — Sistema Operacional do Corretor'}
 ]});
 assert.ok(Math.abs(effectsOnly.duration-15)<0.15,`duration without music ${effectsOnly.duration}`);
 const effectsFile=path.join(dir,'effects-only.mp4');await fs.writeFile(effectsFile,effectsOnly.bytes);
 const checked=JSON.parse((await command(ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type,width,height,duration','-of','json',effectsFile],{windowsHide:true})).stdout);
 assert.equal(checked.streams.find(s=>s.codec_type==='video').width,1080);
 for(const stream of checked.streams)assert.ok(Math.abs(Number(stream.duration)-15)<0.15,`${stream.codec_type} duration ${stream.duration}`);
 assert.equal((await command(ffmpeg,['-v','error','-i',effectsFile,'-f','null','-'],{windowsHide:true})).stderr,'');
 await assert.rejects(renderer.render({options:{musicAssetId:'photo'},assets,scenes:[{duration:1,text:'teste'}]}),/áudio/);
 await assert.rejects(renderer.preflight({assets:[{...assets[2],mime:'audio/mpeg'}]}),/MP3, WAV ou OGG/);
});
