# Atendimento manual no número oficial

Área: `admin.html#/whatsapp`. Exclusiva dos operadores já autorizados. Usa a conexão Cloud API e o webhook existentes; não registra novamente o número, não migra para aplicativo Business e não exige coexistência.

## Ativação e comportamento

- A caixa começa desativada. Depois de publicar e entrar no administrativo, a equipe seleciona **Ativar caixa de atendimento**.
- Pessoas sem vínculo podem conversar com a equipe sem ter conta na Helpu. Só mensagens recebidas depois da ativação ficam nesta caixa.
- Clientes com vínculo confirmado continuam no Astra até a equipe selecionar **Assumir atendimento**. O histórico anterior permanece na conversa do cliente.
- Durante o atendimento, novos textos/anexos ficam na caixa manual. Respostas e entregas do Astra aguardam a retomada. Trabalhos já iniciados continuam; um envio já aceito pela Meta não pode ser recolhido.
- **Devolver ao Astra** exige vínculo ativo e confirmação. Não transforma a conversa manual em pedidos de geração.
- Código `HELPU …` continua exclusivo do fluxo de confirmação e não aparece na caixa. Cadastro e boas-vindas não ativam o vínculo.
- Contatos, mensagens e arquivos são administrativos. Anexos não entram na biblioteca de criação da empresa e não podem ser lidos por clientes.
- Janela de 24h aberta: texto, PNG/JPG, PDF e MP4 até 3 MB. Anexos recebidos são baixados pelo worker; formatos suportados pelo receptor incluem áudio. A tela atualiza a cada 15 segundos preservando rascunhos.
- Fora da janela: somente modelos previamente aprovados/configurados e autorização documentada do contato. A caixa não inclui campanhas nem disparo em massa.
- `SAIR`, `PARAR`, `DESATIVAR`, `STOP` e `CANCELAR` bloqueiam novos envios manuais. Esta primeira versão não remove o bloqueio manualmente.
- Cada envio tem identificador único; timeouts ficam **sem confirmação**, sem repetição automática. Confira antes de iniciar outra mensagem. “Aceita pela Meta” não é confirmação de entrega; recibos assinados atualizam entregue/lida.

## Modelos para iniciar atendimento

Configurar `HELPU_WHATSAPP_MANUAL_TEMPLATES_JSON` na hospedagem com modelos de corpo textual aprovados na Meta (sem cabeçalho dinâmico ou botões dinâmicos). Exemplo de configuração, não aprovação real:

```json
[{"name":"helpu_atendimento","language":"pt_BR","parameters":1,"label":"Iniciar atendimento","text":"Olá, {{1}}. Aqui é a equipe Helpu. Podemos conversar sobre o seu interesse?"}]
```

O texto e os campos devem corresponder ao modelo aprovado. Sem essa configuração, respostas livres dentro da janela continuam disponíveis. As credenciais já existentes do canal são reaproveitadas e nunca são exibidas na tela.

## Boas-vindas personalizada

Criar/aprovar um novo modelo na Meta, com dois parâmetros no corpo: nome do usuário e nome da empresa. Depois configurar `HELPU_WHATSAPP_WELCOME_TEMPLATE_V2` com seu nome, por exemplo `helpu_boas_vindas_v2`. O idioma usa `HELPU_WHATSAPP_WELCOME_LANGUAGE`, padrão `pt_BR`.

Texto aprovado pelo usuário, também exportado como `WELCOME_TEMPLATE_TEXT` em `portal/whatsapp-welcome.mjs`:

> Olá, {{1}}! Seja bem-vindo à Helpu. 🧡
>
> Obrigado por escolher a Helpu para esta nova fase da {{2}}.
>
> Vamos construir um marketing mais claro, ágil e com a identidade do seu negócio — usando tecnologia para aproveitar melhor seu tempo e seu investimento.
>
> Para começar, acesse o portal e apresente sua empresa ao Astra.
>
> Quer pedir conteúdos e receber suas prévias por aqui? No portal, abra *Conversa → Expandir para WhatsApp* e conclua a ativação.
>
> Quando precisar de atendimento da nossa equipe, é só chamar.
>
> Seu marketing começa aqui.

O envio exige autorização explícita no cadastro, é processado pelo worker e tem prazo de 24h. Não promete entrega instantânea nem reenvia cadastros antigos já atendidos. A configuração legada `HELPU_WHATSAPP_WELCOME_TEMPLATE` continua funcionando sem parâmetros quando a V2 não está configurada. Não substituir o texto de um modelo antigo sem aprovação da Meta.

## Pagamento: situação encontrada e proposta separada

O código atual possui cobrança manual com boleto/anexo e comprovante em conferência. A equipe confirma o recebimento bancário antes de marcar como pago. Um plano oferecido exige aceite e pagamento confirmado para ativação do período; não basta o cliente anexar comprovante.

Também existe integração Stripe, dependente de chaves, URL pública, preços e webhooks válidos. Sua presença no código não comprova configuração ativa em produção nem liberação automática dos dois planos comerciais. O catálogo Stripe atual tem uma assinatura e serviços avulsos; deve ser alinhado ao catálogo final antes de vender pelo checkout.

**Lacuna atual:** empresas sem assinatura comercial ainda podem gerar sob os limites internos de teste. Não existe um teste comercial claramente delimitado que bloqueie tudo até o pagamento. Esta entrega não altera essa regra, preços, franquias ou contas de teste.

Proposta para decisão: cadastro gratuito para configurar empresa e marca; pagamento mensal antecipado libera produção no período contratado; renovação antecipada; consultorias avulsas pagas antes do início; extras com preço e aceite explícitos entram na próxima cobrança conforme o acordo anterior. Pagamento do mês e consumo da franquia são eventos diferentes: a franquia continua debitada na aprovação da entrega.

Antes da abertura comercial, implementar o bloqueio de produção sem plano pago, definir exceções de teste da equipe, conferir renovação/atraso e ligar os preços corretos ao checkout escolhido. O caminho manual Sicredi permite começar com conferência humana; o Stripe pode reduzir o trabalho após fechar essa integração.

## Validação e publicação

Testes usam provedores simulados; nenhum destinatário real recebe mensagens. Cobrem SQLite e PostgreSQL, isolamento, janela, consentimento, deduplicação, timeout, recibos, anexos, pausa/retomada e boas-vindas personalizada/legada. Teste de navegador cobre desktop e telas de 390/320 px, envio e preservação do rascunho. Publicação e aprovação dos modelos são etapas distintas da implementação local.
