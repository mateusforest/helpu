import {randomBytes, timingSafeEqual} from 'node:crypto';

export function createAccount({db, userFrom, safeOrigin, json, readBody, session, tokenFrom, hashToken, scrypt, limited}) {
  const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
  return async function handleAccount(req,res,pathname){
    if(!pathname.startsWith('/api/account'))return false;
    const user=await userFrom(req);
    if(!user)fail('Entre para acessar sua conta.',401);
    if(req.method==='GET'&&pathname==='/api/account'){
      const rows=await db.prepare('SELECT expires_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY expires_at DESC').all(user.id,Date.now());
      json(res,200,{user:{name:user.name,email:user.email},security:{activeSessions:rows.length}});
      return true;
    }
    if(req.method!=='POST')fail('Método não permitido.',405);
    if(!safeOrigin(req))fail('Origem não permitida.',403);
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail('Formato de envio inválido.',415);
    const input=await readBody(req);
    if(!input||typeof input!=='object'||Array.isArray(input))fail('Dados inválidos.');
    if(pathname==='/api/account/profile'){
      const name=typeof input.name==='string'?input.name.trim():'';
      if(name.length<2||name.length>100)fail('Informe um nome de 2 a 100 caracteres.');
      await db.prepare('UPDATE users SET name=? WHERE id=?').run(name,user.id);
      json(res,200,{user:{name,email:user.email}});return true;
    }
    if(pathname==='/api/account/sessions/revoke'){
      const result=await db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(user.id,hashToken(tokenFrom(req)));
      json(res,200,{revoked:result.changes});return true;
    }
    if(pathname==='/api/account/password'){
      if(await limited('change-password:'+user.id,6))fail('Muitas tentativas. Aguarde alguns minutos.',429);
      const old=typeof input.currentPassword==='string'?input.currentPassword:'',next=typeof input.newPassword==='string'?input.newPassword:'';
      if(old.length<10||old.length>128||next.length<10||next.length>128)fail('Use uma senha de 10 a 128 caracteres.');
      if(old===next)fail('Escolha uma senha diferente da atual.');
      const row=await db.prepare('SELECT salt,password_hash FROM users WHERE id=?').get(user.id);
      const supplied=await scrypt(old,row.salt,64);
      if(!timingSafeEqual(supplied,Buffer.from(row.password_hash,'hex')))fail('A senha atual está incorreta.',400);
      const salt=randomBytes(16).toString('hex'),passwordHash=(await scrypt(next,salt,64)).toString('hex');
      await db.exec('BEGIN IMMEDIATE');
      try{
        const changed=await db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=? AND password_hash=?').run(salt,passwordHash,user.id,row.password_hash);
        if(changed.changes!==1)fail('A senha mudou durante a solicitação. Entre novamente.',409);
        await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
        await session(res,user.id);
        await db.exec('COMMIT');
      }catch(e){await db.exec('ROLLBACK');throw e;}
      json(res,200,{ok:true});return true;
    }
    fail('Recurso não encontrado.',404);
  };
}
