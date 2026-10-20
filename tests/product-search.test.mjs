import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesProductSearch} from '../dist/local/product-search.js';

test('busca de produtos aceita acentos, caixa e espaços do teclado móvel', () => {
  const sofa={title:'Sofá 3 lugares',description:'Conservado, cor café',city:'Vacaria, RS'};
  for(const q of ['sofa','SOFÁ','  sofa   conservado  ','cafe vacaria','sofa\u0301','']) assert.equal(matchesProductSearch(sofa,q),true,q);
  assert.equal(matchesProductSearch(sofa,'sofa novo'),false);
  assert.equal(matchesProductSearch(sofa,'celular'),false);
});
