# Produção institucional da EME — verificação de 11/09/2026

**Estado real: `blocked_missing_brand_assets`. Nenhuma imagem foi gerada, composta, aprovada ou publicada nesta rodada.** Também foi comprovado `blocked_higgsfield_not_configured`. A entrega utilizada continua sendo a proposta institucional existente.

| Item solicitado | Resultado verificado |
| --- | --- |
| 1. Commit inicial | `469435eb4b12060b89cd8ddccfcf27ff8a8ca3c4`. Projeto principal: `C:\Users\mateu\Downloads\Helpu2.0`. |
| 2. Árvore inicial | 19 arquivos modificados e 7 não rastreados; lista abaixo. Nenhuma alteração anterior foi descartada. |
| 3. Problemas encontrados | A rotina diária podia solicitar novos conteúdos com três entregas pendentes. As entregas não tinham vínculo com uma ordem ou tarefa, embora sua execução criativa de origem estivesse registrada. Faltavam arquivos oficiais de marca e credenciais Higgsfield. A revisão genérica de conteúdo não comprovava uma peça visual final. |
| 4. Problemas corrigidos | Priorização local antes da chamada de IA; associação das três entregas à execução de origem sem duplicá-las; uma tarefa para a peça institucional; diagnóstico persistido, versionado e idempotente; instruções de materiais no Estúdio; proteção contra geração, publicação e aprovação do conceito bloqueado; retomada conserva o bloqueio específico. |
| 5. Regressões visuais | Ao trocar de modal, o scroll anterior escondia os primeiros campos. A navegação inferior podia avançar sob o botão de mais áreas. Ambos corrigidos. Quebras de linha literais dos briefings foram tratadas apenas na apresentação. Layout conferido no Chrome, em desktop e mobile. |
| 6. Rotina diária | Ativa, limite de oito execuções de inteligência por dia preservado. Com as três entregas atuais, registra `pending_work`, informa a necessidade de concluí-las e não chama IA para criar outra frente. Também verifica jobs ativos/incertos, ordens, tarefas e resultados não medidos. Não existe novo agendador. |
| 7. Entrega utilizada | **Posicionamento institucional — declaração clara**, ID `001ecb6e-910a-4c54-a883-c399c83736b2`. Carrossel e Reels preservados. Não havia campanha vinculada; nenhuma campanha foi inventada para preencher esse campo. |
| 8. Materiais da EME | Consultados o contexto registrado, público de corretores, posicionamento, tom, restrições, frase central e direção visual existentes. Nenhum arquivo oficial de logo ou fonte estava cadastrado. A indicação “verde” não fornecia a paleta exata. Nenhuma identidade da Helpu foi aplicada à EME. |
| 9. Executor escolhido | Caminho de API Higgsfield, aproveitando o adaptador e o cofre existentes. Estado `not_configured`; nenhum segundo caminho de execução foi implementado. |
| 10. Conta confirmada | Nenhuma conta Higgsfield confirmada. Não havia credenciais Higgsfield registradas nem perfil Higgsfield validado. |
| 11. Identificador da geração | Inexistente. `293f87bb-f0f2-43a0-85cc-0461cf523b73` é o job criativo anterior que produziu os três conceitos; **não é uma geração de imagem**. |
| 12. Estado da geração | Não iniciada. Não houve solicitação, polling, download nem cobrança de geração nesta rodada. |
| 13. Arquivo-base | Não produzido. |
| 14. Arquivo final | Não produzido. |
| 15. Dimensões | Solicitadas: 1080 × 1080 pixels. Nenhum arquivo existe para confirmar dimensões reais. |
| 16. Formato | Solicitado: uma imagem estática PNG ou JPG. Nenhum formato final verificado. |
| 17. Tamanho | Não aplicável: não há arquivo-base ou final. |
| 18. Hash | Não há hash de imagem. Hash do briefing preservado: `3a32929360aea4f15b372c2444505a45d8ae49a86a228a242db3277667292b91`. |
| 19. Versão | Verificação de produção v1. Registro de conteúdo v1 → v2 apenas pela associação à ordem; título, texto, direção visual, formato, canal e campanha preservados. Não há versão de peça final. |
| 20. Revisões | Verificados origem, dependências, integridade do banco, consistência dos vínculos e ausência de alterações no conteúdo comercial. Revisões técnica de imagem, textual final, factual final, visual por IA e visual humana da peça: não realizadas, pois não há peça. |
| 21. Aprovação humana | Não solicitada e não concedida. Aprovação de conceito não é aceita como aprovação de arquivo final. |
| 22. Estado final | `blocked_missing_brand_assets`. Não foi usado `asset_ready_verified`. |
| 23. Bloqueios exatos | Faltam logo oficial com versão confirmada, paleta exata e arquivo da fonte oficial; Higgsfield sem configuração. Registrado também `blocked_production_review_required`: confirmar texto final, uso/remoção de “Saiba como” e direção da imagem-base. |
| 24. Ainda não validado | Adaptador Higgsfield em conta real; contrato completo de job assíncrono para esta peça; composição determinística; exportação final; revisão visual por IA; aprovação humana vinculada ao hash da imagem. A especificação preserva o briefing, mas declara texto, margens e área segura ainda pendentes. Não foi criado um compositor sem os materiais necessários. |
| 25. Testes | Baseline: 121/121. Final: 135/135, preservando os anteriores. Sintaxe: 38 arquivos. Diagnóstico local: todos os itens passaram. Inspeção estrutural das 17 áreas preservada. Smoke visual: 27 capturas; inspeção adicional do Estúdio e áreas críticas: 33 capturas, zero erros de JavaScript e zero transbordamentos horizontais medidos. |
| 26. Evidências reais | Verificação e leitura posterior no banco da EME; evidência local `a5431498-5f3c-40b3-822b-f22257c481ee`; registros da ordem, tarefa e conversa; decisão da rotina diária; hashes antes/depois; `PRAGMA quick_check = ok`; relatórios e capturas locais indicados abaixo. |

