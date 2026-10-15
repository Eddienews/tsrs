# TSRS — The Signal Room Studio

[English](README.md) · **Português**

Um estúdio local-first para trabalhar com modelos de IA. Use as suas próprias
chaves de API, todos os grandes modelos numa tela só, e deixe conversas, chaves e
arquivos no seu computador.

O TSRS é open source (MIT) e feito pela [NorthWind Lab](https://northwindlab.com).
Não existe conta, assinatura, telemetria nem nuvem do TSRS: o app roda no seu
navegador e fala direto com o provedor que você escolheu. O servidor local
opcional (`npm run dev`) roda na sua própria máquina e acrescenta o que o
navegador sozinho não faz, como gravar arquivos em pastas, renderizar vídeo e
rodar tarefas agendadas.

> **Chegando agora?** O manual explica cada recurso, com dicas para tirar o
> máximo do TSRS: [docs/MANUAL.pt-BR.md](docs/MANUAL.pt-BR.md).

## Por que o TSRS

- **Todos os modelos num lugar só.** Anthropic, OpenAI, Gemini, OpenRouter,
  DeepSeek, Mistral, xAI, Groq, Perplexity, modelos locais pelo Ollama ou LM
  Studio e qualquer endpoint compatível com a OpenAI. Compare até quatro
  respostas lado a lado.
- **Pague só o que usar.** Suas chaves, o preço do provedor, sem intermediário.
  O TSRS mostra os tokens e o custo estimado de cada resposta e de cada dia.
- **Seus dados continuam seus.** As conversas ficam no seu navegador, as chaves
  podem ser criptografadas com senha e nada vai para outro lugar. A
  sincronização entre aparelhos usa uma pasta, um servidor WebDAV ou um bucket
  S3 seus.
- **Arquivos de verdade, não só chat.** Páginas, código, documentos, mídias
  geradas e vídeos renderizados ficam numa pasta de projeto por conversa; o
  Claude Code, o Codex ou qualquer editor continuam dos mesmos arquivos.
- **Extensível nos formatos que você já conhece.** Skills e plugins no mesmo
  formato dos do Claude, além de servidores MCP e ferramentas próprias por HTTP
  ou JavaScript.
- **Muito além de texto.** Imagens, vídeo, voz, música, motion graphics
  renderizados em MP4, relatórios de pesquisa profunda, um canvas e preview ao
  vivo de páginas e apps.

## Começando

Você precisa do [Node.js](https://nodejs.org) 22 ou mais novo e de um navegador
(Chrome, Edge, Brave, Arc, Firefox ou Safari).

```bash
git clone https://github.com/Eddienews/tsrs.git
cd tsrs
npm ci
npm run dev        # http://localhost:5173
```

Abra **Configurações**, cole a chave de API de um provedor, clique em **Carregar
modelos** (ou digite o nome do modelo na barra superior) e envie uma mensagem.
Com o [Ollama](https://ollama.com) instalado, modelos locais funcionam sem chave
nenhuma.

Extras opcionais:

```bash
npm run proxy                         # proxy local para APIs que recusam o navegador (OpenCode, Replicate…)
npm run render -- motion-1.html       # renderiza uma composição motion em MP4 (precisa do ffmpeg)
npm run render:serve                  # renderizador avulso, para um TSRS servido sem o npm run dev
npm run build                         # checagem de tipos + build de produção em dist/
```

Renderizar vídeo precisa do [ffmpeg](https://ffmpeg.org) (Windows:
`winget install Gyan.FFmpeg`; macOS: `brew install ffmpeg`; Linux: o gerenciador
de pacotes) e do Chrome, do Edge ou do Chromium do Playwright.

## Recursos

### Conversas
- Respostas em streaming com Markdown, realce de código e botão de copiar;
  editar, regenerar, tentar de novo e guardar todas as versões (setas ‹ › em
  cada mensagem).
- Ramificar a conversa de qualquer mensagem; fixar mensagens; busca, pastas,
  etiquetas, arquivo e ações em lote; títulos automáticos.
- Comparar modelos: até três outros modelos respondem à mesma pergunta em colunas.
- Pergunta à parte: selecione um trecho da resposta e pergunte num painel lateral.
- Conversas temporárias, que não deixam histórico.
- Prompt de sistema, temperatura, máximo de tokens e nível de raciocínio por
  conversa; o raciocínio do modelo, recolhido acima da resposta, quando o
  provedor envia.
- Resumo do contexto quando a conversa se aproxima do limite do modelo, ou limpar
  o contexto a partir de qualquer ponto (dá para desfazer), para as mensagens
  anteriores deixarem de ser enviadas.
- Paleta de comandos (Ctrl/⌘+K), atalhos configuráveis, data e hora, som ao
  terminar, tema claro e escuro, cor de destaque, tamanho da fonte e densidade.
- Interface em português e inglês.

### Arquivos e conhecimento
- Anexe imagens, PDFs, textos, arquivos do Word e do PowerPoint (lidos como
  Markdown, slide a slide com as notas), planilhas do Excel (lidas como CSV, uma
  por aba) e áudio (transcrito pela OpenAI ou pelo Groq, para qualquer modelo usar).
- Bases de conhecimento locais: PDFs, textos, Markdown e HTML divididos em
  trechos e buscados por palavras (BM25, sem API) e, se quiser, por sentido
  (embeddings), por conversa ou por agente; o modelo pode buscar de novo com
  `knowledge_search`.
- **Pasta do projeto**: os arquivos que a conversa cria ficam em
  `projetos/<conversa>/`, com um `NOTAS.md`; o modelo lê a versão atual antes de
  mudar algo, então dá para alternar entre o TSRS e outras ferramentas. Qualquer
  outra pasta pode ser usada no lugar. O modelo também cria arquivos do **Word
  (.docx) e do PowerPoint (.pptx)** ali, e lê esses arquivos de volta.
- **Contexto da pasta**: instruções, arquivos e um agente para todas as
  conversas de uma pasta da barra lateral.

### Preview, canvas e vídeo
- Preview ao vivo de HTML, SVG, JavaScript, Markdown, React (JSX/TSX) e
  Mermaid, isolado do app, com abas de código e console e tamanhos de tela; a
  barra de endereço também abre páginas como `localhost:3000`.
- Canvas: um documento ou código ao lado da conversa, que o modelo escreve e
  edita com ferramentas e você edita à mão.
- **Vídeo motion**: um bloco `motion` é uma página HTML animada (CSS, anime.js,
  Lottie ou desenho próprio por quadro) com linha do tempo no preview; **Gerar
  MP4** renderiza quadro a quadro, com trilha. Veja [Vídeo motion](#vídeo-motion).

### Mídia e voz
- Imagens, vídeo, voz, música e efeitos sonoros com as chaves dos provedores
  (OpenAI, Gemini, xAI) ou de serviços de mídia (ElevenLabs, Runware, fal.ai,
  Replicate, WaveSpeedAI, Higgsfield, Stability AI, Black Forest Labs, MiniMax,
  Cartesia), com o custo estimado antes de enviar quando o serviço publica.
- Leitura das respostas em voz alta com a voz mais natural do navegador (as
  vozes neurais grátis do Microsoft Edge) ou com uma voz da ElevenLabs, da
  OpenAI ou do Gemini; escolha as suas vozes da ElevenLabs, com amostra e preço.
- Ditado pela OpenAI, pelo Groq ou pelo reconhecimento de voz do navegador.

### Ferramentas, agentes e extensões
- Servidores MCP remotos, com permissão antes de cada chamada.
- Busca na web e leitura de páginas pelo provedor (Anthropic, OpenRouter) ou com
  **a sua própria chave** (Brave, Tavily, Google, Kagi) para qualquer modelo,
  com fontes.
- **Pesquisa profunda**: rodadas de busca e leitura que terminam num relatório
  com fontes citadas, salvo na pasta do projeto.
- Agentes: personas com modelo, ferramentas, arquivos, conhecimento e sugestões
  iniciais; quatro já vêm no app, junto com prompts prontos com `{{campos}}`.
- Memória (opcional): fatos que o modelo guarda sobre você, numa lista editável.
- **Skills** no formato `SKILL.md` do Claude, carregadas só quando a tarefa pede.
- **Plugins** no formato dos plugins do Claude (skills, comandos, agentes,
  servidores MCP), mais ferramentas próprias por HTTP ou JavaScript isolado.
- **Agenda**: pedidos que o servidor local manda ao modelo no horário, mesmo com
  a aba fechada; as respostas chegam numa conversa.

### Custos, privacidade e sincronização
- Tokens e custo estimado por resposta, por conversa e por dia e modelo (tela de
  uso); cache de prompt na Anthropic; preço informado por você para modelos que
  o app não conhece.
- Chaves de API criptografadas com senha, se quiser (PBKDF2 + AES-GCM).
- Sincronização entre aparelhos por uma pasta mantida pelo Dropbox, Drive,
  OneDrive ou Syncthing, por WebDAV ou por S3, com criptografia opcional; as
  chaves nunca são sincronizadas.
- Backup e restauração de tudo em JSON; exportar uma conversa em Markdown ou
  numa página HTML única; instalável como aplicativo (PWA).
- A versão e o commit em uso aparecem embaixo do nome, então um print já diz
  qual código estava rodando.

## Recursos do servidor local

O `npm run dev` serve o app e, no mesmo endereço, alguns serviços locais que só
aceitam pedidos do próprio TSRS:

| Caminho | O que faz | Pasta |
| --- | --- | --- |
| `/__tsrs/projects` | Pastas de projeto: gravar, listar, ler e servir os arquivos de uma conversa | `projetos/` (`TSRS_PROJECTS`) |
| `/__tsrs/render` | Renderiza composições motion em MP4 | `renders/` ou `videos/` do projeto (`TSRS_RENDERS`) |
| `/__tsrs/ext` | Skills, plugins, ferramentas HTTP, busca na web e leitura de páginas, agenda | `extensoes/` (`TSRS_EXTENSIONS`) |

Nada é apagado de verdade: skills e plugins removidos vão para
`extensoes/_removidas/`, e um vídeo nunca sobrescreve outro. Um build estático
(`npm run build`) continua funcionando só no navegador, sem esses recursos.

## Vídeo motion

Peça uma animação ("uma abertura de 6 segundos em 1080x1920 com o título X"). A
resposta vem num bloco `motion`, que abre no preview com linha do tempo; a trilha
toca junto. **Gerar MP4** renderiza o vídeo no seu computador e salva na pasta
do projeto.

Uma composição é uma página HTML comum. Tamanho, duração e quadros por segundo
vêm de `<meta name="nwlab:size" content="1080x1920">`,
`<meta name="nwlab:duration" content="8">` e
`<meta name="nwlab:fps" content="30">`. O runtime (`public/motion/runtime.js`)
carrega antes dos scripts da página e a posiciona em cada instante `t`:

- animações e transições CSS e Web Animations são pausadas e postas em `t`;
- timelines do anime.js v4 (global `anime`, criadas com `autoplay: false`)
  passadas a `NWLab.register(tl)` são postas em `t`;
- funções passadas a `NWLab.onSeek((t) => …)` ou `window.nwlabSeek(t)` desenham o quadro;
- Lottie (global `lottie`, renderer `svg`, `autoplay: false`) com `goToAndStop` no `onSeek`.

Nada pode depender do relógio (`Date`, `requestAnimationFrame`, `setTimeout`) ou
de `Math.random` sem semente: o mesmo `t` tem de dar o mesmo quadro, e assim o
vídeo sai igual em qualquer máquina. Pelo terminal:

```bash
npm run render -- motion-1.html                      # grava motion-1.mp4 ao lado
npm run render -- motion-1.html --audio trilha.wav   # com trilha, cortada e com fade
npm run render -- motion-1.html --fps 60 --crf 16 --out abertura.mp4
```

É o mesmo contrato das páginas de motion do NWLab ForgeOS.

## Provedores

Anthropic, OpenAI, Google Gemini, OpenRouter, DeepSeek, Mistral, xAI (Grok),
Groq, Perplexity, Command Code, OpenCode Zen e Go (pelo proxy local), Ollama e
LM Studio (locais) e qualquer endpoint compatível com a API de chat da OpenAI
("Custom").

Cada provedor é uma linha em `src/providers.ts`: URL base, caminhos, cabeçalhos
(com `{apiKey}` no lugar da chave) e o formato da API (`openai` ou `anthropic`).
Um provedor compatível com a OpenAI não precisa de código novo.

APIs que recusam chamadas do navegador funcionam pelo `npm run proxy`, que
escuta só em `localhost:8787`, atende só a origem do app e só repassa para os
endereços permitidos (`--allow host` acrescenta outros).

## Estrutura do projeto

| Caminho | Papel |
| --- | --- |
| `src/App.tsx` | Estado das conversas, geração das respostas, layout |
| `src/stream.ts` | Cliente de streaming (fetch + SSE), erros, lista de modelos, laço de ferramentas |
| `src/providers.ts` | Tabela de provedores e preços conhecidos |
| `src/storage.ts` | Configurações no localStorage, conversas no IndexedDB |
| `src/preview.ts`, `src/PreviewPanel.tsx`, `src/MotionStage.tsx` | Preview e linha do tempo do motion |
| `src/projects.ts`, `server/projects.mjs` | Pastas de projeto |
| `src/extensions.ts`, `server/extensions.mjs` | Skills, plugins e ferramentas próprias |
| `src/agenda.ts`, `server/agenda.mjs` | Agenda |
| `src/webSearch.ts`, `src/research.ts`, `server/search.mjs` | Busca própria e pesquisa profunda |
| `render/` | Contrato motion, renderizador de MP4 e o plugin dele no Vite |
| `src/media.ts`, `src/mediaJobs.ts`, `src/mediaPrice.ts` | Serviços de mídia, pedidos e preços |
| `src/knowledge.ts`, `src/embeddings.ts`, `src/extract.ts` | Bases de conhecimento |
| `src/sync*.ts` | Sincronização por pasta, WebDAV ou S3 |
| `src/i18n.ts`, `src/locales/en.ts` | Idioma da interface; textos em inglês indexados pelos em português |
| `proxy/cors-proxy.mjs` | Proxy CORS local |
| `e2e/` | Testes de ponta a ponta e o provedor falso que eles usam |

As conversas ficam no IndexedDB em duas partes: os metadados (título, pasta,
modelo, canvas) e as mensagens, lidas quando a conversa abre.

## Limitações conhecidas

- Sem senha, as chaves de API ficam no `localStorage` em texto puro. Com senha,
  ficam criptografadas em repouso, mas continuam na memória da página enquanto o
  app está desbloqueado.
- Custos são estimativas: o valor do provedor quando ele informa, senão uma
  tabela de preços que pode estar desatualizada, ou o preço que você informou.
- A sincronização por pasta precisa de um navegador que grave em pastas
  (baseados no Chromium); no Firefox e no Safari, use WebDAV ou S3.
- MCP: servidores remotos por HTTP que aceitem chamadas do navegador (CORS), com
  token opcional. Servidores locais por linha de comando, login por OAuth,
  recursos e prompts do MCP não são suportados.
- O preview roda o código gerado isolado do app, mas com acesso à rede; React e
  Mermaid carregam bibliotecas de CDNs públicas.
- Pastas de projeto, renderização de vídeo, skills, plugins, busca própria e
  agenda precisam do servidor local (`npm run dev`); a agenda precisa do
  computador ligado.
- Resultados de ferramentas são textos de terceiros enviados ao modelo; deixe o
  pedido de permissão ligado para servidores em que não confia e instale
  plugins só de quem você confia.

## Como contribuir

Contribuições são bem-vindas: leia o [CONTRIBUTING.pt-BR.md](CONTRIBUTING.pt-BR.md)
para os princípios, como rodar os testes e como mandar um pull request, e o
[Código de Conduta](CODE_OF_CONDUCT.md). Ideias e dúvidas vão para as
[Discussions](../../discussions); problemas e pedidos de recurso, para as
[Issues](../../issues). Problemas de segurança: veja o [SECURITY.md](SECURITY.md).

O que já existe e o que vem a seguir: [ROADMAP.pt-BR.md](ROADMAP.pt-BR.md).

## Licença

[MIT](LICENSE). O anime.js e o lottie-web, incluídos em `public/motion/`, também
são MIT.
