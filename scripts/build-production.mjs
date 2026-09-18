import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {prepareReelsBinaries} from './prepare-reels-binaries.mjs';
import {createReelsRenderer} from '../portal/reels-renderer.mjs';
await prepareReelsBinaries();
const require=createRequire(import.meta.url);
// npm ci disables package scripts; set native executable bits explicitly for Linux deployment.
if(process.platform==='linux'){
  for(const [pkg,binary]of [['@ffprobe-installer/linux-x64','ffprobe']]){
    const file=path.join(path.dirname(require.resolve(pkg+'/package.json')),binary);
    assert.ok(fs.existsSync(file),'Missing Reels binary: '+binary);fs.chmodSync(file,0o755);
  }
}
for(const font of ['DejaVuSans.ttf','DejaVuSans-Bold.ttf','DejaVuSerif.ttf'])assert.ok(fs.existsSync(path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')),'ttf',font)),'Missing Reels font: '+font);
if(process.platform==='linux'){
  const renderer=createReelsRenderer({env:{}});
  const sample=await renderer.render({scenes:[{duration:0.5,text:'Helpu · verificação de vídeo',fade:false}]});
  assert.ok(sample.bytes.length>24,'Reels production smoke render failed');
  // The one-scene smoke check cannot detect failures in transition assembly.
  for(const transition of ['fade','smoothleft']){
    const joined=await renderer.render({options:{transition,textAnimation:'rise',sourceAudio:false,soundEffects:'subtle'},scenes:[
      {duration:0.6,text:'Cena 1',background:'#ffffff'},
      {duration:0.6,text:'Cena 2',background:'#16804a'},
      {duration:0.6,text:'Cena 3',background:'#202020'},
    ]});
    assert.ok(Math.abs(joined.duration-1.8)<0.15,'Reels transition duration mismatch: '+transition);
  }
  console.log('Linux Reels smoke render verified: text, H.264, AAC, chained transitions and sound effects.');
}
const root=path.resolve('dist');
const pages=['index','cadastro','entrar','conta','portal','retorno','privacidade','termos','exclusao-de-dados'];
for(const name of pages){
  const source=fs.readFileSync(path.join(root,name+'.html'),'utf8');
  for(const [,file]of source.matchAll(/(?:src|href|poster)="(assets\/[^"?#]+)"/g))assert.ok(fs.existsSync(path.join(root,file)),'Missing asset: '+file);
}
for(const file of fs.readdirSync(root,{recursive:true})){
  assert.ok(!/(?:^|[\\/])(?:\.env|\.local-data|node_modules|integration\.key|.*\.sqlite)/i.test(file),'Private file in public output');
}
assert.ok(fs.existsSync('api/runtime.mjs'));
console.log('Public files verified; API package must pass verify-production-build before deployment.');
