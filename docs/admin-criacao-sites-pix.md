# Operação administrativa, sites e Pix

Implementação local de 21/09/2026. Precisa de publicação do código e configuração da conta oficial antes do uso em produção. Nenhuma postagem, cobrança ou mensagem real foi enviada durante a validação.

## Criação da Helpu

Em **Administração → Criação da Helpu**, escolha uma empresa da sua própria conta como cadastro interno da Helpu. A seleção é única; não selecione um cliente. A configuração concede acesso de uso próprio sem franquia interna. Isso não remove cobranças da OpenAI, da hospedagem ou de outros provedores.

1. Conectar o Instagram oficial **@helpumarketing** e verificar a conta.
2. Criar a imagem, carrossel ou Reel pela área de criação e aprovar a versão final.
3. Abrir **Programação → Revisar e programar**, conferir a prévia, legenda e data/hora no fuso indicado, e confirmar.
4. Acompanhar a fila. “Publicado e conferido” exige leitura da publicação de volta no Instagram, não apenas aceitação da requisição.
5. Em **Desempenho**, consultar alcance, visualizações, curtidas, comentários, salvamentos e compartilhamentos que a API disponibilizar. Leituras previstas após publicação, 1 hora, 24 horas e 7 dias. São medições das publicações deste módulo, não de todo o histórico da conta. Indisponível não equivale a zero.

O servidor exige operador autorizado, participação na empresa interna, aprovação da criação, conta com nome exato e ID preservado e chave única da programação. O endpoint normal de tarefas não aceita esse tipo de publicação. Clientes continuam com publicação própria ou assistida pela equipe, sem publicação automática.

Se o envio começar e não retornar confirmação, a tarefa fica para conferência humana: não repete automaticamente. Se uma conexão de outra conta for tentada nesta área, o login é recusado e a conexão anterior é preservada. Uma publicação já iniciada não pode ser cancelada como se ainda estivesse na fila.

### Configuração de hospedagem

- Operador já cadastrado nas variáveis administrativas existentes.
- `HELPU_PUBLIC_URL`, `HELPU_INSTAGRAM_APP_ID` e `HELPU_INSTAGRAM_APP_SECRET` configurados na hospedagem; callback HTTPS `/api/connect/instagram/callback` registrado no aplicativo Meta.
- O login interno solicita `instagram_business_basic`, `instagram_business_content_publish` e `instagram_business_manage_insights`. A disponibilidade efetiva precisa ser conferida no aplicativo e na autorização da conta oficial. Não há credenciais reais neste documento.
- Armazenamento privado existente configurado e worker acionado. A publicação usa URLs assinadas por uma hora para o Instagram buscar a mídia; downloads normais mantêm a duração anterior de 60 segundos.
- Imagens PNG/WebP aprovadas são preparadas como JPEG no servidor. Reels usam MP4; carrosséis suportam até dez fotos. A criação permanece preservada.
- Os testes usam respostas simuladas da API. Login real, permissões efetivas, compatibilidade final da mídia e publicação real ainda precisam ser verificados após o deploy.

Referência: [coleção oficial da Meta para Instagram](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api). A configuração final deve seguir a modalidade Instagram Login usada pelo projeto.

## Clientes e liberações

**Administração → Clientes** oferece busca, filtro de situação e ficha com cadastro, membros, acesso, financeiro, criações e documentos. Os nomes de login não são alterados pela edição do nome da empresa.

- **Teste:** liberação sem franquia interna, com término obrigatório em até 90 dias.
- **Empresa própria:** liberação sem franquia interna com término opcional.
- **Revogar:** encerra a exceção; os controles normais voltam a valer. A política base da empresa não é sobrescrita pela exceção.
- **Plano pago:** segue proposta, aceite do cliente, confirmação bancária no Financeiro e ativação vinculada ao recebimento. Liberação gratuita não registra pagamento ou receita.
- **Inativar:** bloqueia novos trabalhos e a execução dos pendentes. Não apaga dívidas nem impede a consulta ao histórico.
- **Excluir do diretório:** exclusão lógica, com nome exato e motivo. Exige ausência de trabalhos em andamento e preserva documentos e financeiro. Pode ser revertida pelo filtro Excluídas.
- A consulta administrativa de arquivos exige autorização de operador e empresa correspondente e registra auditoria. O acesso normal de um cliente não foi ampliado. Anotações internas e auditorias administrativas não aparecem no estado do cliente.

