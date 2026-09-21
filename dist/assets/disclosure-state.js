// State belongs to one company and route, never to the next customer's screen.
export function createDisclosureState(){
 const pages=new Map();let current=null;
 const keys=root=>{const seen=new Map();return [...root.querySelectorAll('details')].map(el=>{const summary=el.querySelector(':scope > summary');const label=el.dataset.disclosure||el.id||summary?.querySelector('strong')?.textContent||summary?.textContent||'';const n=seen.get(label)||0;seen.set(label,n+1);return [label+'#'+n,el];});};
 return {replace(root,html,scope){
  if(current!==null)pages.set(current,new Map(keys(root).map(([key,el])=>[key,el.open])));
  current=scope;root.innerHTML=html;const saved=pages.get(scope);
  if(saved)for(const [key,el]of keys(root))if(saved.has(key))el.open=saved.get(key);
 }};
}
