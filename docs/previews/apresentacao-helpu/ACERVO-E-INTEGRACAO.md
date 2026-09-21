# Acervo da história — preparo e integração

Não é necessário ter material de todos os momentos. É melhor usar poucos registros autênticos do que preencher a trajetória com imagens que não representam os fundadores.

## Uma pasta, seis capítulos

Estrutura sugerida para reunir o material:

```
Historia-Helpu/
  01-Vacaria-2020/
  02-Sao-Paulo/
  03-Fortaleza/
  04-Porto-Alegre/
  05-Retorno-Vacaria/
  06-Helpu-hoje/
  Marca-e-logos/
  Voz-e-anotacoes/
```

Pode entregar tudo em uma única pasta se for mais fácil. Nomes ou pequenas anotações com cidade, contexto e pessoas ajudam a selecionar. Use arquivos originais quando disponíveis; os recebidos pelo WhatsApp também serão avaliados. Não precisa editar antes de enviar.

## Material mais útil

- Vacaria: trabalhos antigos, equipe em atividade, bastidores, primeiros clientes e registros do espaço de trabalho.
- São Paulo: rotina profissional, franquias, inaugurações, equipamentos e registros da mudança.
- Fortaleza: atividades profissionais, cotidiano, fotos do casal/família que desejam tornar públicas. A imagem da filha é opcional.
- Porto Alegre: feiras, eventos, reuniões, estudos e consultorias, com contexto para não inventar a ocasião.
- Retorno: imagens atuais dos fundadores e de Vacaria. Um registro simples, de vocês trabalhando ou falando para a câmera, pode ser mais forte que uma imagem muito produzida.
- Hoje: demonstração real da nova Helpu, sem dados privados de clientes.
- Números: se houver, relatórios ou registros para confirmar contagem de conteúdos, empresas e alcance. As métricas históricas não devem ser atribuídas à nova plataforma.

## O que já está preparado

`story-media.js` relaciona seis capítulos a fotos, textos alternativos e ao filme final. Campos vazios exibem a narrativa tipográfica atual. Não há falso botão de reprodução enquanto o filme não existe.

Após selecionar e otimizar os materiais, copiar arquivos para `assets/historia/` e preencher, por exemplo:

```js
film: {
  src: 'assets/historia/helpu-historia-16x9.mp4',
  poster: 'assets/historia/helpu-historia-capa.webp',
  captions: 'assets/historia/helpu-historia-pt-BR.vtt',
  title: 'A experiência vem de longe — A história da Helpu'
}
```

Uma foto de capítulo usa `image: 'assets/historia/vacaria-2020.jpg'` e `alt` descrevendo o registro real. O código aceita caminhos locais relativos; não copiar credenciais ou links temporários privados para o arquivo. Imagem ausente ou inválida mantém a tipografia. Vídeo com falha mostra uma orientação e preserva a leitura por capítulos.

O filme abre em janela com controles, somente depois do clique. Fechar interrompe o som. A versão vertical é uma entrega separada para redes sociais; não há corte automático do filme horizontal.

## Próxima etapa

Receber a pasta, selecionar os registros por capítulo e ajustar o roteiro às imagens que existem. O arquivo `PEDIDO-PARA-O-EDITOR.md` pode ser enviado à outra conversa junto com o acervo. O pedido foi preparado, mas nenhuma mensagem foi enviada ao editor.
