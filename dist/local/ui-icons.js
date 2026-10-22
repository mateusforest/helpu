const paths={
 heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 arrow:'<path d="M7 17 17 7M7 7h10v10"/>',back:'<path d="m12 5-7 7 7 7M5 12h14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 home:'<path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/>',bag:'<path d="M5 7h14l1 14H4L5 7ZM8 7V6a4 4 0 0 1 8 0v1"/>',
 store:'<path d="M3 10 5 3h14l2 7M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 13v8h14v-8M10 21v-6h4v6"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2"/>',
 food:'<path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 9 0 10"/>',
 shirt:'<path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0Z"/>',
 tool:'<path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z"/>',
 plane:'<path d="m22 2-7 20-4-9-9-4L22 2ZM11 13 22 2"/>',
 car:'<path d="m4 10 2-6h12l2 6M3 10h18v8H3ZM6 18v3m12-3v3M6 14h2m8 0h2"/>',
 bed:'<path d="M3 18v3m18-3v3M3 18h18v-6H3ZM5 12V4h14v8M5 8h14m-7-4v8"/>',
 spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
 health:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
 book:'<path d="M12 5C9 3 6 3 3 4v16c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v16"/>',
 ball:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M6 5c8 5 8 9 0 14M18 5c-8 5-8 9 0 14"/>',
 paw:'<ellipse cx="5" cy="9" rx="2" ry="3"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5" rx="2" ry="3"/><ellipse cx="21" cy="10" rx="2" ry="3"/><path d="M7 16c3-6 7-6 10 0 4 5-1 6-5 4-4 2-9 1-5-4Z"/>',
 monitor:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-4 0h8"/>',
 compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',
 grid:'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
 receipt:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM8 8h8m-8 4h8m-8 4h4"/>',pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',check:'<path d="m5 12 4 4L19 6"/>'
};
export function icon(name){return `<svg class="ui-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.grid}</svg>`;}
export const categoryIconNames={'Para você':'home',Gastronomia:'food',Compras:'bag',Moda:'shirt','Serviços':'tool',Eventos:'calendar',Viagens:'plane','Automóveis':'car',Hospedagem:'bed','Beleza e bem-estar':'spark','Saúde':'health','Educação':'book',Esportes:'ball',Pets:'paw','Casa e construção':'home','Imobiliárias':'home',Tecnologia:'monitor','Experiências':'compass',Outro:'grid'};
// Only interface controls are decorated; business descriptions and other user content stay intact.
const glyphs={'↗':'arrow','←':'back','×':'close','✦':'spark','♡':'heart','♥':'heart'};
function decorate(root){
 const controls=[...(root.matches?.('a,button,[data-icon],.empty-symbol,.assistant-orb')?[root]:[]),...root.querySelectorAll('a,button,[data-icon],.empty-symbol,.assistant-orb')];
 for(const el of controls){if(el.dataset.icon){el.innerHTML=icon(el.dataset.icon);delete el.dataset.icon;continue;}for(const n of [...el.childNodes])if(n.nodeType===3&&/[↗←×✦♡♥]/u.test(n.textContent)){const fragment=document.createDocumentFragment();for(const part of n.textContent.split(/([↗←×✦♡♥])/u)){if(glyphs[part]){const t=document.createElement('template');t.innerHTML=icon(glyphs[part]);fragment.append(t.content);}else fragment.append(document.createTextNode(part));}n.replaceWith(fragment);}}
}
decorate(document.body);new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1)decorate(n);}).observe(document.body,{childList:true,subtree:true});
