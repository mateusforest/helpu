# Helpu — revisão operacional

Revisão realizada em 11 de setembro de 2026, no projeto local. O sistema mantém sua arquitetura Node.js, SQLite, arquivos privados e sessões de navegador separadas por empresa.

## Correções realizadas

- **Conversa:** preserva a resposta textual junto ao estado da ordem; trocar de conversa limpa o contexto anterior e bloqueia o envio até receber os dados corretos. Respostas atrasadas não substituem a seleção atual.
- **Retomada:** atingir o limite de etapas deixa um bloqueio recuperável. Os registros permanecem disponíveis e as chamadas já consumidas continuam contando para o limite diário.
- **Referências:** o limite de seis anexos e de 20 MB de imagens/PDFs é conferido antes de enfileirar. Referências excedentes não são descartadas silenciosamente.
- **Contas conectadas:** os cartões acompanham mudanças de sessão automaticamente. Login continua separado de identidade confirmada e de executor validado.
- **Atendimento:** novas mensagens atualizam o histórico sem apagar o formulário de resposta. A janela de atendimento e o contexto são buscados por contato, mesmo quando há centenas de mensagens de outras pessoas.
- **Revisão:** páginas, documentos e mensagens têm critérios próprios; não precisam se passar por peças de redes sociais. A aprovação está vinculada aos campos relevantes da entrega.
- **Captação:** a ferramenta de rascunho da conversa nunca ativa uma página automaticamente.
- **Publicações:** uma ordem com várias peças permanece aberta enquanto houver peças pendentes; executar novamente seleciona a próxima. Peças já publicadas preservam esse estado após nova revisão.
- **Evidência:** a primeira publicação confere também a janela temporal da tentativa. Um post antigo não confirma uma tentativa nova. A análise temporal, isoladamente, não prova igualdade de mídia entre posts recentes com a mesma legenda.
- **Mídia aprovada:** “desaprovada” não é interpretada como aprovação. A conferência da URL pública tem prazo total, incluindo DNS e download, para liberar o executor quando o serviço não responde.
- **Google:** alterações de site não apagam a descrição da empresa; campos omitidos são preservados. Descrições acima de 750 caracteres são recusadas, sem truncamento silencioso. A máscara de atualização segue a [documentação de locations.patch](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/patch).
- **Diagnóstico:** erros conhecidos de chave, modelo, cota e limite temporário têm orientações específicas, sem expor a resposta bruta ou credenciais. Referência: [códigos de erro da OpenAI](https://developers.openai.com/api/docs/guides/error-codes).
- **Interface:** a Visão geral mostra o estado efetivo da inteligência e do executor. Busca, atualização e inclusão de empresas estão disponíveis em telas pequenas.

## Verificação

Sintaxe e diagnóstico local aprovados. A suíte reúne 121 testes, incluindo autenticação, isolamento entre empresas, persistência, inicialização, recuperação, aprovação, publicação simulada, qualidade e atualizações da interface. As 17 áreas passam pela renderização automatizada com estados vazios e preenchidos.

Os testes de publicação usam serviços simulados e banco temporário. Eles verificam os contratos e as transições, sem publicar em contas reais. A aparência visual em navegador não foi inspecionada nesta rodada; a responsividade recebeu ajustes de CSS e verificação estrutural.

A conexão OpenAI existente foi testada com chamadas reais: GPT-6 Astra respondeu, realizou a ferramenta de teste e retornou a saída estruturada. A evidência está registrada no portal. A rotina diária de planejamento foi ativada preservando o limite de oito execuções de IA por dia.

O diretor concluiu o diagnóstico inicial. A direção criativa concluiu uma execução real e gravou três rascunhos em revisão no Estúdio: um carrossel sobre centralização da operação, um roteiro de Reels sobre o fluxo comercial e uma proposta de imagem institucional. São textos e briefings; imagens, vídeos finais, CTAs e identidade visual ainda dependem de revisão e dos materiais aprovados. Nenhum desses conteúdos foi publicado.

## Operação e dependências externas

| Área | Situação e condição de uso |
| --- | --- |
| Marca, campanhas, tarefas e memória | Operação local com persistência e isolamento por empresa. |
| Conversa e agentes | Conexão de IA validada; execução depende do serviço e dos limites configurados. |
| Rotina diária | Ativada. Funciona enquanto o servidor e o computador estiverem ligados. |
| Estúdio | Textos e briefings disponíveis pela IA; imagens/vídeos gerados dependem de configurar Higgsfield. |
| Calendário e publicação | Agendamento e aprovação implementados; publicação real depende de API e conta confirmadas, mídia acessível e política de Autonomia. |
| Atendimento externo | Histórico e rascunhos locais disponíveis; envio/recebimento depende de integração, webhook e condições do canal. |
| Google e Meta Ads | Exigem credenciais, contas e permissões próprias. Campanhas Meta são criadas pausadas. |
| Captação externa | As páginas locais funcionam com o servidor; acesso de clientes externos exige hospedagem HTTPS do backend. |
| Resultados | Medições têm fonte explícita. Sem integração e entregas publicadas, não existem resultados externos aferidos. |
| Acesso por navegador | Chrome/Edge disponível. Publicação pelo navegador permanece sem executor validado. |
| Operação permanente e hospedagem | O ambiente atual é local. A configuração estática em `.openai/hosting.json` não hospeda a API, SQLite, uploads privados nem sessões de navegador; é necessária infraestrutura compatível ou migração do backend antes de publicar o sistema completo. |

Não foram cadastradas credenciais fictícias nem marcados canais desconectados como ativos. Publicação e respostas automáticas permanecem desativadas na configuração existente, pois não há canais externos configurados por API. A rotina interna prepara materiais para revisão.
