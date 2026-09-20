import test from 'node:test';
import assert from 'node:assert/strict';
import {adminDestination} from '../dist/assets/admin-routing.js';
test('admin enters own area, explicit client use and connection callbacks stay in client portal',()=>{
 const base='https://example.test/portal.html';assert.equal(adminDestination(true,base),'admin.html');assert.equal(adminDestination(false,base),null);
 for(const route of ['admin','consultations-admin','commercial','pricing'])assert.equal(adminDestination(true,base+'#/'+route),'admin.html#/'+route);
 for(const suffix of ['?mode=client','?company=abc','?connection=connected','#/conversation','#/account','#/company'])assert.equal(adminDestination(true,base+suffix),null);
 assert.equal(adminDestination(false,base+'#/admin'),null);
});
