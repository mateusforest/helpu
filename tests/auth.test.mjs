import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHelpuServer} from '../server.mjs';
import http from 'node:http';
test('cadastro, autenticação e isolamento de sessão', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-auth-test-'));
  let server = await createHelpuServer({
    dataDir
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let origin = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body, cookie, extra = {}) => fetch(origin + url, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...body ? {
        'Content-Type': 'application/json',
        'Origin': origin
      } : {},
      ...cookie ? {
        Cookie: cookie
      } : {},
      ...extra
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  let cookie;
  const account = {
    name: 'Pessoa de teste',
    company: 'Empresa de teste',
    email: 'sample@example.test',
    password: 'uma-senha-de-teste-28'
  };
  try {
    await t.test('a área da conta exige autenticação', async () => {
      assert.equal((await request('/api/auth/me')).status, 401);
      const response = await request('/conta.html');
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/entrar.html');
    });
    await t.test('valida dados no servidor e bloqueia origem diferente', async () => {
      assert.equal((await request('/api/auth/signup', {
        ...account,
        password: 'curta'
      })).status, 400);
      assert.equal((await request('/api/auth/signup', account, undefined, {
        Origin: 'https://outro-site.example'
      })).status, 403);
    });
    await t.test('rejeita nomes de host externos na aplicação local', async () => {
      const code = await new Promise((resolve, reject) => {
        http.get(origin + '/api/auth/me', {
          headers: {
            Host: 'externo.example'
          }
        }, response => {
          response.resume();
          resolve(response.statusCode);
        }).on('error', reject);
      });
      assert.equal(code, 403);
    });
    await t.test('cria a conta e uma sessão protegida sem expor credenciais', async () => {
      const response = await request('/api/auth/signup', account);
      assert.equal(response.status, 201);
      cookie = response.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Strict/);
      const body = await response.json();
      assert.equal(body.user.email, account.email);
      assert.equal(body.user.password, undefined);
      assert.equal(body.user.password_hash, undefined);
      cookie = cookie.split(';')[0];
      const me = await request('/api/auth/me', undefined, cookie);
      assert.equal(me.status, 200);
      assert.equal((await me.json()).user.company, account.company);
      assert.equal((await request('/conta.html', undefined, cookie)).status, 200);
    });
    await t.test('a senha não é guardada em texto e o e-mail é único sem diferenciar maiúsculas', async () => {
      const db = new DatabaseSync(path.join(dataDir, 'helpu.sqlite'));
      const row = db.prepare('SELECT salt,password_hash FROM users').get();
      db.close();
      assert.equal(row.salt.length, 32);
      assert.equal(row.password_hash.length, 128);
      assert.notEqual(row.password_hash, account.password);
      assert.equal((await request('/api/auth/signup', {
        ...account,
        email: account.email.toUpperCase()
      })).status, 409);
    });
    await t.test('logout invalida a sessão, senha incorreta falha e login retorna uma nova sessão', async () => {
      assert.equal((await request('/api/auth/logout', {}, cookie)).status, 200);
      assert.equal((await request('/api/auth/me', undefined, cookie)).status, 401);
      assert.equal((await request('/api/auth/login', {
        email: account.email,
        password: 'senha-incorreta-999'
      })).status, 401);
      const response = await request('/api/auth/login', {
        email: account.email,
        password: account.password
      });
      assert.equal(response.status, 200);
      const nextCookie = response.headers.get('set-cookie').split(';')[0];
      assert.notEqual(nextCookie, cookie);
      cookie = nextCookie;
    });
    await t.test('dados persistem ao reiniciar e a sessão tem validade', async () => {
      await new Promise(resolve => server.close(resolve));
      server = await createHelpuServer({
        dataDir
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      origin = `http://127.0.0.1:${server.address().port}`;
      assert.equal((await request('/api/auth/me', undefined, cookie)).status, 200);
      const db = new DatabaseSync(path.join(dataDir, 'helpu.sqlite'));
      db.exec('UPDATE sessions SET expires_at=0');
      db.close();
      assert.equal((await request('/api/auth/me', undefined, cookie)).status, 401);
    });
    await t.test('dados privados não são servidos e vídeo suporta leitura parcial', async () => {
      assert.equal((await request('/.local-data/helpu.sqlite')).status, 404);
      assert.equal((await request('/server.mjs')).status, 404);
      const response = await fetch(origin + '/assets/helpu-motion.mp4', {
        headers: {
          Range: 'bytes=0-99'
        }
      });
      assert.equal(response.status, 206);
      assert.equal((await response.arrayBuffer()).byteLength, 100);
    });
    await t.test('limita tentativas repetidas de login', async () => {
      let response;
      for (let i = 0; i < 11; i++) response = await request('/api/auth/login', {
        email: 'rate-test@example.test',
        password: 'senha-invalida-longa'
      });
      assert.equal(response.status, 429);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    const resolved = path.resolve(dataDir);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'helpu-auth-test-'));
    fs.rmSync(resolved, {
      recursive: true,
      force: true
    });
  }
});
