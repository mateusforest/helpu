import fs from 'node:fs';
import path from 'node:path';
import {fork} from 'node:child_process';
import {project, loadConfiguration, startupMessage} from './runtime.mjs';

// IPC allows graceful restarts on Windows, where child.kill() terminates Node immediately.
let child, stopping = false, debounce, work = Promise.resolve();
const watchers = [];
function launch() {
  if (stopping) return;
  child = fork(path.join(project, 'scripts/start.mjs'), [], {cwd: project, stdio: ['inherit', 'inherit', 'inherit', 'ipc']});
  child.on('error', error => console.error(`Helpu: ${startupMessage(error)}`));
  child.on('message', message => { if (process.connected) process.send(message); });
}
async function stopChild() {
  const current = child;
  if (!current || current.exitCode !== null || current.signalCode !== null) return;
  await new Promise(resolve => {
    current.once('exit', resolve);
    if (current.connected) current.send({type: 'helpu:shutdown'}, () => {});
  });
}
function restart() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    work = work.then(async () => {
      if (stopping) return;
      console.log('Código alterado. Reiniciando a Helpu...');
      await stopChild();
      launch();
    }).catch(error => console.error(`Helpu: ${startupMessage(error)}`));
  }, 250);
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(debounce);
  watchers.forEach(watcher => watcher.close());
  await work;
  await stopChild();
  process.exit(0);
}
try {
  const {dataDir} = loadConfiguration();
  const changed = (directory, name) => {
    if (!name) return;
    const target = path.resolve(directory, String(name));
    const relative = path.relative(dataDir, target);
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) return;
    if (/\.(mjs|js|cjs|sql)$/.test(target)) restart();
  };
  watchers.push(fs.watch(project, (_event, name) => { if (String(name) === 'server.mjs') restart(); }));
  for (const directory of ['portal', 'scripts'].map(name => path.join(project, name))) {
    watchers.push(fs.watch(directory, {recursive: true}, (_event, name) => changed(directory, name)));
  }
  watchers.forEach(watcher => watcher.on('error', error => {
    console.error(`Helpu: ${startupMessage(error)}`);
    shutdown();
  }));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('message', message => { if (message?.type === 'helpu:shutdown') shutdown(); });
  process.on('disconnect', shutdown);
  console.log('Desenvolvimento: alterações no servidor reiniciam a Helpu. Para alterações na interface, atualize a página.');
  launch();
} catch (error) {
  console.error(`Helpu: ${startupMessage(error)}`);
  watchers.forEach(watcher => watcher.close());
  process.exitCode = 1;
  if (process.connected) process.disconnect();
}
