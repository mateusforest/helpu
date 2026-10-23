// Activate only after helpulocal.com and its isolated database have been verified.
export function localSeparation(pathname, method, env=process.env) {
  if(env.HELPU_LOCAL_SEPARATED!=='true')return null;
  const publicPage=pathname==='/local'||pathname.startsWith('/local/');
  const localApi=pathname.startsWith('/api/local/')||/^\/api\/portal\/local-(?:admin|admin-photo|products|control|launch)$/.test(pathname);
  if(!publicPage&&!localApi)return null;
  const destination='https://helpulocal.com'+(publicPage?pathname.replace(/^\/local(?:\/|$)/,'/'):pathname);
  return {status:['GET','HEAD'].includes(method)?308:410,destination};
}