## Sites profissionais

O cliente acessa **Minha empresa → Sites profissionais**: exemplos visuais ilustrativos, entregas, etapas, briefing e acompanhamento. Não são exemplos de trabalhos reais nem um gerador automático de sites. A produção é humana, contratada separadamente da mensalidade.

| Modelo de proposta interna | Investimento sugerido | Escopo | Prazo inicial sugerido |
| --- | --- | --- | --- |
| Página de conversão | R$ 2.900 | Uma oferta, até sete seções, copy, design, formulário e WhatsApp | Até 10 dias úteis |
| Site institucional | R$ 4.900 | Até cinco páginas, copy, design, formulário, WhatsApp e estrutura institucional | Até 15 dias úteis |

São rascunhos editáveis para revisão da equipe. No portal do cliente, o investimento aparece **sob orçamento**. Os valores só integram uma contratação quando uma proposta é enviada e aceita.

Ambos preveem duas rodadas consolidadas de ajustes, layout responsivo, identidade existente aplicada, SEO básico, domínio do cliente com HTTPS, medição autorizada, testes e entrega orientada. Domínio, hospedagem, e-mail, anúncios, novas fotos, criação de marca/logotipo, manutenção e sistemas/lojas personalizados são orçados separadamente. Não há promessa de leads ou posição no Google.

Modelo de pagamento: **50% de entrada e 50% após aprovação da prévia, antes de publicar no domínio e entregar o projeto final**, via Pix ou boleto. A equipe pode alterar a condição na proposta. Início exige aceite, entrada conferida e briefing completo; conclusão exige confirmação do saldo final. O envio de uma prévia não publica um site.

Revisar a margem antes de fechar: descontar impostos, taxas, licenças e eventual terceirização, e dividir o restante pelas horas previstas. A sugestão comercial não substitui essa conferência de custo e capacidade.

## Pix e boleto

Em **Administração → Financeiro → Nova cobrança**, escolher **Pix**, **Boleto** ou **Pix ou boleto**. Para Pix, cadastrar chave, nome do beneficiário e instituição financeira reais. Não há chave pré-preenchida, QR Code dinâmico ou integração Pix bancária nesta etapa.

O cliente consulta a própria cobrança, copia a chave e envia comprovante PDF. Pix e boleto são alternativas para quitar a mesma dívida, sem duplicar a cobrança. Um comprovante suspende os lembretes enquanto está em conferência; não marca a cobrança como paga. A equipe confere o extrato e confirma o recebimento integral. Cobranças pagas não oferecem novamente o botão de copiar chave para pagamento.

O portal não movimenta dinheiro, não emite boleto no Sicredi e não emite nota fiscal. A emissão do boleto e a conferência bancária continuam manuais. Lembretes existentes também consideram cobranças com Pix, respeitando o consentimento e a disponibilidade do WhatsApp.

## Verificação

- Fluxos administrativos, expiração e revogação da liberação, isolamento de documentos, Pix, entrada/saldo de sites, publicação idempotente e cancelamento em SQLite e PostgreSQL.
- OAuth simulado: permissões internas, bloqueio de outra conta, preservação da conexão anterior e retorno ao administrativo.
- Navegação real em navegador local, dados fictícios e requisições externas bloqueadas; larguras de 1440, 390 e 320 pixels.
- Conferência de sintaxe, arquivos públicos do build e suíte existente. O teste do pacote nativo Linux é executado na hospedagem; não é reproduzido no Windows.
