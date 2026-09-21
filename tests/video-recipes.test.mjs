import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {VIDEO_FONTS,VIDEO_RECIPES} from '../portal/video-recipes.mjs';
import {normalizeVideoOptions} from '../portal/video-styles.mjs';
import {parseVideoSubtitles} from '../portal/video-subtitles.mjs';
import {reelCaptions,timedVideoCaptions,createReelsRenderer} from '../portal/reels-renderer.mjs';
test('receitas têm ritmo válido e fontes realmente distribuídas',async()=>{
 for(const r of VIDEO_RECIPES){assert.ok(Math.abs(r.shares.reduce((a,b)=>a+b,0)-1)<.001);assert.equal(normalizeVideoOptions({preset:r.id}).font,r.font);}
 for(const [font,face] of Object.entries(VIDEO_FONTS)){await fs.access(path.resolve('node_modules/dejavu-fonts-ttf/ttf',face.file));const ass=reelCaptions({duration:3,text:'Olá mundo',textColor:'#ffffff',position:'bottom',fade:true},true,{font,highlight:'none',textBox:'outline'});assert.ok(ass.includes(face.family));assert.ok(!ass.includes('{\\c&H'));}
});
test('SRT valida tempo, tamanho e neutraliza comandos de desenho',()=>{
 const raw='1\n00:00:00,300 --> 00:00:01,900\nOlá {\\p1} mundo\n\n2\n00:00:02,000 --> 00:00:03,000\nSegunda frase';
 const entries=parseVideoSubtitles(raw,3);assert.equal(entries.length,2);const ass=timedVideoCaptions(entries,{font:'serif-italic'});assert.match(ass,/Dialogue: 0,0:00:00.30,0:00:01.90/);assert.doesNotMatch(ass,/\{\\p1\}/);
 for(const value of ['1\n00:00:01,000 --> 00:00:00,500\na','1\n00:00:00,000 --> 00:00:31,000\na',raw.replace('00:00:02,000','00:00:01,000')])assert.throws(()=>parseVideoSubtitles(value,30));
 assert.throws(()=>parseVideoSubtitles(raw,2));
});
test('render real de receita e legenda sincronizada', {skip:!process.env.HELPU_TEST_FFMPEG,timeout:160000},async()=>{
 const renderer=createReelsRenderer({ffmpegPath:process.env.HELPU_TEST_FFMPEG,ffprobePath:process.env.HELPU_TEST_FFPROBE});
 const out=await renderer.render({scenes:[{duration:2,typography:{font:'serif-italic',fontSize:72,highlight:'none'},text:'Sua próxima ideia',background:'#201f23',textColor:'#ffffff'},{duration:2,text:'Começa aqui',background:'#f6ece1',textColor:'#202020'}],options:{preset:'teaser',aspectRatio:'16:9',subtitlesSrt:'1\n00:00:00,200 --> 00:00:01,500\nLegenda fornecida pelo cliente',soundEffects:'subtle'}});
 assert.equal(out.width,1920);assert.equal(out.height,1080);assert.ok(Math.abs(out.duration-4)<.1);assert.ok(out.bytes.length>10000);
 if(process.env.HELPU_QA_OUTPUT){await fs.mkdir(process.env.HELPU_QA_OUTPUT,{recursive:true});await fs.writeFile(path.join(process.env.HELPU_QA_OUTPUT,'receita-com-legenda.mp4'),out.bytes);}
});
