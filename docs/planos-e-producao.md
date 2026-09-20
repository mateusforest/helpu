# Planos, produção e extras

## Áreas

- Cliente: **Minha empresa → Meu plano** (`portal.html#/commerce`).
- Administração: **Planos e produção** (`admin.html#/commerce`).
- Consultoria: **Consultorias**, serviço Diagnóstico e Estratégia.
- Cobranças e comprovantes: **Financeiro**.

## Oferta implementada

Essencial: R$690/mês; Assistido: R$990/mês. Ambos incluem oito imagens e quatro vídeos de até 30 segundos, uma rodada de ajustes por entrega e configuração inicial de marca/calendário. O Assistido inclui revisão e publicação pela equipe em um perfil, pelo fluxo existente de autorização da Publicação assistida. Publicação não é executada automaticamente pelo novo módulo.

Extras Essencial/Assistido: imagem R$59/R$79, carrossel de até cinco páginas R$149/R$189, vídeo até 30 segundos R$179/R$229. Adaptação de Feed para Story ou vice-versa: R$29, preservando uma arte aprovada. Carrosséis são extras, não oito imagens independentes. Novo conceito não é uma adaptação.

Diagnóstico e Estratégia: R$990, pagamento único; diagnóstico dos canais, até três concorrentes, posicionamento, plano de 30 dias, apresentação e uma rodada de esclarecimentos. Cinco dias úteis após briefing completo, com as regras e condições confirmadas na proposta.

## Ativação do cliente

1. A equipe seleciona a empresa, oferece o plano e informa o período e as condições de renovação, cancelamento e saldo.
2. O responsável da empresa aceita a proposta em Meu plano.
3. A equipe cadastra a mensalidade no Financeiro e confere o recebimento.
4. A equipe ativa o período vinculando a cobrança paga. Pagamento de teste e recebimento já usado em outro período não ativam um novo período.

Não há inscrição, desconto, cobrança externa ou migração automática das empresas existentes. Empresas ainda sem proposta mantêm o comportamento anterior de testes. Para aplicar a franquia comercial, ofereça e ative o período da empresa. Limites técnicos de Autonomia e a cota do fornecedor permanecem independentes; a equipe deve configurá-los para comportar a produção contratada.

## Planejamento e produção

O cliente escolhe sob demanda, planejamento do mês ou misto. A escolha registra a preferência; não inicia geração sozinha.

Preparar calendário propõe uma distribuição editável a partir do briefing informado. Cliente ou equipe revisa temas, datas, duração e materiais. O cliente aprova o planejamento e o botão Produzir itens pendentes envia os pedidos para a fila existente. Legendas e arquivos são gerados nessa etapa; as prévias continuam exigindo aprovação na Biblioteca. As datas são salvas no Calendário e exibidas no fuso do navegador.

O saldo é reservado antes da fila, separado entre imagens e vídeos. Repetir a mesma solicitação não duplica a reserva. Falha confirmada devolve saldo; processamento incerto mantém reserva até conferência. A rodada incluída mantém o briefing e os materiais originais. Rodadas adicionais precisam de orçamento individual.

## Extras e financeiro

Sem saldo, um orçamento é criado sem iniciar geração. O cliente vê o preço e a previsão da próxima mensalidade, e autoriza individualmente em Meu plano. No chat, também pode responder exatamente com o comando de confirmação mostrado no orçamento. A autorização registra responsável e data. Conversar não consome a franquia de entregas.

O acompanhamento de saldo reconcilia as execuções. Somente extras com arquivo entregue ficam disponíveis para faturamento. Falhas não são cobradas. A equipe fecha os extras no Financeiro, podendo incluir a próxima mensalidade; cada extra só pode entrar em uma cobrança. O registro não emite boleto no banco nem realiza débito automático. Comprovantes e confirmação bancária seguem o fluxo financeiro existente.

## Validação

`tests/commerce.test.mjs` cobre SQLite e PostgreSQL: isolamento, aceite, pagamento, reserva, idempotência, liberação por falha, preço exato, faturamento único, revisão e planejamento. `tests/commerce-visual.mjs` usa contas fictícias para verificar oferta/aceite e telas em 1440, 390 e 320 pixels, sem chamar fornecedores de geração ou emitir cobranças reais.
