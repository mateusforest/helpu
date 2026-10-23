import test from 'node:test';
import assert from 'node:assert/strict';
import {localSeparation} from '../portal/local-separation.mjs';

test('separação só muda o acesso Local após ativação explícita',()=>{
  assert.equal(localSeparation('/local','GET',{}),null);
  const env={HELPU_LOCAL_SEPARATED:'true'};
  assert.deepEqual(localSeparation('/local','GET',env),{status:308,destination:'https://helpulocal.com/'});
  assert.deepEqual(localSeparation('/local/produtos.html','GET',env),{status:308,destination:'https://helpulocal.com/produtos.html'});
  assert.equal(localSeparation('/api/local/customer/register','POST',env).status,410);
  assert.equal(localSeparation('/api/portal/local-control','POST',env).status,410);
  for(const route of ['/api/auth/login','/api/account','/api/portal/bootstrap','/api/portal/admin-overview','/localidade'])assert.equal(localSeparation(route,'GET',env),null);
});
