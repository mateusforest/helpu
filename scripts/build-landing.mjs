import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Publish only these public files. The portal, server, credentials and company
// storage never enter the deployment directory.
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(project,'.superdesign','vercel-landing');
const assets=['favicon.svg','styles.css','motion.css','app.js','helpu-wordmark.svg',
  'helpu-motion-poster.webp','helpu-motion.mp4','brand-board.png'];
let html=fs.readFileSync(path.join(project,'dist','index.html'),'utf8');
html=html.replace(/<a\b([^>]*?)href="(cadastro|entrar)\.html"([^>]*)>[\s\S]*?<\/a>/g,
  (_,before,page,after)=>`<a${before}href="#acesso"${after}>${page==='entrar'?'Portal em breve':'Acesso em breve'} <span aria-hidden="true">↗</span></a>`);
assert.ok(html.includes('<section class="cta-section"'));
html=html.replace('<section class="cta-section"','<section id="acesso" class="cta-section"');
html=html.replace('<a class="button button-dark" href="#acesso">Acesso em breve <span aria-hidden="true">↗</span></a>',
  '<p>O cadastro e o acesso ao portal serão disponibilizados em breve.</p><a class="button button-dark" href="#como-funciona">Conheça a operação <span aria-hidden="true">↗</span></a>');
html=html.replace('O que acontece depois do cadastro?', 'Quando poderei acessar o portal?');
html=html.replace('Você cria seu acesso à Helpu. A operação de marketing e a conexão com os canais serão disponibilizadas conforme a evolução da plataforma; o cadastro, por si só, não publica conteúdo nem conecta suas contas.',
  'O cadastro e o acesso ao portal ainda não estão disponíveis neste site. Esta página apresenta a proposta da Helpu; o acesso à plataforma será disponibilizado em uma próxima etapa.');

assert.ok(html.includes('O cadastro e o acesso ao portal serão disponibilizados em breve.'));
assert.ok(!/href="(?:cadastro|entrar|conta|portal)\.html"|<form\b|\/api\//i.test(html));
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const [,target]of html.matchAll(/\bhref="#([^"]+)"/g))assert.ok(ids.has(target),'Missing section: '+target);
for(const [,resource]of html.matchAll(/\b(?:src|href|poster)="(assets\/[^"]+)"/g))assert.ok(assets.includes(resource.slice(7)),'Unapproved public asset: '+resource);
for(const name of assets){
  const text=/\.(?:css|js)$/.test(name)?fs.readFileSync(path.join(project,'dist','assets',name),'utf8'):'';
  assert.ok(!/\/api\/|(?:cadastro|entrar|conta|portal)\.html/.test(text),'Portal dependency in '+name);
  for(const [,url]of text.matchAll(/url\(["']?([^\s)'";]+)["']?\)/g))assert.ok(url.startsWith('data:')||assets.includes(url.replace(/^\.\//,'')),'Unapproved CSS resource: '+url);
}

fs.mkdirSync(path.join(output,'assets'),{recursive:true});
const allowed=new Set(['index.html','vercel.json','.vercelignore',...assets.map(name=>'assets/'+name)]);
for(const entry of fs.readdirSync(output,{recursive:true,withFileTypes:true})){
  if(!entry.isFile())continue;
  const relative=path.relative(output,path.join(entry.parentPath,entry.name)).split(path.sep).join('/');
  if(relative.startsWith('.vercel/')||relative==='.gitignore')continue;
  assert.ok(allowed.has(relative),'Unexpected deployment file; inspect before publishing: '+relative);
}
fs.writeFileSync(path.join(output,'index.html'),html);
for(const name of assets)fs.copyFileSync(path.join(project,'dist','assets',name),path.join(output,'assets',name));
const config={
  $schema:'https://openapi.vercel.sh/vercel.json',framework:null,installCommand:'',buildCommand:'',
  redirects:['cadastro','entrar','conta','portal'].map(name=>({source:'/'+name+'.html',destination:'/#acesso',permanent:false})),
  headers:[{source:'/(.*)',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"}
  ]}]
};
fs.writeFileSync(path.join(output,'vercel.json'),JSON.stringify(config,null,2)+'\n');
fs.writeFileSync(path.join(output,'.vercelignore'),['*','!index.html','!vercel.json','!assets',...assets.map(name=>'!assets/'+name)].join('\n')+'\n');
const manifest=[...allowed].map(name=>{const bytes=fs.readFileSync(path.join(output,name));return {name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
fs.writeFileSync(path.join(project,'.superdesign','vercel-landing-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,files:manifest.length,bytes:manifest.reduce((sum,file)=>sum+file.size,0),portalIncluded:false},null,2));
