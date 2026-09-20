import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationRequestContext,applyMediaContext,LEGACY_RECEIPT} from '../portal/conversation-context.mjs';
const msg=(text,attachments=[],createdAt=100,role='user')=>({text,attachments,createdAt,role});
const assets=[{id:'image-a',mime:'image/png'},{id:'image-b',mime:'image/jpeg'},{id:'video',mime:'video/mp4'}];
test('style references are attached without becoming required scene material',()=>{
 const context={current:{text:'Use todas as imagens'},referenceIds:assets.map(a=>a.id)};
 const r=applyMediaContext({format:'reels',attachments:['image-a'],referenceOnlyIds:['video','image-b']},context,assets);
 assert.deepEqual(r.attachments,['image-a','video','image-b']);assert.deepEqual(r.requiredSourceAssetIds,['image-a']);assert.deepEqual(r.referenceOnlyIds,['video','image-b']);
 assert.throws(()=>applyMediaContext({format:'reels',referenceOnlyIds:['foreign']},context,assets),/referência de estilo/);
});
test('latest correction wins and all images survive a model choosing only the last video',()=>{
 const context=conversationRequestContext([msg(LEGACY_RECEIPT,['image-a']),msg('Arquivo recebido pelo WhatsApp.',['image-b','video'],101),msg('Crie um vídeo sem música',[],102),msg('Sem música conforme pedido',[],103,'assistant'),msg('Unifique todas as imagens no vídeo. Utilize a música',[],104)]);
 assert.deepEqual(context.referenceIds,['image-a','image-b','video']);assert.doesNotMatch(JSON.stringify(context.input),/Confirme o recebimento/);
 const request=applyMediaContext({format:'reels',attachments:['video'],videoOptions:{musicAssetId:null,sourceAudio:false}},context,assets);
 assert.deepEqual(request.requiredSourceAssetIds,['image-a','image-b']);assert.deepEqual(new Set(request.attachments),new Set(['image-a','image-b','video']));assert.equal(request.videoOptions.musicAssetId,'video');assert.equal(request.videoOptions.sourceAudio,false);
});
test('without music overrides an attached track and an earlier use-music request',()=>{
 const context=conversationRequestContext([msg('Use a música',['song']),msg('Agora gere sem música, só efeitos sonoros',[],101)]);
 const request=applyMediaContext({format:'reels',videoOptions:{musicAssetId:'song'}},context,[{id:'song',mime:'audio/wav'}]);
 assert.equal(request.videoOptions.musicAssetId,null);assert.equal(request.videoOptions.sourceAudio,false);
});
test('separate upload sessions do not revive old assets or old soundtrack choices',()=>{
 const context=conversationRequestContext([msg('Use a música',['old']),msg('Arquivo recebido pelo WhatsApp.',['image-a'],3600000),msg('Crie com ela',[],3600010)]);
 assert.deepEqual(context.referenceIds,['image-a']);assert.doesNotMatch(context.activeText,/Use a música/);
});
test('ambiguous soundtrack asks a specific question instead of silently rendering mute',()=>{
 assert.throws(()=>applyMediaContext({format:'reels'},{activeText:'Utilize a música',referenceIds:['one','two']},[{id:'one',mime:'video/mp4'},{id:'two',mime:'video/mp4'}]),/Qual arquivo/);
});
test('more than eight requested images are never silently truncated',()=>{
 const all=Array.from({length:9},(_,i)=>({id:'image-'+i,mime:'image/png'}));
 assert.throws(()=>applyMediaContext({format:'reels',attachments:[]},{activeText:'Unifique todas as imagens',referenceIds:all.map(a=>a.id)},all),/oito referências/);
});