## Operação e preservação dos dados

A origem comprovada no `output.recordIds` do job criativo foi reutilizada. Como aquele job ainda não possuía ordem nem conversa operacional, foi criada uma única ordem usando o Operating Kernel existente, e as três entregas foram vinculadas a ela. Foi acrescentada uma tarefa para a imagem institucional, sem criar outro conteúdo.

- Ordem: `596e86c8-6495-4611-a14b-f50b9b4c1d1f`.
- Conversa: `8f5c01f2-f5d0-4ee3-8af3-61d4a5432c7c`.
- Verificação: `studio:001ecb6e-910a-4c54-a883-c399c83736b2:v1`, no armazenamento de metadados existente.
- Carrossel preservado: `b2b96ac3-07a2-48a3-b687-ce8cb8fe4975`.
- Reels preservado: `82666e10-bcfe-4d89-89e8-7c624a0bd6ea`.

Conversa, Estúdio, tarefa e Atividades consultam esses vínculos. Não foram criadas publicações no Calendário nem métricas em Resultados. Integrações continua informando que Higgsfield não está configurado. Autonomia apresenta a prioridade das entregas pendentes.

| Verificação antes/depois do registro real | Antes | Depois |
| --- | --- | --- |
| Conteúdos | 3 | 3 |
| Arquivos | 0 | 0 |
| Jobs | 6 | 6 |
| Reservas de consumo | 3 | 3 |
| Hash dos campos comerciais dos três conteúdos | `84888a82754df8c768ab88caaefedf981177f1d56866c976b2e3ccf179c98e4a` | Igual |

O banco foi acessado pelo módulo existente apenas para registrar o diagnóstico e seus vínculos. `.local-data/` foi preservada. Credenciais, cookies, tokens, perfis, banco, WAL, arquivos privados e capturas não fazem parte do commit.

O servidor continua local em `127.0.0.1:4173`. O supervisor `scripts/dev.mjs` recarregou o backend após a edição. O banco confirmou a decisão `pending_work` do servidor ativo. Os novos recursos estáticos responderam HTTP 200; o portal sem sessão respondeu HTTP 302 para autenticação, como esperado. Isso não foi apresentado como validação de login ou de executor externo.

## Intervenção necessária para continuar

| Tela | Botão/campo | Ação necessária | Estado esperado |
| --- | --- | --- | --- |
| Estúdio criativo | Enviar arquivo | Enviar o logo oficial em PNG, JPEG ou WebP e o arquivo oficial da Geist em WOFF2, TTF ou OTF. | Arquivos privados associados à EME, ainda sem aprovação da peça. |
| Estúdio criativo | Materiais oficiais | Selecionar os arquivos, informar família tipográfica e cores exatas de fundo, texto e destaque em `#RRGGBB`; confirmar que são oficiais. | Bloqueio de materiais removido se arquivos e dados forem válidos; demais bloqueios permanecem. |
| Integrações → Higgsfield | Configurar | Informar identificador e segredo da API nos campos protegidos do portal. Não enviar segredos pela conversa. | Credencial salva; executor ainda não validado. |
| Estúdio → proposta institucional | Produção visual | Conferir briefing e definir o texto final, o uso ou remoção de “Saiba como” e a direção da imagem-base. | Decisões registráveis na mesma entrega, sem alterar silenciosamente o conceito. |

