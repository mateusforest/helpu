# Apresentação interativa Helpu — prévia comercial

Abra `index.html` em um navegador. Funciona sem servidor, cadastro, API ou dependências externas. Nenhum formulário envia dados. O resumo final pode ser copiado ou baixado. Não é uma página publicada nem um checkout.

## Estrutura

Abertura da marca, benefícios, quatro etapas interativas, captura do portal de demonstração, duas peças conceituais da biblioteca, comparação de fluxos, comparador de preço/escopo, planos, consultoria e diagnóstico de cinco perguntas com recomendação contextual.

## Bases usadas

- Identidade e composição laranja: materiais existentes em `dist/assets`.
- Planos e condições: `dist/assets/offer-catalog.js`, consultado em 21/09/2026. Essencial R$ 690/mês; Assistido R$ 990/mês; Diagnóstico e Estratégia R$ 990 avulso. Esta prévia não altera esses valores no produto.
- Biblioteca: modelos imobiliário e bebidas aprovados anteriormente; exemplos conceituais, não casos de clientes.
- Captura do produto: ambiente de demonstração local, sem dados de clientes.
- Comparação anônima: capturas fornecidas pelo usuário nesta conversa. Referência A: R$ 849, dois carrosséis, cerca de oito vídeos editados, stories/capas, planejamento/reuniões, suporte segunda a sábado, cliente publica. Referências B/C: R$ 2.600 e R$ 3.400, respectivamente 2 cards/carrosséis + 6 Reels e 4 cards/carrosséis + 8 Reels; pacote descrito com captação mensal, organização, reuniões, publicação e outros serviços.
- Não se afirma vigência dos valores externos. Escopos não são equivalentes. Diferenças calculadas são nominais, não garantia de economia. Documentos externos não estabelecem prazo de entrega; não há comparação inventada de velocidade, ROI ou qualidade mensurada.

## Antes de distribuir

Revisar a oferta e autorizar publicação. Definir destino do atendimento e procedimento de contratação, e então substituir a identificação de prévia e o resumo local por encaminhamento apropriado. Manter consentimento separado caso a versão futura armazene informações. Horário de atendimento humano e prazo por formato ainda precisam de condições comerciais validadas.

## Verificação

`node tests/commercial-preview-visual.mjs` confere layout em 320, 390 e 1440 pixels, imagens, etapas, modais, comparação, três recomendações e download do resumo, sem serviços externos.
