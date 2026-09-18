import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {project} from './runtime.mjs';

// Vercel rejects oversized patterns before it executes the build command.
const deployment=JSON.parse(fs.readFileSync(path.join(project,'vercel.json'),'utf8'));
for(const [name,config] of Object.entries(deployment.functions||{})){
  if(typeof config.includeFiles==='string'&&config.includeFiles.length>256)throw new Error('Vercel includeFiles exceeds 256 characters: '+name);
}

function scripts(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? scripts(target) : /\.(mjs|js|cjs)$/.test(entry.name) ? [target] : [];
  });
}
const files = [
  ...fs.readdirSync(project).filter(name => /\.(mjs|js|cjs)$/.test(name)).map(name => path.join(project, name)),
  ...['portal', 'api', 'scripts', 'services', 'dist/assets', 'tests'].flatMap(name => scripts(path.join(project, name))),
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
  if (result.error || result.status !== 0) { process.exitCode = 1; break; }
}
if (!process.exitCode) console.log(`Sintaxe verificada: ${files.length} arquivos.`);
