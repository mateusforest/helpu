import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function checkNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (!(major > 22 || (major === 22 && minor >= 13))) {
    throw new Error('Instale o Node.js 22.13 ou posterior e abra novamente o terminal.');
  }
}

export function loadConfiguration(directory = project) {
  checkNode();
  // Existing process variables win; local overrides the shared development file.
  for (const name of ['.env.local', '.env']) {
    const envFile = path.join(directory, name);
    if (fs.existsSync(envFile)) {
      try { process.loadEnvFile(envFile); }
      catch { throw new Error(`Não foi possível carregar o arquivo ${name}. Confira o formato e a permissão de leitura.`); }
    }
  }
  const value = process.env.HELPU_PORT ?? '4173';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('HELPU_PORT deve ser um número inteiro entre 1 e 65535.');
  }
  const bind = process.env.HELPU_BIND ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '0.0.0.0'].includes(bind)) {
    throw new Error('HELPU_BIND deve ser 127.0.0.1, localhost ou 0.0.0.0.');
  }
  if (process.env.HELPU_PUBLIC_URL) {
    let url;
    try { url = new URL(process.env.HELPU_PUBLIC_URL); } catch {}
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('HELPU_PUBLIC_URL deve ser uma origem HTTPS, sem caminho, parâmetros ou credenciais.');
    }
  }
  if (process.env.HELPU_DATA_DIR !== undefined && !process.env.HELPU_DATA_DIR.trim()) {
    throw new Error('HELPU_DATA_DIR não pode estar vazio. Remova a opção para usar .local-data.');
  }
  const dataDir = path.resolve(directory, process.env.HELPU_DATA_DIR ?? '.local-data');
  const port = Number(value);
  const origin = process.env.HELPU_PUBLIC_URL
    ? new URL(process.env.HELPU_PUBLIC_URL).origin
    : `http://${bind === 'localhost' ? 'localhost' : '127.0.0.1'}:${port}`;
  return {port, bind, dataDir, origin};
}

export function checkDependencies(directory = project) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    let installed;
    try { installed = JSON.parse(fs.readFileSync(path.join(directory, 'node_modules', name, 'package.json'), 'utf8')); } catch {}
    // Font packages contain data files rather than a JavaScript entry point.
    const entry = name === 'dejavu-fonts-ttf' ? 'ttf/DejaVuSans.ttf' : installed?.main || 'index.js';
    if (!installed || installed.version !== version || !fs.existsSync(path.join(directory, 'node_modules', name, entry))) {
      throw new Error('Dependências ausentes ou incompatíveis. Execute npm ci --ignore-scripts na pasta do projeto.');
    }
  }
}

export function checkFiles(directory = project) {
  const files = ['server.mjs', 'portal/core.mjs', 'portal/providers.mjs', 'portal/browser.mjs', 'portal/publication.mjs',
    'portal/studio.mjs', 'portal/conversation.mjs', 'portal/catalog.mjs', 'portal/google-presence.mjs',
    'portal/migrations/001.sql', 'portal/migrations/002.sql', 'portal/migrations/003.sql', 'portal/migrations/004.sql', 'portal/kernel.mjs',
    'dist/index.html', 'dist/portal.html', 'dist/entrar.html', 'dist/cadastro.html', 'dist/conta.html',
    'dist/assets/app.js', 'dist/assets/auth.js', 'dist/assets/portal.js', 'dist/assets/conversation-ui.js',
    'dist/assets/capture.js', 'dist/assets/styles.css', 'dist/assets/portal.css', 'dist/assets/auth.css',
    'dist/assets/studio-ui.js', 'dist/assets/conversation.css', 'dist/assets/motion.css', 'dist/assets/favicon.svg',
    'dist/assets/helpu-motion.mp4', 'dist/assets/helpu-motion-poster.webp'];
  for (const name of files) {
    if (!fs.existsSync(path.join(directory, name))) throw new Error(`Arquivo necessário ausente: ${name}. Restaure os arquivos do projeto.`);
  }
}

export function checkDataDirectory(dataDir) {
  try {
    let existing = dataDir;
    while (!fs.existsSync(existing)) {
      const parent = path.dirname(existing);
      if (parent === existing) throw new Error();
      existing = parent;
    }
    if (!fs.statSync(existing).isDirectory()) throw new Error();
    fs.accessSync(existing, fs.constants.R_OK | fs.constants.W_OK);
    for (const name of ['helpu.sqlite', 'integration.key', 'uploads', 'browser-profiles']) {
      const target = path.join(dataDir, name);
      if (fs.existsSync(target)) fs.accessSync(target, fs.constants.R_OK | fs.constants.W_OK);
    }
  } catch { throw new Error('Não foi possível acessar a pasta de dados. Confira HELPU_DATA_DIR e as permissões de leitura e gravação.'); }
}

export function findBrowser() {
  const candidates = [process.env.HELPU_BROWSER_EXECUTABLE,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
  return candidates.filter(Boolean).find(candidate => {
    try { return fs.statSync(candidate).isFile(); } catch { return false; }
  });
}

export function startupMessage(error) {
  if (error.code === 'EADDRINUSE') return 'A porta já está em uso. Feche a outra instância da Helpu ou configure HELPU_PORT no .env.';
  if (['EACCES', 'EPERM', 'EROFS', 'SQLITE_CANTOPEN'].includes(error.code) || /unable to open database|readonly database/i.test(error.message)) {
    return 'Não foi possível acessar a porta ou a pasta de dados. Confira as permissões e HELPU_DATA_DIR.';
  }
  if (error.code === 'ERR_MODULE_NOT_FOUND') return 'Dependências ou arquivos ausentes. Execute npm ci --ignore-scripts e confira os arquivos do projeto.';
  if (error.message === 'Invalid integration key') return 'A chave de integração está inválida. Restaure integration.key a partir do backup, junto com o banco original.';
  return error.message;
}
