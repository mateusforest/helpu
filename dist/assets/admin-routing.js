const views=new Set(['admin','consultations-admin','commercial','pricing','intelligence']);
export function adminDestination(operator,href){
 if(!operator)return null;
 const url=new URL(href),view=url.hash.replace(/^#\//,'');
 if(views.has(view))return 'admin.html#/'+view;
 if(!url.hash&&!url.searchParams.has('connection')&&!url.searchParams.has('company')&&url.searchParams.get('mode')!=='client')return 'admin.html';
 return null;
}
