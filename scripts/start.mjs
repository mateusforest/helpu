import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {checkDependencies, checkFiles, checkDataDirectory, loadConfiguration, startupMessage} from './runtime.mjs';
export function openBrowser(url) {
  const child = process.platform === 'win32' ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', 'Start-Process -FilePath $env:HELPU_OPEN_URL'], {
    env: {
      ...process.env,
      HELPU_OPEN_URL: url
    },
    windowsHide: true,
    stdio: 'ignore'
  }) : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {
    stdio: 'ignore'
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('browser-open-failed')));
  });
}
export async function startHelpu({open = false, openUrl = openBrowser} = {}) {
  const config = loadConfiguration();
  checkDependencies();
  checkFiles();
  checkDataDirectory(config.dataDir);
  const reservation = net.createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(config.port, config.bind, resolve);
  });
  let app;
  try {
    const {createHelpuServer} = await import('../server.mjs');
    app = await createHelpuServer({
      dataDir: config.dataDir
    });
  } finally {
    await new Promise(resolve => reservation.close(resolve));
  }
  try {
    await new Promise((resolve, reject) => {
      app.once('error', reject);
      app.listen(config.port, config.bind, resolve);
    });
  } catch (error) {
    await app.portal.shutdown();
    await new Promise(resolve => app.close(resolve));
    throw error;
  }
  let closing;
  const shutdown = () => closing ??= (async () => {
    await app.portal.shutdown();
    await new Promise(resolve => app.close(resolve));
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  })();
  const onSignal = () => {
    shutdown().then(() => process.exit(0), () => process.exit(1));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  const url = `${config.origin}/portal.html`;
  console.log(`Helpu pronta: ${url}`);
  console.log('Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.');
  if (open) {
    try {
      await openUrl(url);
    } catch {
      console.warn(`Não foi possível abrir o navegador automaticamente. Acesse ${url}`);
    }
  }
  return {
    app,
    shutdown,
    config
  };
}
export async function run() {
  let runtime, stopRequested = false;
  const stop = () => {
    stopRequested = true;
    if (runtime) runtime.shutdown().then(() => process.exit(0), () => process.exit(1));
  };
  process.on('message', message => {
    if (message?.type === 'helpu:shutdown') stop();
  });
  process.on('disconnect', stop);
  try {
    runtime = await startHelpu({
      open: process.argv.includes('--open')
    });
    if (stopRequested) stop(); else if (process.connected) process.send({
      type: 'helpu:ready',
      origin: runtime.config.origin
    });
    return runtime;
  } catch (error) {
    console.error(`Helpu: ${startupMessage(error)}`);
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
