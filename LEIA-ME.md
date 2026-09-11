# Helpu — abrir e desenvolver localmente

## Abrir no Windows

O chat agora coordena ordens de trabalho nas áreas existentes. Para entender a primeira vertical de publicação, aprovações, evidências e limitações de contas externas, consulte [HELPU-OPERATING-KERNEL.md](HELPU-OPERATING-KERNEL.md).

1. Tenha Node.js **22.13 ou posterior**, com npm, instalado.
2. Dê dois cliques em **INICIAR-HELPU.cmd**. Na primeira abertura, ele instala as dependências; essa etapa precisa de internet.
3. Aguarde o navegador abrir em **http://127.0.0.1:4173/portal.html**. Entre com sua conta ou faça um cadastro.

Mantenha a janela aberta durante o uso. Para encerrar o servidor e as sessões de navegador, pressione **Ctrl+C** nessa janela. Se o Windows perguntar se deseja finalizar o arquivo em lotes, confirme.

Chrome ou Edge é necessário para **Contas conectadas**, mas não para iniciar o portal. IA e serviços externos precisam ser configurados em **Integrações**. O cadastro local não envia e-mail de confirmação e não inclui recuperação de senha por e-mail.

## Trabalhar pelo terminal

Abra o terminal na pasta do projeto:

```powershell
npm ci --ignore-scripts
npm run doctor
npm run dev
```

Acesse o endereço exibido. O modo de desenvolvimento reinicia o servidor quando o código em `server.mjs`, `portal/` ou `scripts/` muda. Dados, uploads e perfis na pasta de dados não provocam reinícios. Evite alterar o código durante operações externas: um reinício interrompe a execução e pode exigir conferência no portal.

Edite a interface diretamente em `dist/` e atualize a página no navegador. Não há etapa de build. Depois de editar `.env`, encerre e inicie novamente o servidor.

| Comando | Uso |
| --- | --- |
| `npm start` | Iniciar normalmente, sem reinício automático |
| `npm start -- --open` | Iniciar e abrir o portal no navegador padrão |
| `npm run dev` | Desenvolver com reinício automático do servidor |
| `npm run doctor` | Conferir requisitos, arquivos e configuração sem alterar dados |
| `npm run check` | Verificar a sintaxe dos scripts e módulos |
| `npm test` | Executar os testes com dados temporários |
| `node preview.mjs` | Usar a mesma inicialização normal pela entrada de prévia |

## Configuração opcional

Funciona sem `.env`. Para personalizar, copie `.env.example` para `.env` na raiz. Variáveis já definidas no terminal têm prioridade.

| Variável | Padrão e finalidade |
| --- | --- |
| `HELPU_PORT` | `4173`; inteiro entre 1 e 65535 |
| `HELPU_BIND` | `127.0.0.1`; também aceita `localhost` ou `0.0.0.0` |
| `HELPU_DATA_DIR` | `.local-data`; caminho relativo à pasta do projeto ou caminho absoluto |
| `HELPU_BROWSER_EXECUTABLE` | Opcional; caminho de Chrome/Edge para Contas conectadas |

Use aspas para caminhos com espaços, por exemplo `HELPU_DATA_DIR="C:/Meus dados/Helpu"`. Para uso local, mantenha `HELPU_PUBLIC_URL` ausente: essa opção é destinada ao acesso HTTPS descrito no manual e desativa as sessões locais de navegador. Apenas mudar o bind não configura acesso pela rede.

## Estrutura e dados

- `server.mjs`: servidor HTTP, autenticação e arquivos públicos.
- `portal/`: operação, integrações, navegador e migrações existentes.
- `dist/`: páginas, JavaScript, estilos e mídia da interface; são arquivos editáveis.
- `scripts/`: inicialização, diagnóstico e verificação de sintaxe.
- `tests/`: testes automatizados.
- `.local-data/`: dados privados persistentes; não compartilhar nem apagar para reinstalar.

Preserve juntos `helpu.sqlite`, `integration.key`, `uploads/` e `browser-profiles/`. Encerre a Helpu antes de copiar essa pasta para backup. A chave é necessária para recuperar as credenciais criptografadas. A reinstalação de dependências não exige apagar dados.

## Solução de problemas

| Mensagem ou sintoma | Ação |
| --- | --- |
| Node incompatível ou npm ausente | Instale Node.js 22.13 ou posterior com npm e reabra o terminal |
| Dependências ausentes ou incompatíveis | Execute `npm ci --ignore-scripts`; confira a internet se a instalação falhar |
| Porta já em uso | Encerre a outra instância ou defina outra `HELPU_PORT`; nenhum processo é encerrado automaticamente |
| Configuração inválida | Confira `.env` e as variáveis do terminal; execute `npm run doctor` |
| Falha na pasta de dados | Confira o caminho e as permissões; preserve os dados e a chave existente |
| Navegador não abriu automaticamente | Acesse o endereço exibido na janela do servidor |
| Contas conectadas não abre uma janela | Instale Chrome/Edge ou configure `HELPU_BROWSER_EXECUTABLE` |
| HTML abre, mas login não funciona | Inicie pelo atalho ou `npm start`; abrir arquivos ou usar Live Server não executa a API |
| Aviso experimental do SQLite no Node 22 | O aviso, sozinho, não impede a inicialização; confira a mensagem “Helpu pronta” |

Consulte [GUIA-DO-PORTAL.md](GUIA-DO-PORTAL.md) para empresas, campanhas, integrações e rotinas, e [ARQUITETURA-HELPU.md](ARQUITETURA-HELPU.md) para a arquitetura.
