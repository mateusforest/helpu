import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConnectionPatch} from '../portal/connection-validation.mjs';

test('Conexões: rejeita e-mail e usuário no ID do Instagram sem devolver os valores', () => {
  for (const value of ['cliente@example.invalid', '@empresa', 'empresa', 'https://www.instagram.com/empresa/']) {
    const result = validateConnectionPatch('instagram', {accountId: value, accessToken: 'TEST-ONLY-PRIVATE'});
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].field, 'accountId');
    assert.match(result.errors[0].message, /ID numérico.*e-mail.*@usuário/);
    assert.equal(JSON.stringify(result).includes(value), false);
    assert.equal(JSON.stringify(result).includes('TEST-ONLY-PRIVATE'), false);
  }
});

test('Conexões: preserva IDs numéricos como texto e o prefixo act_ suportado', () => {
  for (const [provider, patch] of [
    ['instagram', {accountId: ' 17841400000000000 '}],
    ['whatsapp', {phoneNumberId: '123456789012345'}],
    ['metaAds', {adAccountId: 'act_123456789012345'}],
    ['metaAds', {adAccountId: '123456789012345'}]
  ]) {
    const snapshot = structuredClone(patch);
    assert.deepEqual(validateConnectionPatch(provider, patch), {ok: true, errors: []});
    assert.deepEqual(patch, snapshot);
  }
  assert.equal(validateConnectionPatch('instagram', {accountId: 17841400000000000}).ok, false);
  assert.equal(validateConnectionPatch('whatsapp', {phoneNumberId: '+55 (11) 99999-0000'}).ok, false);
  assert.equal(validateConnectionPatch('metaAds', {adAccountId: 'act_account-name'}).ok, false);
});

test('Conexões: Google aceita IDs opacos isolados e Client ID OAuth, sem e-mail ou caminho', () => {
  assert.equal(validateConnectionPatch('google', {
    accountId: '1234567890123456789', locationId: 'profile-test_1',
    clientId: '1234567890-test.apps.googleusercontent.com'
  }).ok, true);
  for (const [field, value] of [
    ['accountId', 'cliente@example.invalid'], ['locationId', 'Uma empresa'],
    ['accountId', 'accounts/123'], ['locationId', 'locations/456'],
    ['clientId', 'service@example.invalid'], ['clientId', 'https://accounts.google.com/']
  ]) {
    const result = validateConnectionPatch('google', {[field]: value});
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].field, field);
    assert.equal(JSON.stringify(result).includes(value), false);
  }
});

test('Conexões: atualizações parciais e segredos vazios não exigem credenciais novamente', () => {
  for (const provider of ['instagram', 'whatsapp', 'metaAds', 'google', 'openai', 'constructor']) {
    for (const patch of [{}, {version: 'v24.0'}, {accessToken: ''}, {accessToken: undefined}, {appSecret: 'TEST ONLY'}, {refreshToken: ''}]) {
      assert.deepEqual(validateConnectionPatch(provider, patch), {ok: true, errors: []});
    }
  }
  assert.equal(validateConnectionPatch('instagram', {accountId: ''}).ok, true);
  // Never inspect inherited fields or values from a previously saved config.
  const partial = Object.assign(Object.create({accountId: 'old@email.invalid'}), {version: 'v24.0'});
  assert.equal(validateConnectionPatch('instagram', partial).ok, true);
});

test('Conexões: explica token sem senha para entradas inequivocamente incorretas', () => {
  for (const accessToken of ['cliente@example.invalid', 'Bearer TEST-ONLY', 'https://example.invalid/token', 'TEST\nONLY', '••••••', 'TEST\u0000ONLY']) {
    for (const provider of ['instagram', 'whatsapp', 'metaAds', 'google']) {
      const result = validateConnectionPatch(provider, {accessToken});
      assert.equal(result.ok, false);
      assert.equal(result.errors[0].field, 'accessToken');
      assert.match(result.errors[0].message, /não é a senha/);
      assert.equal(JSON.stringify(result).includes(accessToken), false);
    }
  }
  assert.equal(validateConnectionPatch('google', {refreshToken: 'cliente@example.invalid'}).ok, false);
  assert.equal(validateConnectionPatch('instagram', {accessToken: '   '}).ok, false);
});

test('Conexões: token opaco não é autenticado ou classificado como senha pela aparência', () => {
  for (const accessToken of ['x', 'TEST-ONLY-token', 'a.b_c-d~+/==', ' opaque-token ', 'opaque!value', 'a'.repeat(2048)]) {
    assert.deepEqual(validateConnectionPatch('instagram', {accessToken}), {ok: true, errors: []});
  }
});

test('Conexões: rejeita tipos incorretos sem stringify de dados privados', () => {
  for (const patch of [null, [], 'TEST-ONLY-PRIVATE', 123]) assert.equal(validateConnectionPatch('instagram', patch).ok, false);
  for (const value of [null, true, 123, {secret: 'TEST-ONLY-PRIVATE'}, ['TEST-ONLY-PRIVATE']]) {
    const result = validateConnectionPatch('instagram', {accountId: value, accessToken: value});
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 2);
    assert.equal(JSON.stringify(result).includes('TEST-ONLY-PRIVATE'), false);
  }
});
