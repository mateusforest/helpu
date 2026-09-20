import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||'.vercel/output');
const files=fs.readdirSync(root,{recursive:true}).filter(name=>fs.statSync(path.join(root,name)).isFile());
const forbidden=files.filter(name=>/(?:^|[\\/])(?:\.local-data|\.superdesign|\.git|\.env(?:\.[^\\/]+)?|integration\.key|[^\\/]+\.sqlite(?:-[^\\/]+)?|browser-profiles|tests)(?:[\\/]|$)/i.test(name));
assert.equal(forbidden.length,0,'Private or development files in compiled deployment; do not publish');
assert.ok(files.includes(path.join('static','portal.html')),'Portal was not built');
const configs=files.filter(name=>name.endsWith('.vc-config.json')).map(name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8')));
assert.equal(configs.length,1,'Expected one API function');
assert.equal(configs[0].runtime,'nodejs22.x');
assert.equal(configs[0].handler,'api/runtime.mjs');
for(const native of ['node_modules/ffmpeg-static/ffmpeg','node_modules/@ffprobe-installer/linux-x64/ffprobe','node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf','node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf','node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif.ttf']){
  assert.ok(files.some(file=>file.replaceAll('\\','/').endsWith('/'+native)),'Reels dependency missing from API package: '+native);
}
const apiFiles=files.filter(file=>file.replaceAll('\\','/').startsWith('functions/'));
const apiBytes=apiFiles.reduce((total,file)=>total+fs.statSync(path.join(root,file)).size,0);
assert.ok(apiBytes<250*1024*1024,'API package exceeds the 250MB uncompressed function limit');
const routing=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
for(const route of ['/webhooks/helpu-whatsapp','/webhooks/helpu-stripe','/api/health','/api/auth/me','/api/portal/company/files/asset']){
  assert.ok(routing.routes.some(rule=>rule.dest?.split('?')[0]==='/api/runtime'&&new RegExp(rule.src).test(route)),'Nested API route was not built: '+route);
}
console.log(JSON.stringify({state:'compiled_package_verified',files:files.length,privateFiles:0,functions:configs.length,apiBytes,runtime:configs[0].runtime}));
