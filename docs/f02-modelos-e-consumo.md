# F02 — modelos e consumo

## Entrega

Área administrativa **Inteligência e consumo**, em `admin.html#/intelligence`, restrita à equipe. O cliente não pode ler ou alterar essa configuração. Cada empresa mantém política e histórico próprios.

- Consumo de 30 dias por modelo, tarefa e pedido; tokens de entrada, cache e saída, cobertura da medição, latência, falhas e tentativas.
- Estimativa em USD baseada em tokens realmente informados. Cache é subconjunto da entrada e raciocínio já compõe a saída: nenhum é somado duas vezes.
- Imagens só recebem estimativa quando o uso multimodal permite aplicar a tarifa corretamente. Uso ausente, cache misto sem detalhamento, modelos sem tarifa e processamento desconhecido permanecem sem preço.
- Custo medido de IA por criação aprovada iniciada no período, quando todas as chamadas registradas daquela criação têm preço. Conversa anterior, renderização, armazenamento, mensagens e atendimento não compõem esse indicador. Não é custo integral ou margem financeira.
- Comparação Sol/Astra com casos fictícios, mesmas instruções, ferramentas reais e consultas simuladas. Nunca executa criação, envio ou publicação.
- Escolha de modelo para conversa, proposta de postagem, planejamento de mídia, revisão criativa e tarefas estruturadas; histórico de mudanças e restauração.
- Correção comprovada na avaliação: uma referência de estilo disponível é adicionada aos anexos, mantendo sua função de referência e sem torná-la material obrigatório de cena.

## O que muda ao publicar

A instrumentação e o painel ficam disponíveis. Os modelos atualmente salvos na empresa ou no ambiente são preservados até a equipe ativar o roteamento por tarefa. O GPT-5 mini das tarefas estruturadas não é substituído automaticamente. Imagens continuam no modelo de imagem; vídeo continua no motor de renderização. Falhas de rede, saldo, arquivo ou render não fazem escalada automática para Astra.

Não houve alteração em credenciais, dados de produção, quotas comerciais ou cobrança externa. O banco local consultado não continha medições `provider_usage`; por isso não há diagnóstico da conta real de produção ou conciliação com a fatura do fornecedor. O painel passa a expor essas medições quando as chamadas ocorrerem na instalação publicada.

## Como liberar uma mudança

1. Selecione a empresa no admin e confira os modelos efetivos.
2. Inicie uma comparação conscientemente: são 16 avaliações (oito casos por modelo), até três chamadas por avaliação, cada uma limitada a 2.000 tokens de saída. As consultas intermediárias retornam dados fictícios. Máximo de 48 chamadas; a API é paga.
3. Revise os resultados. A avaliação verifica parâmetros e ferramentas; não comprova qualidade visual, MP4, locução ou roteiros extensos. Confira amostras reais anonimizadas das tarefas a alterar.
4. Escolha as tarefas, indique o lote, registre o motivo e marque a revisão de qualidade. O servidor exige que os dois modelos tenham completado o lote e que cada modelo escolhido tenha passado nos oito casos. Lotes expiram para ativação após sete dias.
5. Monitore custo por entrega aprovada, erros e retrabalho. Para voltar, use Restaurar configuração anterior no histórico, ou selecione a configuração original da empresa/servidor.

Uma avaliação identificada não é reexecutada pelo reenvio da mesma requisição. Resultado incerto permanece pendente de análise. Não existe avaliador automático chamando os dois modelos em mensagens comuns.

## Comparação executada em 20/09/2026

Usou a chave local configurada, com dados fictícios baseados nos problemas relatados. Nenhum material de cliente, imagem ou vídeo foi gerado; nenhuma ferramenta de mutação foi executada.

O primeiro ensaio avaliava apenas a primeira resposta e penalizava uma consulta legítima do Astra. Foi descartado como comparação de qualidade. O avaliador foi corrigido para acompanhar até três etapas e contabilizar todas as respostas.

| Execução | Sol | Astra | Estimativa conjunta |
|---|---|---|---|
| Ensaio de calibração, descartado | 8/8 na primeira resposta | 3/8 na primeira resposta | US$0,138572 |
| Comparação acompanhando consultas | 7/8; US$0,053792 | 7/8; US$0,166160 | US$0,219952 |
| Reteste apenas da referência de estilo após corrigir o portal | 1/1; US$0,008824 | 1/1; US$0,019304 | US$0,028128 |

A falha comum na referência de estilo vinha da ligação entre `referenceOnlyIds` e anexos. No conjunto consolidado de sete casos da segunda execução mais o caso corrigido, ambos passaram nos oito cenários. Sol somou **US$0,053472** e Astra **US$0,156884**: aproximadamente 66% menos nessa pequena amostra. Isso não representa economia garantida na conta inteira. O custo estimado de todos os ensaios, inclusive calibração e reteste, foi **US$0,386652**, em 40 chamadas confirmadas.

Recomendação sustentada pela amostra: piloto de Sol para conversa/briefing, preservando a possibilidade de retorno e a avaliação das entregas reais. Não há evidência suficiente aqui para trocar indiscriminadamente revisão complexa ou geração de mídia.

## Tarifas e limites da medição

Tarifas conferidas em 20/09/2026: [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst), [tabela oficial](https://developers.openai.com/api/docs/pricing).

Por milhão de tokens de texto em contexto curto, Standard: Sol US$4 entrada / US$0,40 cache / US$20 saída; Astra US$10 / US$1 / US$50. Acima de 272 mil tokens de entrada, aplicar as faixas longas. Para Sunburst, texto US$5 / US$1,25 cache; imagem US$8 / US$2 cache / US$30 saída. Gravações de cache sem detalhamento não recebem preço total estimado.

Snapshots de estimativa guardam fonte e data. O cálculo é limitado ao período conferido até 21/11/2026; depois precisa de revisão de tarifas. Não inclui tributos, câmbio, descontos negociados, serviços externos ou custos de respostas não confirmadas. O reset do uso operacional não apaga o histórico do fornecedor.

## Verificações

Testes automatizados de isolamento, roteamento, histórico/reversão, preços, dados desconhecidos, cache/raciocínio, imagem, limite de etapas, idempotência e integração real com os caminhos de chat/planejamento. Verificação visual em 1440, 390 e 320 pixels. Comparação de API descrita acima é independente dos testes com respostas simuladas.

Para repetir voluntariamente a amostra: `node scripts/evaluate-ai-routing.mjs --live`. O arquivo de resultado fica em `.local-data`, fora do Git. `--case=style` executa apenas esse caso; `--config=<diretório>` lê a configuração local sem imprimir a chave. Não executar em uma rotina automática.
