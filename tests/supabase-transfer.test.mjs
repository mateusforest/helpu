import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {canonicalRow,tableHash,sqlValue,takeSnapshot,prepareTransfer,verifyRemote,importSQL,parseCliJSON} from '../scripts/supabase-transfer.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-cloud-transfer-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  fs.mkdirSync(path.join(directory,'uploads'));
  const db=new DatabaseSync(path.join(directory,'helpu.sqlite'));
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,company TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL); CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL); CREATE TABLE portal_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);");
  for(const file of ['001.sql','002.sql','003.sql','004.sql'])db.exec(fs.readFileSync(path.join(root,'portal/migrations',file),'utf8'));
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(1,'Teste','test@example.invalid','Fixture','TEST SALT','TEST HASH',1);
  db.prepare('INSERT INTO companies VALUES(?,?,?,?,?,?)').run('11111111-1111-1111-1111-111111111111','Fixture','{}','{}',1,1);
  db.prepare('INSERT INTO memberships VALUES(?,?,?)').run('11111111-1111-1111-1111-111111111111',1,'owner');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('TEST SESSION',1,999999999);
  db.prepare('INSERT INTO browser_profiles(org_id,channel,confirmed_at,automation_allowed,updated_at) VALUES(?,?,?,?,?)').run('11111111-1111-1111-1111-111111111111','higgsfield',1,1,1);
  db.close();return directory;
}

test('Supabase transfer: preserves snapshot and excludes local authentication',t=>{
  const directory=fixture(t),before=fs.readFileSync(path.join(directory,'helpu.sqlite'));
  const first=takeSnapshot(directory),second=takeSnapshot(directory);
  assert.equal(first.snapshotHash,second.snapshotHash);
  assert.equal(first.tables.find(table=>table.name==='users').count,1);
  assert.equal(first.tables.find(table=>table.name==='sessions').count,0);
  assert.equal(first.tables.find(table=>table.name==='browser_profiles').count,0);
  const sql=importSQL(first);
  assert.ok(!sql.includes('TEST SESSION'));
  assert.ok(!sql.includes('TEST HASH'));
  assert.match(sql,/ON CONFLICT DO NOTHING/);
  assert.match(sql,/Readback mismatch/);
  assert.ok(!/ON CONFLICT.*DO UPDATE/.test(sql));
  assert.deepEqual(fs.readFileSync(path.join(directory,'helpu.sqlite')),before);
});

test('Supabase transfer: compares every value, not just row counts',t=>{
  const snapshot=takeSnapshot(fixture(t));
  const result=snapshot.tables.map(({name,count,sha256})=>({name,count,sha256}));
  assert.equal(verifyRemote(snapshot.manifest,{rows:result}).verified,true);
  for(const encoding of ['utf8','utf16le']){
    const output=Buffer.from('\uFEFF'+JSON.stringify({rows:result}),encoding);
    assert.equal(verifyRemote(snapshot.manifest,parseCliJSON(output)).verified,true);
  }
  const corrupt=structuredClone(result);corrupt[0].sha256='0'.repeat(64);
  assert.throws(()=>verifyRemote(snapshot.manifest,{rows:corrupt}),/Remote content differs/);
  assert.throws(()=>verifyRemote(snapshot.manifest,{rows:result.slice(1)}));
  const columns=[{name:'value',type:'TEXT'}];
  assert.notEqual(tableHash([{value:null}],columns),tableHash([{value:''}],columns));
  assert.notEqual(canonicalRow({value:1},[{name:'value',type:'INTEGER'}]),canonicalRow({value:'1'},columns));
  assert.equal(tableHash([{value:'ç🟠'},{value:'a'}],columns),tableHash([{value:'a'},{value:'ç🟠'}],columns));
});

test('Supabase transfer: refuses unsafe or lossy SQL values',()=>{
  const malicious="'); DROP TABLE users; -- \\ $tag$ á";
  const encoded=sqlValue(malicious);
  assert.ok(!encoded.includes(malicious));
  assert.equal(Buffer.from(encoded.match(/decode\('([a-f0-9]+)'/)[1],'hex').toString(),malicious);
  assert.equal(sqlValue(null),'NULL');
  assert.throws(()=>sqlValue(Number.MAX_SAFE_INTEGER+1));
  assert.throws(()=>sqlValue('a\0b'));
});

test('Supabase transfer: rejects missing, changed and escaping assets',t=>{
  const directory=fixture(t),db=new DatabaseSync(path.join(directory,'helpu.sqlite'));
  db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?)').run('asset','11111111-1111-1111-1111-111111111111','Fixture','image/png',3,'fixture.png',null,1);
  assert.throws(()=>takeSnapshot(directory));
  fs.writeFileSync(path.join(directory,'uploads','fixture.png'),'12');
  assert.throws(()=>takeSnapshot(directory),/Asset size differs/);
  fs.writeFileSync(path.join(directory,'uploads','fixture.png'),'123');
  const transfer=prepareTransfer(directory,path.join(directory,'transfer'));
  assert.equal(transfer.manifest.assets[0].size,3);
  assert.deepEqual(fs.readFileSync(path.join(directory,'transfer','assets',transfer.manifest.assets[0].object)),Buffer.from('123'));
  db.prepare('UPDATE assets SET path=?').run('../private.key');
  assert.throws(()=>takeSnapshot(directory));db.close();
});
