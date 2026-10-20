import test from 'node:test';
import assert from 'node:assert/strict';
import {productErrors, photoError} from '../dist/local/product-validation.js';
const valid = {title:'Celular', price:'599.90', city:'Vacaria', description:'Celular usado em bom estado.', phone:'(54) 99999-9999'};
test('campos obrigatórios e preço: valida antes de enviar', () => {
  assert.deepEqual(productErrors(valid), {});
  assert.equal(Object.keys(productErrors({})).length,5);
  for (const price of ['', ' ', 'abc', '-1', '0', '0.001', '1.999', '1000000.01', 'Infinity']) assert.ok(productErrors({...valid,price}).price, price);
  for (const price of ['0.01','1.10','1000000']) assert.equal(productErrors({...valid,price}).price,undefined);
  for (const field of ['title','city','description','phone']) assert.ok(productErrors({...valid,[field]:'  '})[field]);
});
test('fotos: valida o lote inteiro antes do upload e considera fotos existentes', () => {
  const photo = {name:'foto.png',type:'image/png',size:3*1024*1024};
  assert.equal(photoError(Array(6).fill(photo)), '');
  assert.match(photoError(Array(7).fill(photo)), /até 6/);
  assert.match(photoError([photo,photo],5), /no máximo 1/);
  assert.match(photoError([photo],6), /Remova uma/);
  assert.match(photoError([photo,{...photo,name:'grande.png',size:photo.size+1}]), /grande.png.*3 MB/);
  assert.match(photoError([{...photo,type:'image/gif'}]), /JPG, PNG ou WebP/);
});
