import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const targetProject='pgwoyxtcrkwtricejdbl';
export const bucket='helpu-private';
export const tableNames=['users','companies','memberships','records','integrations','assets','jobs','audit',
  'usage_reservations','conversations','conversation_messages','conversation_events','portal_migrations',
  'sessions','browser_profiles'];
const excluded=new Set(['sessions','browser_profiles']);
export const sha256=value=>createHash('sha256').update(value).digest('hex');
const identifier=value=>{assert.match(value,/^[a-z_]+$/);return '"'+value+'"';};

export function sqlValue(value){
  if(value===null)return 'NULL';
  if(typeof value==='number'){assert.ok(Number.isSafeInteger(value),'Only exact integers may be transferred');return String(value);}
  assert.equal(typeof value,'string');assert.ok(!value.includes('\0'),'Postgres text cannot contain NUL');
  // Hex transport avoids SQL quoting, backslash, dollar-quote and Unicode ambiguities.
  return `convert_from(decode('${Buffer.from(value).toString('hex')}','hex'),'UTF8')`;
}
export function canonicalRow(row,columns){
  return columns.map(({name,type})=>{
    const value=row[name];if(value===null)return 'n;';
    const text=String(value);return (type==='INTEGER'?'i':'s')+Buffer.byteLength(text)+':'+text+';';
  }).join('');
}
export function tableHash(rows,columns){return sha256(rows.map(row=>sha256(canonicalRow(row,columns))).sort().join(''));}
export function fingerprintQuery(table){
  const row=table.columns.map(({name,type})=>{
    const column=identifier(name),text=column+'::text';
    return `CASE WHEN ${column} IS NULL THEN 'n;' ELSE '${type==='INTEGER'?'i':'s'}'||octet_length(${text})::text||':'||${text}||';' END`;
  }).join('||');
  return `SELECT '${table.name}' AS name,count(*) AS count,encode(extensions.digest(COALESCE(string_agg(h,'' ORDER BY h),''),'sha256'),'hex') AS sha256 FROM (SELECT encode(extensions.digest(${row},'sha256'),'hex') AS h FROM helpu.${identifier(table.name)}) hashes`;
}

export function takeSnapshot(dataDir){
  const db=new DatabaseSync(path.join(dataDir,'helpu.sqlite'),{readOnly:true});
  try{
    db.exec('BEGIN');
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok','Source database integrity check failed');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'Source foreign keys are inconsistent');
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
    assert.deepEqual(names.sort(),[...tableNames].sort(),'Review schema changes before exporting');
    const tables=tableNames.map(name=>{
      const columns=db.prepare('PRAGMA table_info('+identifier(name)+')').all().map(({name,type})=>({name,type}));
      assert.ok(columns.every(column=>['TEXT','INTEGER'].includes(column.type)),'Unsupported source column type');
      const rows=excluded.has(name)?[]:db.prepare('SELECT * FROM '+identifier(name)).all();
      for(const row of rows)for(const column of columns)sqlValue(row[column.name]);
      return {name,columns,rows,count:rows.length,sha256:tableHash(rows,columns)};
    });
    const assets=tables.find(table=>table.name==='assets').rows.map(asset=>{
      assert.match(asset.org_id,/^[a-f0-9-]{36}$/i);assert.equal(path.basename(asset.path),asset.path);
      const local=path.join(dataDir,'uploads',asset.path),bytes=fs.readFileSync(local);
      assert.equal(bytes.length,asset.size,'Asset size differs from database');
      return {id:asset.id,companyId:asset.org_id,file:asset.path,mime:asset.mime,size:bytes.length,
        sha256:sha256(bytes),bucket,object:asset.org_id+'/'+asset.path};
    });
    const manifest={projectRef:targetProject,schema:'helpu',tables:tables.map(({rows,...table})=>table),assets,
      exclusions:['Local sessions','Persistent browser profiles and cookies','Local encryption key'],
      integrationCredentials:'Existing ciphertext only; the encryption key remains local',
      runtime:'The Node.js portal and worker have not been moved by this data transfer'};
    const snapshotHash=sha256(JSON.stringify(manifest));
    db.exec('COMMIT');return {tables,manifest,snapshotHash};
  }finally{db.close();}
}

