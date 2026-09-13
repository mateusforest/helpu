import {AsyncLocalStorage} from 'node:async_hooks';
import {DatabaseSync} from 'node:sqlite';
import pg from 'pg';

const tables = ['users','sessions','portal_migrations','companies','memberships','records','integrations','assets','jobs','audit','usage_reservations','conversations','conversation_messages','conversation_events','browser_profiles','auth_attempts','worker_leases'];
const integer = value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds the supported range');
  return number;
};

// Keep the existing parameterized query contracts while using PostgreSQL in production.
// Values never enter SQL text. SQLite remains available only for local development/tests.
export function postgresQuery(sql) {
  let index = 0;
  sql = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, token => token === '?' ? '$' + (++index) : token);
  const ignore = /^INSERT OR IGNORE\b/i.test(sql);
  sql = sql.replace(/^INSERT OR IGNORE\b/i, 'INSERT');
  for (const table of tables) {
    sql = sql.replace(new RegExp('\\b(FROM|JOIN|UPDATE|INTO)\\s+' + table + '\\b','gi'), '$1 helpu.' + table);
  }
  sql = sql.replace(/\b(json_extract|json_each|json_set|json)\s*\(/g, 'helpu.$1(');
  sql = sql.replace(/helpu\.json_set\(([^,]+),\s*('[^']+'),\s*(\$\d+)\)/g, 'helpu.json_set($1,$2,$3::text)');
  sql = sql.replace(/(helpu\.json_extract\([^()]+\))\s*([=<>]+)\s*(\d+)/g, "$1 $2 '$3'");
  sql = sql.replace(/\browid\b/g, 'sequence_id');
  sql = sql.replace(/\bAS\s+([a-z][a-zA-Z]*[A-Z][a-zA-Z]*)\b/g, 'AS "$1"');
  if (ignore) sql += ' ON CONFLICT DO NOTHING';
  if (/^INSERT INTO helpu\.users\b/i.test(sql) && !/\bRETURNING\b/i.test(sql)) sql += ' RETURNING id';
  return sql;
}

export function createDatabase({filename, connectionString, ssl = {rejectUnauthorized:true}, pool: suppliedPool} = {}) {
  const cloud = Boolean(connectionString || suppliedPool);
  const context = new AsyncLocalStorage();
  const raw = cloud ? null : new DatabaseSync(filename);
  const pool = cloud ? suppliedPool || new pg.Pool({
    connectionString, ssl, max:3, idleTimeoutMillis:10000, connectionTimeoutMillis:10000,
    query_timeout:30000, allowExitOnIdle:true,
    types:{getTypeParser:(oid,format)=>oid===20?integer:pg.types.getTypeParser(oid,format)},
  }) : null;
  // SQLite's connection cannot interleave transactions from separate async requests.
  let owner = null, unlocked = Promise.resolve(), unlock;
  async function waitForTransaction(state) {
    while(owner&&owner!==state){
      let timer;
      try {await Promise.race([unlocked,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Local database transaction timed out')),15000);timer.unref();})]);}
      finally{clearTimeout(timer);}
    }
  }
  async function scope(fn) {
    if (context.getStore()) return fn();
    const client = cloud ? await pool.connect() : null;
    const state = {client, transaction:false, automatic:false, savepoints:[]};
    return context.run(state, async () => {
      try { return await fn(); }
      finally {
        if (state.transaction) {
          try { cloud ? await client.query('ROLLBACK') : raw.exec('ROLLBACK'); } catch {}
        }
        if (owner === state) {owner=null;unlock?.();}
        client?.release();
      }
    });
  }
  async function exec(sql) {
    const state = context.getStore();
    if (!state) return scope(() => exec(sql));
    await waitForTransaction(state);
    const begin = /^BEGIN(?: IMMEDIATE)?$/i.test(sql), save = /^SAVEPOINT (\w+)$/i.exec(sql);
    const release = /^RELEASE(?: SAVEPOINT)? (\w+)$/i.exec(sql);
    if (begin || save && !state.transaction) {
      if (!cloud) {owner=state;unlocked=new Promise(resolve=>{unlock=resolve;});}
      state.transaction=true;
      if (save) {if(cloud)await state.client.query('BEGIN');state.automatic=true;}
    }
    if (cloud) await state.client.query(sql.replace(/^BEGIN IMMEDIATE$/i,'BEGIN'));
    else raw.exec(sql);
    if (save) state.savepoints.push(save[1]);
    if (release) {
      const i=state.savepoints.lastIndexOf(release[1]);
      if(i>=0)state.savepoints.splice(i);
      if(!state.savepoints.length && state.automatic){if(cloud)await state.client.query('COMMIT');state.automatic=false;state.transaction=false;}
    }
    if (/^(COMMIT|ROLLBACK)$/i.test(sql)) {state.transaction=false;state.savepoints=[];}
    if (!state.transaction && owner===state) {owner=null;unlock?.();}
  }
  async function query(sql, values, mode) {
    if (!context.getStore()) return scope(() => query(sql,values,mode));
    const state=context.getStore();await waitForTransaction(state);
    if (!cloud) return raw.prepare(sql)[mode](...values);
    const result=await state.client.query(postgresQuery(sql),values);
    if(mode==='all')return result.rows;
    if(mode==='get')return result.rows[0];
    return {changes:result.rowCount,lastInsertRowid:result.rows[0]?.id};
  }
  return {
    dialect:cloud?'postgres':'sqlite',pool,scope,exec,
    prepare:sql=>Object.fromEntries(['get','all','run'].map(mode=>[mode,(...values)=>query(sql,values,mode)])),
    async close(){if(cloud)await pool.end();else raw.close();},
  };
}

export function bindDatabaseScope(db, service,seen=new WeakSet()) {
  if(seen.has(service))return service;seen.add(service);
  for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(service))) {
    if(typeof descriptor.value==='function') descriptor.value=((fn)=>(...args)=>db.scope(()=>fn(...args)))(descriptor.value);
    else if(descriptor.value && typeof descriptor.value==='object' && ['kernel','studio','conversation','browser'].includes(key)) descriptor.value=bindDatabaseScope(db,descriptor.value,seen);
    Object.defineProperty(service,key,descriptor);
  }
  return service;
}