Depois dos materiais e da configuração, ainda é necessário validar o executor e completar a especificação e a composição antes de iniciar uma geração real explicitamente pela interface. “Registrar verificação” somente atualiza o diagnóstico: não gera imagens. Nenhuma aprovação humana de peça deve ser solicitada antes de existir o arquivo final para avaliação.

## Validação e limites da evidência

Os testes adicionais cobrem prioridade antes da IA, seleção e associação da entrega existente, idempotência, arquivos de outra empresa rejeitados, exigência de confirmação dos materiais, credencial salva diferente de executor validado, bloqueio de aprovação/geração/publicação, pausa/retomada, preservação do histórico após mudança de briefing e persistência após reinício. Testes não iniciam geração real. Não se atribui cobertura de composição final ou aprovação de imagem a esses testes.

A inspeção visual utilizou Chrome real, com banco de teste isolado e cópia somente do contexto comercial e dos três briefings da EME. Não copiou sessões, credenciais ou perfis. Foram inspecionadas Conversa, Visão geral, Contas conectadas, Estúdio e Autonomia em 1440 × 1000 e 390 × 844, estados vazios/preenchidos, modais, busca, menus, navegação, cartões, resposta longa e bloqueio de produção. Estados de aprovação do fluxo já existente também foram exercitados no smoke geral; não equivalem à aprovação real desta peça.

O teste visual antigo precisou de uma correção no texto do fixture: citar EME no pedido enquanto a empresa se chamava “TEST ONLY EME” acionava corretamente o bloqueio de identidade da empresa. A proteção de produção foi mantida. Uma execução de testes dentro do sandbox encontrou `spawn EPERM`; a suíte foi executada novamente com permissão para iniciar processos locais e passou integralmente.

O conteúdo exato do índice também foi exportado para uma pasta isolada e passou nos mesmos 135 testes. A primeira tentativa nessa cópia encontrou `ENOENT` porque o teste de inicialização copia explicitamente `node_modules/playwright-core`; a dependência já instalada foi copiada para o ambiente isolado, sem download, e a execução completa passou.

Evidências locais, mantidas fora do Git:

- [Estado real e evidências da operação](.superdesign/studio-round/real-state.json).
- [Relatório das 33 capturas](.superdesign/studio-round/studio-visual/report.json).
- [Estúdio no desktop](.superdesign/studio-round/studio-visual/filled-studio-1440.png).
- [Estúdio no mobile](.superdesign/studio-round/studio-visual/filled-studio-390.png).
- [Detalhe do bloqueio](.superdesign/studio-round/studio-visual/production-blocked-desktop.png).
- [Materiais oficiais no mobile](.superdesign/studio-round/studio-visual/materials-mobile.png).
- [Smoke visual geral](.superdesign/studio-round/portal-visual/report.json).
- [Resultado dos 135 testes](.superdesign/studio-round/studio-tests.log).
- [Resultado dos 135 testes sobre o conteúdo do commit](.superdesign/studio-round/staged-tests.log).

## Árvore de trabalho inicial e commit

Arquivos inicialmente modificados: `LEIA-ME.md`, `dist/assets/auth.css`, `dist/assets/conversation-ui.js`, `dist/assets/conversation.css`, `dist/assets/portal.css`, `dist/assets/portal.js`, `dist/assets/styles.css`, `dist/cadastro.html`, `dist/conta.html`, `dist/entrar.html`, `dist/index.html`, `dist/portal.html`, `portal/conversation.mjs`, `portal/core.mjs`, `portal/google-presence.mjs`, `portal/kernel.mjs`, `portal/providers.mjs`, `portal/publication.mjs`, `tests/run.mjs`.

Arquivos inicialmente não rastreados: `REVISAO-OPERACIONAL.md`, `dist/assets/helpu-symbol.svg`, `dist/assets/helpu-wordmark.svg`, `dist/assets/portal-brand.css`, `scripts/validate-intelligence.mjs`, `tests/conversation-ui.test.mjs`, `tests/operation-regressions.test.mjs`.

O commit solicitado é `feat(studio): activate verified creative production`, sem push. Ele inclui as correções operacionais preexistentes necessárias para conservar os 121 testes e as mudanças desta rodada. As alterações anteriores de landing page, autenticação e identidade do cabeçalho permanecem na árvore de trabalho. O nome do commit não significa que houve produção visual ou validação externa.
