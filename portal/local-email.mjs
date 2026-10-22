export function createLocalEmail({env=process.env, fetcher=fetch}={}) {
  const key=env.RESEND_API_KEY?.trim(), from=env.HELPU_EMAIL_FROM?.trim();
  const baseUrl=env.HELPU_PUBLIC_URL || 'https://www.helpumkt.com';
  let origin;
  try { const u=new URL(baseUrl); if(u.protocol==='https:' || u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)) origin=u.origin; } catch {}
  const configured=!!(key && from && origin);
  return {configured, origin,
    async send({to,subject,text}) {
      if(!configured) throw Object.assign(Error('O envio de e-mails ainda não foi ativado. Entre em contato com a Helpu para recuperar seu acesso.'),{status:503});
      const response=await fetcher('https://api.resend.com/emails',{method:'POST',
        headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
        body:JSON.stringify({from,to:[to],subject,text}),signal:AbortSignal.timeout(10000)});
      if(!response.ok) throw Object.assign(Error('Não foi possível enviar o e-mail agora. Tente novamente mais tarde.'),{status:503});
    }};
}
