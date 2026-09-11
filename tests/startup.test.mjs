import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {fork, spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {checkNode, project} from '../scripts/runtime.mjs';

test('inicialização e desenvolvimento local', {timeout: 60000}, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-startup-test-'));
  const fixture = path.join(directory, 'Helpu com espaços');
  fs.mkdirSync(fixture);
  for (const name of ['package.json', 'server.mjs', 'preview.mjs', 'scripts', 'portal', 'dist']) {
    fs.cpSync(path.join(project, name), path.join(fixture, name), {recursive: true});
  }
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('HELPU_')));
  const children = [];
  function launch(entry = 'scripts/start.mjs', env = {}) {
    const child = fork(path.join(fixture, entry), [], {
      cwd: os.tmpdir(), env: {...environment, ...env}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    child.output = '';
    child.messages = [];
    child.stdout.on('data', bytes => { child.output += bytes; });
    child.stderr.on('data', bytes => { child.output += bytes; });
    child.on('message', message => child.messages.push(message));
    children.push(child);
    return child;
  }
  async function until(condition, child, timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error(`Tempo esgotado: ${child?.output || ''}`);
      await delay(30);
    }
  }
  async function ready(child, count = 1) {
    await until(() => child.messages.filter(message => message.type === 'helpu:ready').length >= count || child.exitCode !== null, child);
    assert.equal(child.exitCode, null, child.output);
    return child.messages.filter(message => message.type === 'helpu:ready').at(-1).origin;
  }
  async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (child.connected) child.send({type: 'helpu:shutdown'});
    await until(() => child.exitCode !== null || child.signalCode !== null, child);
    assert.equal(child.exitCode, 0, child.output);
  }
  async function unusedPort() {
    const listener = net.createServer();
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    return String(port);
  }
  const execute = (code, env = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: fixture, env: {...environment, ...env}, encoding: 'utf8', timeout: 10000,
  });
  const configCode = "import {loadConfiguration} from './scripts/runtime.mjs'; console.log(JSON.stringify(loadConfiguration()));";
  try {
    await t.test('versão mínima, padrões e diagnóstico sem criar dados', () => {
      assert.throws(() => checkNode('22.12.0'), /22.13/);
      assert.throws(() => checkNode('20.20.0'), /22.13/);
      checkNode('22.13.0');
      checkNode('24.0.0');
      const result = execute(configCode);
      assert.equal(result.status, 0, result.stderr);
      const config = JSON.parse(result.stdout);
      assert.equal(config.port, 4173);
      assert.equal(config.bind, '127.0.0.1');
      assert.equal(config.dataDir, path.join(fixture, '.local-data'));
      const doctor = execute("await import('./scripts/doctor.mjs');");
      assert.equal(doctor.status, 1);
      assert.match(doctor.stderr, /Dependências ausentes/);
      assert.equal(fs.existsSync(config.dataDir), false);
    });

    await t.test('dependência ausente impede abertura antes de criar banco', async () => {
      const child = launch();
      await until(() => child.exitCode !== null, child);
      assert.equal(child.exitCode, 1, child.output);
      assert.match(child.output, /npm ci --ignore-scripts/);
      assert.equal(fs.existsSync(path.join(fixture, '.local-data')), false);
    });
    fs.cpSync(path.join(project, 'node_modules/playwright-core'), path.join(fixture, 'node_modules/playwright-core'), {recursive: true});

    await t.test('.env aceita espaços, caminho relativo e prioridade do ambiente', () => {
      fs.writeFileSync(path.join(fixture, '.env'), 'HELPU_PORT=4281\nHELPU_DATA_DIR="dados com espaços"\n');
      let result = execute(configCode);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).port, 4281);
      assert.equal(JSON.parse(result.stdout).dataDir, path.join(fixture, 'dados com espaços'));
      result = execute(configCode, {HELPU_PORT: '4282'});
      assert.equal(JSON.parse(result.stdout).port, 4282);
      const doctor = execute("await import('./scripts/doctor.mjs');");
      assert.equal(doctor.status, 0, doctor.stderr);
      assert.equal(fs.existsSync(path.join(fixture, 'dados com espaços')), false);
    });

    await t.test('configuração e pasta inválidas têm orientação em português', async () => {
      for (const value of ['0', '65536', 'abc', '1.5', '']) {
        const child = launch('scripts/start.mjs', {HELPU_PORT: value});
        await until(() => child.exitCode !== null, child);
        assert.equal(child.exitCode, 1);
        assert.match(child.output, /HELPU_PORT deve/);
      }
      const badPath = path.join(fixture, 'isto é um arquivo');
      fs.writeFileSync(badPath, 'teste');
      const child = launch('scripts/start.mjs', {HELPU_DATA_DIR: badPath});
      await until(() => child.exitCode !== null, child);
      assert.equal(child.exitCode, 1);
      assert.match(child.output, /pasta de dados/);
    });

    await t.test('HTTP, cadastro e persistência nas entradas normal e prévia', async () => {
      const env = {HELPU_PORT: await unusedPort()};
      const child = launch('scripts/start.mjs', env);
      const origin = await ready(child);
      assert.equal((await fetch(origin + '/')).status, 200);
      assert.equal((await fetch(origin + '/entrar.html')).status, 200);
      assert.equal((await fetch(origin + '/assets/portal.js')).status, 200);
      const protectedPage = await fetch(origin + '/portal.html', {redirect: 'manual'});
      assert.equal(protectedPage.status, 302);
      assert.equal(protectedPage.headers.get('location'), '/entrar.html');
      const signup = await fetch(origin + '/api/auth/signup', {
        method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin},
        body: JSON.stringify({name: 'Teste local', email: 'local@example.test', password: 'teste-local-seguro-123'}),
      });
      assert.equal(signup.status, 201);
      const cookie = signup.headers.get('set-cookie').split(';')[0];
      assert.equal((await fetch(origin + '/portal.html', {headers: {Cookie: cookie}})).status, 200);
      const key = fs.readFileSync(path.join(fixture, 'dados com espaços/integration.key'));
      await stop(child);
      const preview = launch('preview.mjs', env);
      await ready(preview);
      assert.equal((await fetch(origin + '/api/auth/me', {headers: {Cookie: cookie}})).status, 200);
      assert.deepEqual(fs.readFileSync(path.join(fixture, 'dados com espaços/integration.key')), key);
      await stop(preview);
      const direct = launch('server.mjs', env);
      await ready(direct);
      await stop(direct);
    });

    await t.test('porta ocupada não abre dados nem encerra o outro servidor', async () => {
      const env = {HELPU_PORT: await unusedPort()};
      const first = launch('scripts/start.mjs', env);
      const origin = await ready(first);
      const nextData = path.join(fixture, 'dados segunda instancia');
      const second = launch('scripts/start.mjs', {...env, HELPU_DATA_DIR: nextData});
      await until(() => second.exitCode !== null, second);
      assert.equal(second.exitCode, 1);
      assert.match(second.output, /porta já está em uso/);
      assert.equal(fs.existsSync(nextData), false);
      assert.equal((await fetch(origin + '/')).status, 200);
      await stop(first);
    });

    await t.test('abertura automática ocorre com HTTP disponível e encerra sessões', async () => {
      fs.writeFileSync(path.join(fixture, 'scripts/open-test.mjs'), `
        import {startHelpu} from './start.mjs';
        let opened = false;
        const runtime = await startHelpu({open: true, openUrl: async url => {
          const response = await fetch(url, {redirect: 'manual'});
          if (response.status !== 302) throw new Error('portal-not-ready');
          opened = true;
        }});
        let browserClosed = false;
        const browser = runtime.app.portal.conversation.browser;
        const original = browser.shutdown;
        browser.shutdown = async () => { browserClosed = true; await original(); };
        await runtime.shutdown();
        if (!opened || !browserClosed) throw new Error('startup-or-shutdown-failed');
        if (process.connected) process.disconnect();
      `);
      const child = launch('scripts/open-test.mjs', {HELPU_PORT: await unusedPort()});
      await until(() => child.exitCode !== null, child);
      assert.equal(child.exitCode, 0, child.output);
    });

    await t.test('dev ignora dados e interface; edição do servidor reinicia sem perder sessão', async () => {
      // Keep data under a watched subtree to exercise the explicit exclusion too.
      const dataDir = path.join(fixture, 'portal/dados dev');
      const child = launch('scripts/dev.mjs', {HELPU_PORT: await unusedPort(), HELPU_DATA_DIR: dataDir});
      const origin = await ready(child);
      const signup = await fetch(origin + '/api/auth/signup', {
        method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin},
        body: JSON.stringify({name: 'Teste dev', email: 'dev@example.test', password: 'teste-dev-seguro-123'}),
      });
      assert.equal(signup.status, 201);
      const cookie = signup.headers.get('set-cookie').split(';')[0];
      for (const name of ['uploads/example.js', 'browser-profiles/example.js', 'example.mjs']) {
        const target = path.join(dataDir, name);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, '// dados');
      }
      fs.appendFileSync(path.join(fixture, 'dist/assets/portal.js'), '\n// atualização de teste\n');
      await delay(1000);
      assert.equal(child.messages.filter(message => message.type === 'helpu:ready').length, 1, child.output);
      fs.appendFileSync(path.join(fixture, 'server.mjs'), '\n// reinício de teste\n');
      await ready(child, 2);
      assert.equal((await fetch(origin + '/')).status, 200);
      assert.equal((await fetch(origin + '/api/auth/me', {headers: {Cookie: cookie}})).status, 200);
      await stop(child);
      const probe = net.createServer();
      await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(Number(new URL(origin).port), '127.0.0.1', resolve); });
      await new Promise(resolve => probe.close(resolve));
    });
  } finally {
    for (const child of children) await stop(child);
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'helpu-startup-test-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  }
});
