# F04 — boas-vindas no cadastro

O telefone é opcional e a autorização não vem marcada. Salvar o telefone não verifica sua posse, não cria vínculo de operação e não inscreve em campanhas. O cadastro continua funcionando sem telefone, sem autorização ou sem configuração do modelo Meta.

O primeiro envio é uma mensagem genérica, sem nome, empresa, código de acesso ou dados privados. A confirmação de posse continua no fluxo separado **Conversa → Ativar WhatsApp → enviar a mensagem de confirmação**. Essa separação permite as boas-vindas logo após o cadastro sem conceder acesso a quem apenas recebeu a mensagem. A conta é efetivada pela transação de cadastro existente; não foi acrescentada verificação de e-mail.

## Configuração na hospedagem

Além das credenciais do WhatsApp oficial já utilizadas pelo webhook, configurar:

```dotenv
HELPU_WHATSAPP_WELCOME_TEMPLATE=helpu_boas_vindas_v1
HELPU_WHATSAPP_WELCOME_LANGUAGE=pt_BR
```

O nome acima é uma proposta. Criar na Meta um modelo **sem variáveis, cabeçalho ou botões obrigatórios**, no idioma indicado, e aguardar aprovação antes de configurar o nome real. Este código não cria nem aprova o modelo. A Meta define a categoria aplicável; não presumir classificação utilitária ou gratuidade. Não usar um modelo alheio a essa finalidade.

Texto proposto:

> Boas-vindas à Helpu! Organize o marketing da sua empresa e crie conteúdos com apoio de inteligência artificial. Para pedir criações e receber arquivos por aqui, entre no portal, abra Conversa na tela inicial e selecione Ativar WhatsApp. Confirme o vínculo pelo seu telefone. Até concluir essa etapa, a operação por aqui permanece desativada. Se não solicitou esta mensagem ou não deseja recebê-la, responda SAIR.

A política exige autorização e modelo aprovado para mensagens iniciadas pela empresa: https://whatsappbusiness.com/policy/

## Entrega e recuperação

- Usuário, primeira empresa, autorização e guia são registrados na mesma transação do cadastro. Erro nessa gravação desfaz a criação, sem uma conta parcial.
- A função online solicita o envio após responder ao cadastro, usando `waitUntil`; não inicia tarefas de IA. O scheduler local e o worker periódico também drenam a fila.
- A fila é persistente. Comparação atômica impede que duas instâncias enviem o mesmo registro. Há proteção adicional de uma tentativa por telefone a cada 24 horas, inclusive entre contas.
- Sem modelo/configuração, o estado exibido é pendente de habilitação. Não há fallback para texto livre. Convites que não saíram em 24 horas expiram; configurar o modelo depois não dispara automaticamente cadastros antigos.
- `accepted` significa que a Meta aceitou a solicitação; `sent`, `delivered` e `read` são atualizados pelo webhook assinado. Falha definida e resultado incerto são distintos.
- Timeout ou processo interrompido depois de iniciar envio não é repetido automaticamente. Conferir na Meta antes de qualquer reenvio operacional; não redefinir registros cegamente para `queued`.
- `SAIR`, `PARAR`, `DESATIVAR`, `STOP` e `CANCELAR` revogam as boas-vindas mesmo sem vínculo de operação. A revogação também está disponível no diálogo do portal. A entrega já em trânsito não pode ser recolhida. A supressão impede novos convites por outro cadastro com o mesmo telefone.
- Autorização registra texto, versão, horário e origem; configurações, credenciais e erros brutos não são expostos ao cliente. O estado de contato é privado à pessoa e empresa.

## Validação de publicação

Executar testes locais, publicar a versão autorizada e configurar um template aprovado. Fazer teste real somente com número de destinatário autorizado. Conferir recebimento, orientação de ativação, webhook de status e cancelamento. Os testes automatizados usam somente transporte simulado e não enviam mensagens reais.

# F05 — primeiros passos

Novas contas veem um guia opcional: empresa, marca, primeira criação, revisão e WhatsApp. Pode ser pausado, retomado ou revisto pelo botão no início das telas. O progresso é salvo por pessoa e empresa no banco, inclusive após novo login. Contas existentes podem iniciar o guia pelo mesmo botão.

O guia abre as telas reais e registra etapas vistas/objetivo; não preenche marca por conta própria, não cria conteúdo, não confirma aprovação nem ativa WhatsApp. O cliente executa as ações pelos formulários existentes. O objetivo é uma preferência do guia, não uma instrução automática de geração. A etapa de revisão aponta para a Biblioteca, e a etapa WhatsApp explica a confirmação separada.
