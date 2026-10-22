// Dedicated SQLite demo. Never loads .env or connects to the published application.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';

if (process.env.VERCEL || process.env.NODE_ENV === 'production' || process.env.HELPU_PUBLIC_URL) {
  throw new Error('A demonstração só pode rodar localmente, sem origem pública.');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.local-data', 'marketplace-demo');
const credentialsFile = path.join(dataDir, 'demo-access.json');
fs.mkdirSync(dataDir, {recursive:true});
if (!fs.existsSync(credentialsFile) && fs.existsSync(path.join(dataDir,'helpu.sqlite'))) {
  throw new Error('Banco existente sem identificação de demonstração. Nenhum dado foi alterado.');
}
if (!fs.existsSync(credentialsFile)) fs.writeFileSync(credentialsFile, JSON.stringify({
  password:'Demo-' + randomBytes(9).toString('hex'),
  admin:'admin@helpu-demo.test', shop:'loja@helpu-demo.test', person:'pessoa@helpu-demo.test',
}, null, 2));
const accounts = JSON.parse(fs.readFileSync(credentialsFile,'utf8'));
const {createHelpuServer} = await import('../server.mjs');
const server = await createHelpuServer({dataDir, portalOptions:{startScheduler:false,
  localEmailEnv:{},operatorEnv:{HELPU_OPERATOR_USER_IDS:'1'}, whatsappChatEnv:{}, openaiEnv:{}, instagramLoginEnv:{}, stripeEnv:{}, runtimeEnv:{}}});
const origin = 'http://127.0.0.1:4173';
await new Promise((resolve,reject) => {server.once('error',reject);server.listen(4173,'127.0.0.1',resolve);});
async function request(url, body, cookie = '') {
  return fetch(origin + url, {method:body ? 'POST' : 'GET', headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie}, body:body ? JSON.stringify(body) : undefined});
}
async function json(url, body, cookie) {
  const r = await request(url,body,cookie), d = await r.json();
  if (!r.ok) throw Error(url + ': ' + JSON.stringify(d)); return d;
}
async function login(email, admin = false, sellerType) {
  const prefix = admin ? '/api/auth/' : '/api/local/customer/';
  let r = await request(prefix+'login',{email,password:accounts.password});
  if (r.status === 401) r = await request(prefix+(admin?'signup':'register'),{
    email,password:accounts.password,name:admin?'Equipe Helpu · Demo':sellerType==='Loja'?'Loja Central · Demo':'Marina · Demo',
    sellerType,phone:'54000000000',
  });
  if (!r.ok) throw Error(await r.text()); return r.headers.get('set-cookie').split(';')[0];
}
try {
  const admin = await login(accounts.admin,true);
  const launch = await json('/api/portal/local-launch',null,admin);
  if (!launch.open) await json('/api/portal/local-launch',{version:launch.version,open:true,plannedDate:'2026-10-20'},admin);
  const sellers = {shop:await login(accounts.shop,false,'Loja'),person:await login(accounts.person,false,'Pessoa física')};
  const examples = [
    ['shop','Notebook 15 polegadas','Eletrônicos','Novo',329900,'notebook','Publicado'],
    ['shop','Smartphone 128 GB de mostruário','Eletrônicos','Usado',89900,'celular','Publicado'],
    ['shop','Luminária de mesa','Casa e móveis','Novo',14990,'luminaria','Publicado'],
    ['shop','Fone sem fio','Eletrônicos','Novo',18990,'fone','Em análise'],
    ['shop','Sofá de exposição','Casa e móveis','Usado',159000,'sofa','Rascunho'],
    ['person','Bicicleta urbana aro 26','Esportes','Usado',65000,'bicicleta','Publicado'],
    ['person','Sofá 3 lugares conservado','Casa e móveis','Usado',85000,'sofa','Publicado'],
    ['person','Fone lacrado, presente repetido','Eletrônicos','Novo',22000,'fone','Publicado'],
    ['person','Celular usado com carregador','Eletrônicos','Usado',45000,'celular','Vendido'],
    ['person','Notebook para estudo','Eletrônicos','Usado',120000,'notebook','Em análise'],
  ];
  for (const [owner,title,category,condition,priceCents,image,state] of examples) {
    const cookie = sellers[owner];
    const existing = (await json('/api/local/customer/products',null,cookie)).products;
    if (existing.some(p=>p.title===title)) continue;
    const photos=[], filename=path.join(dataDir,'images',image+'.png');
    if (fs.existsSync(filename)) {
      const r=await fetch(origin+'/api/local/customer/photo',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'image/png','X-File-Name':image+'.png'},body:fs.readFileSync(filename)});
      const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));photos.push(d.id);
    }
    let p=await json('/api/local/customer/products',{title,category,condition,priceCents,city:'Vacaria, RS',phone:'54000000000',photos,
      description:`${title}. ${condition==='Novo'?'Item novo, sem uso.':'Item usado, com marcas normais de uso e funcionamento demonstrativo.'} Anúncio fictício para testar a Helpu Local; não está à venda. Imagem ilustrativa.`,submit:state!=='Rascunho'},cookie);
    if (['Publicado','Vendido'].includes(state)) p=await json('/api/portal/local-products',{id:p.id,version:p.version,state:'Publicado'},admin);
    if (state==='Vendido') await json('/api/local/customer/product-state',{id:p.id,version:p.version,state:'Vendido'},cookie);
  }
  const catalog=await json('/api/local/products');
  console.log(JSON.stringify({url:origin+'/local/produtos.html',publicProducts:catalog.products.length,credentialsFile,dataDir}));
} catch (e) {
  await server.portal.shutdown();await new Promise(r=>server.close(r));throw e;
}
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{
  await server.portal.shutdown();await new Promise(r=>server.close(r));process.exit(0);
});
