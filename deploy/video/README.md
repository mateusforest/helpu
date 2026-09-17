# Hospedagem dedicada ao Astra Vídeo

Este pacote executa apenas vídeo e o relógio da fila. Não instala Chromium, não aceita rotas de navegador e não precisa do firewall de sessões do pacote antigo. As rotas de vídeo continuam autenticadas por segredo e empresa. /healthz expõe somente {ok:true}, sem projetos, arquivos ou credenciais.

## Render

1. Entre na Render e conecte o repositório privado da Helpu. Os commits precisam estar no remoto antes do build; este preparo não faz push.
2. New → Blueprint, selecione o repositório e o arquivo deploy/video/render.yaml. Alternativa: Web Service, runtime Docker, Dockerfile deploy/video/Dockerfile e contexto na raiz do repositório.
3. Revise o preço na plataforma. A configuração inicial proposta é 1 CPU / 2 GB, disco persistente de 10 GB em /data e uma réplica. Não habilite escalonamento ou suspensão por ociosidade. A capacidade precisa ser medida com os vídeos reais.
4. Informe HELPU_RUNTIME_SECRET (mínimo 32 caracteres) e CRON_SECRET (mesmo valor já usado na Vercel, mínimo 32). Nunca coloque esses valores no Git. HELPU_PUBLIC_URL é https://www.helpumkt.com.
5. Crie o serviço. Copie sua URL HTTPS fornecida pela Render. Não é necessário comprar um domínio.
6. Na Vercel / Production, configure HELPU_RUNTIME_URL com essa URL, HELPU_RUNTIME_SECRET com o mesmo segredo e HELPU_AUTOMATIONS_ENABLED=true. CRON_SECRET deve coincidir. Faça o deploy do painel.
7. Confira Biblioteca → Astra Vídeo, crie um projeto curto, exporte e verifique o MP4 na Biblioteca/conversa. Feche a aba durante o processamento para comprovar independência do painel.

## Operação

O serviço chama a fila do painel a cada minuto. O processamento de vídeo já é serial; use uma única instância por volume. Projetos, fontes e exportações ficam no volume, os arquivos concluídos são importados para o armazenamento privado da Helpu. Monitore disco e faça backup antes de manutenção; a limpeza automática do volume ainda não existe.

O build Docker e o deploy real precisam ser verificados no provedor. Testes locais não comprovam disponibilidade da hospedagem. A API não recebe chaves da OpenAI nem credenciais do WhatsApp: somente os dois segredos de comunicação com o painel.

Referências: https://render.com/docs/blueprint-spec e https://render.com/docs/disks.