export function importSQL(snapshot){
  const {tables,manifest,snapshotHash}=snapshot;
  const sql=['BEGIN;',"SET LOCAL statement_timeout='60s';",
    'LOCK TABLE '+[...tables.map(table=>'helpu.'+identifier(table.name)),'helpu.cloud_imports'].join(',')+' IN SHARE ROW EXCLUSIVE MODE;',
    `DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM helpu.cloud_imports WHERE snapshot_hash<>'${snapshotHash}') THEN RAISE EXCEPTION 'A different snapshot has already been imported; reconcile before continuing'; END IF;`,
    `IF NOT EXISTS(SELECT 1 FROM helpu.cloud_imports WHERE snapshot_hash='${snapshotHash}') THEN`];
  for(const table of tables)sql.push(`IF EXISTS(SELECT 1 FROM helpu.${identifier(table.name)}) THEN RAISE EXCEPTION 'Destination ${table.name} must be empty on first import'; END IF;`);
  sql.push('END IF; END $guard$;');
  for(const table of tables)for(const row of table.rows){
    sql.push(`INSERT INTO helpu.${identifier(table.name)}(${table.columns.map(column=>identifier(column.name)).join(',')}) VALUES(${table.columns.map(column=>sqlValue(row[column.name])).join(',')}) ON CONFLICT DO NOTHING;`);
  }
  // Verify every value before committing; conflicts never silently overwrite remote rows.
  sql.push('DO $verify$ DECLARE actual record; BEGIN');
  for(const table of tables){
    sql.push(`SELECT * INTO actual FROM (${fingerprintQuery(table)}) q; IF actual.count<>${table.count} OR actual.sha256<>'${table.sha256}' THEN RAISE EXCEPTION 'Readback mismatch in ${table.name}'; END IF;`);
  }
  sql.push('END $verify$;',
    "SELECT setval(pg_get_serial_sequence('helpu.users','id'),COALESCE((SELECT max(id) FROM helpu.users),1),EXISTS(SELECT 1 FROM helpu.users));",
    `INSERT INTO helpu.cloud_imports(snapshot_hash,manifest) VALUES('${snapshotHash}',${sqlValue(JSON.stringify(manifest))}::jsonb) ON CONFLICT DO NOTHING;`,
    'COMMIT;',tables.map(fingerprintQuery).join('\nUNION ALL\n')+';');
  return sql.join('\n');
}

export function prepareTransfer(dataDir,output){
  const snapshot=takeSnapshot(dataDir);
  fs.mkdirSync(output,{recursive:true});
  // These files contain private data. CLI restricts their output to an ignored directory.
  fs.writeFileSync(path.join(output,'import.sql'),importSQL(snapshot),{mode:0o600});
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({snapshotHash:snapshot.snapshotHash,...snapshot.manifest},null,2),{mode:0o600});
  fs.writeFileSync(path.join(output,'verify.sql'),snapshot.tables.map(fingerprintQuery).join('\nUNION ALL\n')+';');
  for(const asset of snapshot.manifest.assets){
    const destination=path.join(output,'assets',asset.object);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    const bytes=fs.readFileSync(path.join(dataDir,'uploads',asset.file));
    assert.equal(sha256(bytes),asset.sha256,'Asset changed while snapshot was being prepared');
    fs.writeFileSync(destination,bytes,{mode:0o600});
  }
  return snapshot;
}

export function verifyRemote(manifest,result){
  const rows=Array.isArray(result)?result:result.rows;
  assert.ok(Array.isArray(rows),'Expected Supabase JSON rows');
  assert.equal(rows.length,manifest.tables.length);
  for(const table of manifest.tables){
    const actual=rows.find(row=>row.name===table.name);assert.ok(actual,'Missing remote table '+table.name);
    assert.equal(Number(actual.count),table.count,'Remote row count differs: '+table.name);
    assert.equal(actual.sha256,table.sha256,'Remote content differs: '+table.name);
  }
  return {tables:rows.length,rows:rows.reduce((sum,row)=>sum+Number(row.count),0),verified:true};
}

export function parseCliJSON(bytes){
  // Windows PowerShell 5 redirects native stdout as UTF-16LE; PowerShell 7 uses UTF-8.
  const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  const encoding=buffer[0]===0xff&&buffer[1]===0xfe?'utf16le':'utf8';
  return JSON.parse(buffer.toString(encoding).replace(/^\uFEFF/,''));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const output=path.join(project,'.superdesign','supabase-transfer');
  if(process.argv[2]==='prepare'){
    const snapshot=prepareTransfer(path.join(project,'.local-data'),output);
    console.log(JSON.stringify({snapshotHash:snapshot.snapshotHash,tables:snapshot.tables.map(({name,count})=>({name,count})),files:snapshot.manifest.assets.length,networkRequests:0}));
  }else if(process.argv[2]==='verify'&&process.argv[3]){
    const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'));
    console.log(JSON.stringify(verifyRemote(manifest,parseCliJSON(fs.readFileSync(process.argv[3])))));
  }else throw new Error('Use: node scripts/supabase-transfer.mjs prepare | verify <remote-json-file>');
}
