# Helpu: navegação simples e operação com Astra

## Interface

A barra inferior permanece em computadores e celulares com cinco destinos:
Conversa, Biblioteca, Calendário, Resultados e Minha empresa.

- Biblioteca reúne conteúdos e arquivos; Campanhas é uma aba da mesma área.
- Calendário mantém acesso às Tarefas.
- Resultados mantém acesso ao Histórico.
- Minha empresa reúne Marca, Conexões e Autonomia. Atendimento, Contatos,
  Captação, Google, Visão geral, Especialidades e Sessões locais continuam
  acessíveis em Outros recursos. Os endereços anteriores continuam válidos.
- A conversa mostra o estado da inteligência e da rotina, atalhos para criação
  e uma pendência recolhida quando há uma produção bloqueada. A biblioteca
  preserva os detalhes dessa produção.

## Astra

O modelo padrão da conversa continua sendo `gpt-6-astra`. Modelos personalizados
salvos pela empresa continuam sendo respeitados. A integração usa a Responses
API e o mecanismo de execução que já existia no projeto.

A ferramenta `operation_status` consulta permissões, estado do executor,
disponibilidade das conexões e ações recentes, ou uma execução específica da
empresa atual. Não transmite chaves ou configurações privadas das integrações.

`queue_action` agora recebe `scheduledAt` opcional: data futura ISO 8601 com fuso
explícito. O modo Planejar continua impedindo alterações. Agendamento, limites,
isolamento por empresa e prevenção de duplicidade usam a fila existente.

Em ambiente de nuvem, o modelo não recebe ferramentas de navegador local.
Pedidos de edição no Astra Vídeo são identificados como indisponíveis até que
o editor seja conectado. Gerar um vídeo pelo provedor existente é uma operação
diferente de editar um arquivo no Astra Vídeo.

## Verificação e operação

- `npm test`: regressões e testes das ferramentas do Astra.
- `node tests/simple-workspace-visual.mjs`: interface em 1440, 390 e 320 pixels,
  navegação e conversa com resposta simulada. Usa conta temporária e bloqueia
  conexões externas. As capturas vão para `../preview` ou `HELPU_QA_OUTPUT`.
- `node scripts/validate-intelligence.mjs`: teste real e pequeno com a chave
  local salva, sem alterar dados. Há consumo da API.

Nenhuma migração de dados ou variável nova é necessária para esta atualização.
O funcionamento na Vercel continua dependendo do worker, das credenciais e das
permissões já configurados. Esta alteração não ativa publicação, envio de
mensagens ou anúncios, e não muda as políticas existentes das empresas.

O Astra Vídeo local ainda precisa de um serviço de processamento conectado ao
Helpu. Não foi enviado para a Vercel como se já fosse um executor disponível.
