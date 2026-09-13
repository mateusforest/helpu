import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {project} from './runtime.mjs';

function scripts(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? scripts(target) : /\.(mjs|js|cjs)$/.test(entry.name) ? [target] : [];
  });
}
const files = [
  ...fs.readdirSync(project).filter(name => /\.(mjs|js|cjs)$/.test(name)).map(name => path.join(project, name)),
  ...['portal', 'api', 'scripts', 'dist/assets', 'tests'].flatMap(name => scripts(path.join(project, name))),
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
  if (result.error || result.status !== 0) { process.exitCode = 1; break; }
}
if (!process.exitCode) console.log(`Sintaxe verificada: ${files.length} arquivos.`);
