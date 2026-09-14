import {readableTerm} from './labels.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states={requested:'Pedido recebido',understanding:'Entendendo seu pedido',undertanding:'Entendendo seu pedido',planning:'Organizando os próximos passos',producing:'Preparando sua criação',reviewing:'Conferindo os detalhes',awaiting_approval:'Aguardando sua aprovação',ready:'Pronto para o próximo passo',scheduled:'Agendado',executing:'Executando seu pedido',verifying:'Conferindo o resultado',completed:'Concluído',measuring:'Acompanhando os resultados',learned:'Aprendizado registrado',blocked:'Preciso de um ajuste para continuar',uncertain:'O resultado precisa de conferência',failed:'Não foi possível concluir',cancelled:'Pedido cancelado',canceled:'Pedido cancelado'};
const steps={todo:'A fazer',doing:'Em andamento',done:'Concluído',approved:'Aprovado'};
export const operationLabel=value=>states[value]||steps[value]||readableTerm(value)||'Atualizando seu pedido';
export function eventLabel(event){
 const label=String(event?.label||'');
 const transition=event?.kind==='operation_transition'?event.detail?.to:null;
 const legacy=/^Operação:\s*([\w-]+)\.?$/i.exec(label);
 if(transition||legacy)return states[transition||legacy[1]]||'Atualizando seu pedido';
 if(states[label])return states[label];
 if(label.startsWith('Helpu Executive:'))return 'Preparando sua criação';
 return label||'Organizando os próximos passos';
}
function safeHref(raw){
 if(/[\s\u0000-\u001f\u007f\\]/.test(raw))return null;
 if(raw.startsWith('#')||/^\/(?!\/)/.test(raw))return raw;
 try{const u=new URL(raw);if(['https:','http:','mailto:'].includes(u.protocol)&&!u.username&&!u.password)return u.href;}catch{}
 return null;
}
// A deliberately small Markdown subset: all source text is escaped, never treated as HTML.
// Images/HTML are not loaded, and links cannot use script, data or filesystem protocols.
function inline(source,depth=0){
 if(depth>8)return escape(source);
 const token=/(`+)([^`\n]+)\1|\*\*([\s\S]+?)\*\*|__([^\n]+?)__|\*([^*\n]+)\*|(?<!\w)_([^_\n]+)_(?!\w)|~~([^\n]+?)~~|(?<!!)\[([^\]\n]+)\]\(([^\s)]+)\)/g;
 let result='',last=0;
 for(const m of source.matchAll(token)){
  result+=escape(source.slice(last,m.index));last=m.index+m[0].length;
  if(m[1])result+='<code>'+escape(m[2])+'</code>';
  else if(m[3]||m[4])result+='<strong>'+inline(m[3]||m[4],depth+1)+'</strong>';
  else if(m[5]||m[6])result+='<em>'+inline(m[5]||m[6],depth+1)+'</em>';
  else if(m[7])result+='<del>'+inline(m[7],depth+1)+'</del>';
  else {const href=safeHref(m[9]);result+=href?'<a href="'+escape(href)+'"'+(/^https?:/.test(href)?' target="_blank" rel="noopener noreferrer"':'')+'>'+inline(m[8],depth+1)+'</a>':escape(m[0]);}
 }
 return result+escape(source.slice(last));
}
const bullet=line=>/^\s*(?:([-+*])|(\d{1,9})[.)])\s+(.+)$/.exec(line);
const fence=line=>/^\s*(`{3,}|~{3,})([^\s]*)\s*$/.exec(line);
const tableRule=line=>/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(x=>x.trim());
export function renderChatText(value){
 const lines=String(value??'').replace(/\r\n?/g,'\n').split('\n'),html=[];
 for(let i=0;i<lines.length;){
  const line=lines[i];if(!line.trim()){i++;continue;}
  const code=fence(line);
  if(code){const text=[];i++;while(i<lines.length&&!new RegExp('^\\s*'+code[1][0]+'{'+code[1].length+',}\\s*$').test(lines[i]))text.push(lines[i++]);if(i<lines.length)i++;html.push('<pre><code>'+escape(text.join('\n'))+'</code></pre>');continue;}
  const heading=/^\s{0,3}#{1,6}\s+(.+)$/.exec(line);
  if(heading){html.push('<h3>'+inline(heading[1].replace(/\s+#+\s*$/,''))+'</h3>');i++;continue;}
  if(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){html.push('<hr>');i++;continue;}
  if(/^\s*>/.test(line)){const quote=[];while(i<lines.length&&/^\s*>/.test(lines[i]))quote.push(lines[i++].replace(/^\s*>\s?/,''));html.push('<blockquote>'+quote.map(x=>inline(x)).join('<br>')+'</blockquote>');continue;}
  if(line.includes('|')&&i+1<lines.length&&tableRule(lines[i+1])){
   const titles=cells(line),rows=[];i+=2;while(i<lines.length&&lines[i].includes('|')&&lines[i].trim())rows.push(cells(lines[i++]));
   html.push('<div class="chat-table"><table><thead><tr>'+titles.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+titles.map((_,j)=>'<td>'+inline(row[j]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue;
  }
  const item=bullet(line);
  if(item){const ordered=!!item[2],tag=ordered?'ol':'ul',items=[];while(i<lines.length){const next=bullet(lines[i]);if(!next||!!next[2]!==ordered)break;const text=[next[3]];i++;while(i<lines.length&&lines[i].trim()&&!bullet(lines[i])&&!fence(lines[i])&&!/^\s*#{1,6}\s/.test(lines[i])&&!/^\s*>/.test(lines[i]))text.push(lines[i++].trim());items.push('<li>'+inline(text.join('\n')).replaceAll('\n','<br>')+'</li>');}html.push('<'+tag+(ordered?' start="'+Number(item[2])+'"':'')+'>'+items.join('')+'</'+tag+'>');continue;}
  const paragraph=[line];i++;
  while(i<lines.length&&lines[i].trim()&&!bullet(lines[i])&&!fence(lines[i])&&!/^\s*(?:#{1,6}\s|>|-{3,}\s*$)/.test(lines[i])&&!(lines[i].includes('|')&&tableRule(lines[i+1]||'')))paragraph.push(lines[i++]);
  html.push('<p>'+inline(paragraph.join('\n')).replaceAll('\n','<br>')+'</p>');
 }
 return html.join('');
}
