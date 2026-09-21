import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {testPng} from './image-fixture.mjs';import {createReelsRenderer} from '../portal/reels-renderer.mjs';
const require=createRequire(import.meta.url),ffmpeg=process.env.HELPU_TEST_FFMPEG||require('ffmpeg-static'),run=promisify(execFile),dir=path.resolve('../output/review-preview-qa');await fs.mkdir(dir,{recursive:true});
const renderer=createReelsRenderer({ffmpegPath:ffmpeg}),image=await renderer.reviewPreview({bytes:testPng(1080,1350),mime:'image/png'});await fs.writeFile(path.join(dir,'marked-image.png'),image);assert.ok(image.readUInt32BE(16)<=640&&image.readUInt32BE(20)<=640);
const source=path.join(dir,'synthetic-source.mp4');await run(ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c=0x156030:s=360x640:r=24:d=1','-c:v','libx264','-pix_fmt','yuv420p',source],{windowsHide:true});
const video=await renderer.reviewPreview({bytes:await fs.readFile(source),mime:'video/mp4'});await fs.writeFile(path.join(dir,'marked-video.mp4'),video);assert.equal(video.toString('ascii',4,8),'ftyp');
await run(ffmpeg,['-v','error','-i',path.join(dir,'marked-video.mp4'),'-frames:v','1','-y',path.join(dir,'marked-video-frame.png')],{windowsHide:true});
console.log(JSON.stringify({image:true,video:true,output:dir}));
