import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {receiveWhatsAppMedia} from '../portal/whatsapp-media.mjs';
const bytes=Buffer.from('media fixture');
const info={url:'https://lookaside.fbsbx.com/whatsapp_business/attachments/?id=123',mime_type:'image/png',file_size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
test('baixa mídia autenticada e confere tamanho e integridade',async()=>{
 const calls=[];const file=await receiveWhatsAppMedia({media:{id:'123'},token:'test-token',phoneId:'456',fetcher:async(url,options)=>{calls.push({url,options});return calls.length===1?Response.json(info):new Response(bytes);}});
 assert.deepEqual(file.bytes,bytes);assert.equal(file.name,'WhatsApp.png');assert.equal(calls.length,2);
 assert.ok(calls.every(c=>c.options.headers.Authorization==='Bearer test-token'&&c.options.redirect==='error'));
});
test('rejeita destinos arbitrários, formatos, tamanho e hash inválidos',async()=>{
 for(const change of [{url:'https://example.com/steal'},{url:'http://lookaside.fbsbx.com/x'},{url:'https://user:pass@lookaside.fbsbx.com/x'},{mime_type:'text/html'},{file_size:30*1024*1024},{sha256:'a'.repeat(64)}]){
 let n=0;await assert.rejects(receiveWhatsAppMedia({media:{id:'123'},token:'secret',phoneId:'456',fetcher:async()=>++n===1?Response.json({...info,...change}):new Response(bytes)}));
 if(!change.sha256)assert.equal(n,1);
 }
});
