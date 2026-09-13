import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('dist');
const pages=['index','cadastro','entrar','conta','portal'];
for(const name of pages){
  const source=fs.readFileSync(path.join(root,name+'.html'),'utf8');
  for(const [,file]of source.matchAll(/(?:src|href|poster)="(assets\/[^"?#]+)"/g))assert.ok(fs.existsSync(path.join(root,file)),'Missing asset: '+file);
}
for(const file of fs.readdirSync(root,{recursive:true})){
  assert.ok(!/(?:^|[\\/])(?:\.env|\.local-data|node_modules|integration\.key|.*\.sqlite)/i.test(file),'Private file in public output');
}
assert.ok(fs.existsSync('api/[...path].mjs'));
console.log('Public files verified; API package must pass verify-production-build before deployment.');
