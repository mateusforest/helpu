import test from 'node:test';
import assert from 'node:assert/strict';
import {renderChatText,eventLabel,operationLabel} from '../dist/assets/chat-format.js';

test('respostas antigas recebem parágrafos, negrito e listas legíveis',()=>{
 const html=renderChatText('Vamos preparar a imagem.\n\n**A direção da peça é:**\n- **Formato:** quadrado, 1080 × 1080 px.\n- **Mensagem:**\n  Você precisa de uma solução.\n\nQual produto vamos divulgar?');
 assert.match(html,/<p>Vamos preparar a imagem\.<\/p>/);
 assert.match(html,/<strong>A direção da peça é:<\/strong>/);
 assert.match(html,/<ul><li><strong>Formato:<\/strong> quadrado/);
 assert.match(html,/<strong>Mensagem:<\/strong><br>Você precisa/);
 assert.match(html,/<p>Qual produto vamos divulgar\?<\/p>/);
 assert.doesNotMatch(html,/\*\*/);
});

test('formatação nunca executa HTML nem carrega imagens ou links perigosos',()=>{
 const source='<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n[clique](javascript:alert) [arquivo](data:text/html,test) [local](file:///C:/private) [entidade](&#106;avascript:alert)\n\n![rastreador](https://example.test/pixel.png)';
 const html=renderChatText(source);
 assert.doesNotMatch(html,/<(?:img|script|iframe)|href=/i);
 assert.match(html,/&lt;img/);
 assert.match(html,/!\[rastreador\]/);
 assert.match(renderChatText('[Biblioteca](#/studio) e [Fonte](https://example.test/?a=1&b=2)'),/href="https:\/\/example.test\/\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer"/);
 assert.match(renderChatText('`<svg onload=x>`'),/<code>&lt;svg onload=x&gt;<\/code>/);
});

test('listas numeradas, tabelas, citações e blocos de código ficam estruturados',()=>{
 assert.match(renderChatText('3. Terceiro\r\n4. Quarto'),/<ol start="3"><li>Terceiro<\/li><li>Quarto<\/li><\/ol>/);
 assert.match(renderChatText('| Dia | Conteúdo |\n| --- | --- |\n| Segunda | **Produto** |'),/<table>.*<th>Dia<\/th>.*<td><strong>Produto<\/strong><\/td>/);
 assert.match(renderChatText('> Uma boa ideia\n> em duas linhas'),/<blockquote>Uma boa ideia<br>em duas linhas<\/blockquote>/);
 assert.equal(renderChatText('```html\n<script>**literal**</script>\n```'),'<pre><code>&lt;script&gt;**literal**&lt;/script&gt;</code></pre>');
 assert.match(renderChatText('## Direção\n\nTexto *leve*'),/<h3>Direção<\/h3><p>Texto <em>leve<\/em><\/p>/);
});

test('eventos novos e históricos traduzem estados sem alterar os dados',()=>{
 for(const label of ['Operação: understanding','Operação: undertanding','understanding'])assert.equal(eventLabel({label}),'Entendendo seu pedido');
 const event={kind:'operation_transition',label:'Operação: planning',detail:{to:'planning'}};
 assert.equal(eventLabel(event),'Organizando os próximos passos');
 assert.equal(event.label,'Operação: planning');
 assert.equal(eventLabel({kind:'operation_transition',detail:{to:'new_code'}}),'Atualizando seu pedido');
 assert.equal(operationLabel('awaiting_approval'),'Aguardando sua aprovação');
 assert.equal(operationLabel('done'),'Concluído');
});
