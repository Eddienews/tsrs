# TSRS — The Signal Room Studio

Interface de chat local-first para modelos de IA. Protótipo.

Tudo roda no navegador: as conversas e as chaves de API ficam na sua máquina e
as mensagens vão direto para o provedor escolhido. Não há backend.

## Rodando

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # checagem de tipos + build de produção em dist/
npm test         # testes unitários (vitest)
npm run test:e2e # testes de ponta a ponta (Playwright, com um provedor falso)
npm run proxy    # proxy local opcional para provedores sem CORS (OpenCode)
npm run render -- motion-1.html  # transforma uma composição motion em MP4 (precisa do ffmpeg)
npm run render:serve             # renderizador avulso, para um TSRS servido sem o npm run dev
```

Os testes de ponta a ponta usam o Chromium do Playwright, se instalado
(`npx playwright install chromium`), ou senão o Google Chrome do sistema, no
Linux, no Windows e no macOS. Para outro navegador, aponte `CHROMIUM_PATH` para
ele (por exemplo `/usr/bin/chromium` ou
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).

Abra **Configurações**, informe a chave do provedor, clique em **Carregar
modelos** (ou digite o nome do modelo na barra superior) e envie uma mensagem.

## Recursos

- Respostas em streaming, com Markdown, realce de sintaxe e botão de copiar.
- Editar e reenviar uma mensagem, regenerar a resposta e tentar de novo após um erro.
- Ramificar a conversa a partir de qualquer mensagem e fixar mensagens, que
  ficam como atalhos no topo da conversa.
- Ler a resposta em voz alta com as vozes do sistema e ditar a mensagem pela
  OpenAI, pelo Groq ou pelo reconhecimento de voz do navegador.
- Fontes citadas pelo Perplexity e pela busca do OpenRouter, listadas abaixo da
  resposta.
- Versões: editar ou regenerar guarda a versão anterior da conversa, e as
  setas ‹ › em cada mensagem alternam entre elas.
- Comparar modelos: até três outros modelos respondem à mesma pergunta ao mesmo
  tempo, e as respostas aparecem em colunas lado a lado.
- Ferramentas: servidores MCP remotos (HTTP), com pedido de permissão a cada
  chamada, e busca na web e leitura de páginas executadas pelo provedor
  (Anthropic; busca também no OpenRouter).
- Biblioteca de personas (prompts de sistema com nome, opcionalmente ligados a
  um modelo) e de prompts salvos para inserir na mensagem, com campos
  `{{nome}}` preenchidos na hora de inserir. O app já vem com quatro personas
  (revisor, tradutor, programador e professor) e seis prompts prontos, em
  português ou inglês, editáveis; os que forem apagados podem ser trazidos de
  volta pela Biblioteca.
- Agentes: uma persona pode ter ferramentas próprias, arquivos enviados como
  contexto em todo pedido e sugestões iniciais na tela da conversa vazia.
- Memória (opcional): o modelo guarda fatos sobre você com uma ferramenta, e a
  lista, que você vê e edita na Biblioteca, vai em toda conversa.
- Resumo do contexto: quando a conversa se aproxima do limite do modelo, um
  botão a resume; dali em diante só o resumo e as mensagens seguintes são
  enviados.
- Geração de imagem, vídeo e áudio pelos botões Imagem, Vídeo e Áudio do campo
  de envio. Com as chaves dos provedores: imagens pela OpenAI (GPT Image), pelo
  Gemini (Imagen) e pela xAI (Grok Imagine), vídeo pelo Veo e pelo Grok Imagine,
  e voz pela OpenAI e pelo Gemini. E por serviços de mídia com a chave do próprio
  usuário: ElevenLabs, Runware, fal.ai, Replicate, WaveSpeedAI, Higgsfield,
  Stability AI, Black Forest Labs (FLUX), MiniMax e Cartesia, escolhidos em
  Configurações → Mídia, com o modelo e opções em JSON. Vídeos esperam na fila
  do serviço mostrando o progresso; parar a resposta cancela o pedido na fal.ai,
  no Replicate e na Higgsfield. O arquivo gerado é baixado e fica na conversa.
  Antes de enviar, aparece o custo estimado quando há como saber: pela tabela
  de preços do Veo, pela API de preços da fal.ai e pelas fichas dos modelos do
  Runware.
- Leitura das respostas em voz alta com a voz do navegador ou com uma voz da
  ElevenLabs, da OpenAI ou do Gemini (Configurações → Mídia); respostas longas
  são lidas em trechos, e cada trecho é gerado uma vez por sessão. Das vozes do
  navegador, a escolhida automaticamente é a mais natural do idioma: no
  Microsoft Edge, as neurais "Online (Natural)", grátis. Na ElevenLabs, a lista
  traz as vozes da sua conta (as suas primeiro, com amostra para ouvir) e o
  modelo (Multilingual, v3, Flash), com o preço por mil caracteres.
- Custo: o preço de cada modelo vem do provedor (OpenRouter), da tabela do app
  (Anthropic e OpenAI, outubro de 2026) ou do que você informar em "definir
  preço", ao lado dos tokens da conversa. Áudio da ElevenLabs mostra o custo
  antes (por caractere) e depois de gerar.
- Conversa temporária: fica só na memória da aba, sem histórico, sincronização
  nem memória, e some quando você sai dela.
- Pergunta à parte: selecione um trecho da resposta e pergunte sobre ele num
  painel lateral, sem acrescentar nada à conversa.
- Base de conhecimento local: PDFs, textos, Markdown e HTML viram trechos
  buscados por palavras (BM25), sem API, e opcionalmente também por sentido,
  com o modelo de embeddings de um provedor; os trechos que mais combinam com
  cada pergunta vão junto com ela e aparecem abaixo da resposta, e o modelo pode
  buscar de novo com outras palavras pela ferramenta `knowledge_search`.
  Liga-se por conversa (Parâmetros) ou por persona.
- Canvas: um documento ou código ao lado da conversa, que o modelo escreve e
  edita com ferramentas e você edita à mão; desfazer, ver formatado, abrir no
  preview, baixar e pedir mudanças num trecho selecionado.
- Sincronização entre dispositivos por uma pasta que o Dropbox, o Drive, o
  OneDrive ou o Syncthing mantêm igual, por um servidor WebDAV ou por um bucket
  S3 (AWS, Cloudflare R2, Backblaze B2, MinIO…), com senha opcional (AES-GCM);
  conversas e cada item da biblioteca e documentos, sem as chaves de API.
- Preview: blocos de código HTML, SVG, JavaScript, Markdown, React (JSX/TSX) e
  Mermaid abrem em um painel ao lado da conversa, com abas de código e console e tamanhos de tela; a barra
  de endereço também abre páginas por URL (por exemplo, `localhost:3000`).
- Paleta de comandos (Ctrl/⌘+K) para ir a conversas, trocar de modelo e abrir
  telas. Os atalhos podem ser trocados em Configurações → Atalhos.
- Data e hora de cada mensagem, e um som opcional quando a resposta termina.
- Vídeos com motion: um bloco `motion` é uma página HTML animada (CSS, anime.js,
  Lottie ou desenho próprio por quadro) que abre no preview com uma linha do
  tempo (tocar, pausar, arrastar). O tamanho, a duração e os quadros por segundo
  vêm de `<meta name="nwlab:size" content="1080x1920">`,
  `<meta name="nwlab:duration" content="8">` e `<meta name="nwlab:fps" content="30">`.
  Baixe o arquivo e rode `npm run render -- motion-1.html` para gerar o MP4
  (H.264, com `--audio musica.wav` para uma trilha, nivelada em -14 LUFS). É o
  mesmo contrato das páginas de motion do NWLab ForgeOS: nada toca em tempo real,
  cada quadro é a página posicionada no seu instante e fotografada, então o vídeo
  sai igual em qualquer máquina. Veja [Vídeos com motion](#vídeos-com-motion).
- O modelo é avisado, por uma nota no prompt de sistema, de que o preview existe
  (pode ser desligado em Configurações → Geral).
- Tema claro e escuro, cor de destaque, tamanho da fonte e densidade.
- Anexos: imagens e PDFs (colar, arrastar ou escolher), arquivos de texto e
  planilhas do Excel (.xlsx), lidas no navegador e enviadas como CSV, uma por
  aba, com datas e resultados de fórmulas como o Excel mostra.
- Áudio anexado (MP3, WAV, M4A, OGG, FLAC, até 25 MB) toca na conversa e é
  transcrito na hora pela OpenAI ou pelo Groq (o mesmo provedor do ditado, se
  houver chave); o modelo recebe o texto, já que as APIs de chat não aceitam
  áudio. Sem chave, o arquivo vai junto e o modelo é avisado de que não o ouviu.
  O áudio da conversa também aparece como trilha do vídeo motion.
- Conversas com busca, pastas, etiquetas, arquivo, fixar, renomear e título
  gerado automaticamente; várias de uma vez podem ser arquivadas, movidas,
  etiquetadas ou excluídas.
- Parâmetros por conversa: prompt de sistema, temperatura, máximo de tokens e
  nível de raciocínio.
- Exportar uma conversa em Markdown; backup e restauração de tudo em JSON
  (conversas, pastas, personas, prompts, memória e bases de conhecimento; sem as
  chaves de API); exportar uma
  conversa como página HTML; apagar tudo o que o app guardou no navegador.
- Raciocínio do modelo, recolhido acima da resposta, quando o provedor envia
  (Anthropic a partir dos modelos 4.6, OpenRouter, Ollama, DeepSeek).
- Tokens e custo estimado por resposta e por conversa, com aviso quando o
  contexto do modelo está quase cheio.
- Tela de uso: tokens, custo e respostas por dia e por modelo, nos últimos 7,
  30 ou 90 dias (inclui as versões anteriores das respostas).
- Proteção opcional das chaves de API por senha (PBKDF2 + AES-GCM).
- Instalável como aplicativo (PWA); o build de produção abre sem conexão.
- Erros explicados (chave inválida, limite de uso, falha de rede ou CORS), com
  botão de tentar de novo.
- Interface em português e inglês: segue o idioma do navegador e pode ser
  trocada em Configurações.

## Vídeos com motion

Peça ao modelo uma animação ("faça uma abertura de 6 segundos em 1080x1920 com o
título X"). A resposta vem num bloco `motion`, que abre no preview com uma linha
do tempo.

O MP4 sai do próprio preview: escolha a trilha (um áudio da conversa, como uma
voz ou música gerada, ou um arquivo do computador) e clique em **Gerar MP4**. O
vídeo aparece para baixar e fica salvo em `renders/`, sem sobrescrever os
anteriores. O renderizador já vem dentro do `npm run dev` (e do `vite preview`),
em `/__tsrs/render`, e só aceita pedidos do próprio TSRS; o áudio vai do
navegador para o servidor no mesmo computador e não sai daí. Um TSRS servido de
outro jeito (um build estático) usa o renderizador avulso: `npm run render:serve`,
que escuta só em `127.0.0.1:8788` e atende só o endereço do TSRS (`--origin`
para outros).

Pelo terminal, com um arquivo baixado do preview:

```bash
npm run render -- motion-1.html                      # gera motion-1.mp4 ao lado
npm run render -- motion-1.html --audio trilha.wav   # com trilha, cortada e com fade
npm run render -- motion-1.html --fps 60 --crf 16 --out abertura.mp4
```

Uma composição é uma página HTML comum. O runtime (`public/motion/runtime.js`)
é carregado antes dos scripts dela e a anima assim, a cada instante `t`:

- animações e transições CSS e Web Animations são pausadas e posicionadas em `t`;
- timelines do anime.js v4 (global `anime`, criadas com `autoplay: false`) passadas a
  `NWLab.register(tl)` são posicionadas em `t`;
- funções passadas a `NWLab.onSeek((t) => …)` e `window.nwlabSeek(t)` desenham o quadro;
- Lottie (global `lottie`, renderer `svg`, `autoplay: false`) com `goToAndStop` no `onSeek`.

`window.nwlabReady` (uma promise) faz o render esperar fontes ou arquivos. Nada
pode depender do relógio (`Date`, `requestAnimationFrame`, `setTimeout`) ou de
`Math.random` sem semente: o mesmo `t` tem de dar o mesmo quadro. É o contrato
das páginas de motion do NWLab ForgeOS (MR-013), então uma composição feita aqui
serve de base para um template de lá.

O ffmpeg precisa estar instalado (Windows: `winget install Gyan.FFmpeg`; macOS:
`brew install ffmpeg`; Linux: o gerenciador de pacotes) ou indicado em `FFMPEG`.
O navegador é o mesmo dos testes: `CHROMIUM_PATH`, o Chromium do Playwright, o
Chrome ou o Edge.

## Provedores

Anthropic, OpenAI, Google Gemini, OpenRouter, DeepSeek, Mistral, xAI (Grok),
Groq, Perplexity, Command Code, OpenCode Zen e Go (pelo proxy local), Ollama
(local), LM Studio (local) e qualquer endpoint compatível com a API de chat da
OpenAI ("Custom").

O Command Code aparece duas vezes, com a mesma chave: "Command Code" para os
modelos no formato da OpenAI e "Command Code (Claude)" para os modelos Claude,
que ele só serve no formato da Anthropic. A API dele exige o plano Pro.

Na Anthropic, o cache de prompt fica ligado por padrão: a parte da conversa já
enviada é cobrada a cerca de 10% do preço nas mensagens seguintes. O rodapé de
cada resposta mostra quantos tokens vieram do cache.

As APIs do OpenCode não aceitam chamadas do navegador. Para usá-las, rode
`npm run proxy` na pasta do TSRS: o proxy escuta só em `localhost:8787`, atende
só a origem do app (`--origin` para outra) e só repassa para `opencode.ai`
(`--allow host` acrescenta outros). Ele vem ligado nos provedores do OpenCode e
pode ser ligado nos locais e no Custom. O plano gratuito do Zen só funciona
dentro do próprio OpenCode.

Cada provedor é uma linha na tabela de `src/providers.ts`: URL base, caminhos,
cabeçalhos (com `{apiKey}` como placeholder) e o formato da API (`openai` ou
`anthropic`). Um provedor compatível com OpenAI não exige código novo.

## Estrutura

| Arquivo                  | Papel                                                       |
| ------------------------ | ----------------------------------------------------------- |
| `src/providers.ts`       | Tabela declarativa de provedores e preços conhecidos        |
| `src/stream.ts`          | Cliente de streaming (fetch + SSE), erros e lista de modelos |
| `src/storage.ts`         | Configurações em localStorage, conversas em IndexedDB       |
| `src/crypto.ts`          | Criptografia das chaves de API                              |
| `src/mcp.ts`             | Conexão com servidores MCP                                  |
| `src/tools.ts`           | Ferramentas oferecidas ao modelo em cada requisição         |
| `src/memory.ts`          | Ferramentas e prompt da memória                             |
| `src/summary.ts`         | Resumo do contexto                                          |
| `src/media.ts`           | Serviços de mídia: pedido, fila, progresso e download       |
| `src/MediaSection.tsx`   | Seção Mídia das Configurações                               |
| `src/knowledge.ts`       | Trechos e busca (palavras e sentido) da base de conhecimento |
| `src/embeddings.ts`      | Vetores dos trechos e das perguntas, pelo provedor          |
| `src/extract.ts`         | Texto de PDFs (pdf.js), HTML e arquivos de texto            |
| `src/spreadsheet.ts`     | Leitura de planilhas .xlsx (abertas com fflate)             |
| `src/KnowledgeTab.tsx`   | Bases de conhecimento na Biblioteca                         |
| `src/canvas.ts`          | Ferramentas e texto do canvas                               |
| `src/CanvasPanel.tsx`    | Painel do canvas                                            |
| `src/sync.ts`            | Formato da pasta de sincronização e quem vence cada mudança |
| `src/syncFolder.ts`      | Acesso à pasta pelo navegador (File System Access API)      |
| `src/syncRemote.ts`      | Sincronização por WebDAV e S3 (assinatura AWS v4)           |
| `src/SyncSection.tsx`    | Seção Sincronização das Configurações                       |
| `src/SideChat.tsx`       | Painel da pergunta à parte                                  |
| `proxy/cors-proxy.mjs`   | Proxy local para provedores e servidores sem CORS           |
| `src/ToolsDialog.tsx`    | Ferramentas web e servidores MCP                            |
| `src/usage.ts`           | Contagem de tokens, custo e uso do contexto                 |
| `src/report.ts`          | Totais de uso por dia e por modelo                          |
| `src/UsageView.tsx`      | Tela de uso                                                 |
| `src/branches.ts`        | Versões de uma conversa (edições e regenerações)            |
| `src/files.ts`           | Leitura de anexos, exportação Markdown e backup             |
| `src/i18n.ts`            | Idioma da interface e tradução dos textos (`t()`)           |
| `src/locales/en.ts`      | Textos em inglês, indexados pelo texto em português         |
| `src/App.tsx`            | Estado das conversas, geração de respostas e layout         |
| `src/Sidebar.tsx`        | Busca, pastas, conversas fixadas e menus                    |
| `src/ChatTopBar.tsx`     | Modelo, persona, uso de tokens e atalhos da conversa        |
| `src/MessageView.tsx`    | Mensagem, edição, versões e ações                           |
| `src/Markdown.tsx`       | Markdown das respostas (carregado logo após abrir o app)    |
| `src/MarkdownRenderer.tsx` | Renderização do Markdown e blocos de código               |
| `src/ToolCallBlock.tsx`  | Chamada de ferramenta e pedido de permissão                 |
| `src/Composer.tsx`       | Campo de envio, anexos e prompts salvos                     |
| `src/PreviewPanel.tsx`   | Painel de preview                                           |
| `src/preview.ts`         | Documento do preview, console e endereços                   |
| `src/MotionStage.tsx`    | Composição motion no preview, com a linha do tempo          |
| `render/motion.mjs`      | Contrato motion, comum ao preview e ao render               |
| `render/render.mjs`      | `npm run render`: composição motion para MP4                |
| `render/serve.mjs`       | Renderizador do botão Gerar MP4 (e `npm run render:serve`)  |
| `render/vite-plugin.mjs` | Renderizador dentro do `npm run dev`, em `/__tsrs/render`   |
| `src/RenderBar.tsx`      | Trilha e botão Gerar MP4 do preview                         |
| `src/videoRender.ts`     | Conversa com o renderizador local                           |
| `public/motion/`         | Runtime motion, anime.js 4.5.0 e lottie-web 5.13.0 (MIT)    |
| `src/prompts.ts`         | Campos `{{nome}}` dos prompts salvos                        |
| `src/starters.ts`        | Personas e prompts que já vêm no app                        |
| `src/CommandPalette.tsx` | Paleta de comandos                                          |
| `src/shortcuts.ts`       | Atalhos de teclado configuráveis                            |
| `src/sound.ts`           | Som ao terminar a resposta                                  |
| `src/appearance.ts`      | Tema, cor de destaque, fonte e densidade                    |
| `src/components/ui/`     | Componentes de interface (shadcn/ui sobre Radix)            |
| `src/styles.css`         | Tailwind e as variáveis de cor e tipografia                 |
| `src/ParamsPanel.tsx`    | Parâmetros da conversa                                      |
| `src/SettingsDialog.tsx` | Chaves, URLs base, títulos, segurança e dados               |
| `src/UnlockDialog.tsx`   | Pedido de senha para desbloquear as chaves                  |
| `src/LibraryDialog.tsx`  | Personas, agentes, prompts salvos e memória                 |
| `src/CompareDialog.tsx`  | Escolha do modelo para comparar uma resposta                |
| `public/sw.js`           | Service worker: app disponível sem conexão                  |
| `e2e/`                   | Testes de ponta a ponta e o provedor falso que eles usam    |

No IndexedDB, cada conversa é gravada em duas partes: os metadados (título,
pasta, modelo, canvas) e as mensagens. A lista lateral lê só os metadados; as
mensagens são lidas quando a conversa é aberta. Os documentos das bases de
conhecimento ficam num terceiro depósito, já divididos em trechos.

## Roadmap

Próximos passos em [ROADMAP.md](ROADMAP.md) e nas issues do repositório.

## Contribuindo

Veja o [CONTRIBUTING.md](CONTRIBUTING.md): princípios, como rodar os testes,
estilo do código e como mandar um pull request.

## Limitações conhecidas

- Sem senha, as chaves de API ficam no `localStorage` em texto puro. Com senha,
  ficam criptografadas em repouso, mas continuam na memória da página enquanto
  o app está desbloqueado.
- O custo é uma estimativa: usa o valor informado pelo provedor quando existe
  e, senão, uma tabela de preços que pode estar desatualizada. Sem preço
  conhecido, só os tokens são mostrados.
- A sincronização por pasta precisa de um navegador que grave em pastas
  (Chrome, Edge, Arc e outros baseados no Chromium); no Safari e no Firefox,
  use WebDAV ou S3. O servidor ou bucket precisa aceitar chamadas do navegador
  (CORS), ou ser acessado pelo proxy local. Vale a mudança mais recente de cada
  conversa e de cada item da biblioteca.
- Sem busca por sentido, a base de conhecimento só acha palavras: sinônimos e
  paráfrases ficam de fora. Com ela, os documentos e as perguntas vão ao
  provedor de embeddings. PDFs que são só imagem (escaneados) não têm texto.
- MCP: só servidores remotos por HTTP que aceitem chamadas do navegador (CORS),
  com token opcional. Servidores locais por linha de comando, login por OAuth,
  recursos e prompts do MCP não são suportados.
- O resultado de uma ferramenta é texto vindo de terceiros e vai para o modelo;
  mantenha o pedido de permissão ligado para servidores em que não confia.
- Textos já gravados (erros, rótulos de ferramentas) não mudam ao trocar o idioma.
- A busca, a exportação em Markdown e o total de tokens consideram só a versão
  atual de cada conversa, não as versões alternativas.
- Preview: o código gerado roda em um frame isolado, sem acesso às chaves e às
  conversas, mas com acesso à rede. React e Mermaid carregam bibliotecas de CDNs
  públicas (esm.sh, jsDelivr e o CDN do Tailwind), então precisam de internet;
  pacotes npm importados pelo componente vêm do esm.sh. Muitos sites proíbem ser exibidos dentro de outra página e
  aparecem em branco; o botão de abrir em nova aba contorna isso. O que está
  aberto no painel não é guardado entre sessões.
- PDFs dependem do suporte do provedor e do modelo escolhidos.
- O render de vídeo roda na pasta do projeto (Node, ffmpeg e Chrome, Edge ou o
  Chromium do Playwright), não no app instalado nem só no navegador. Ele é
  offline: o que a composição pede da internet é bloqueado e listado
  (`--online` libera). Arquivos ao lado da composição (imagens, fontes) podem
  ser usados por caminho relativo. Um vídeo existente nunca é sobrescrito.
- Provedores que não liberam CORS para o navegador precisam do proxy local
  (`npm run proxy`), que não roda no app instalado sem a pasta do projeto.
- Os arquivos de um agente ficam junto das configurações, no `localStorage`, e
  somam no máximo cerca de 1,5 MB.
- O custo do que é gerado só entra na conta da conversa quando o serviço o
  informa (o Runware informa; os outros não).
- Replicate, Higgsfield e Black Forest Labs não aceitam chamadas do navegador e
  precisam do proxy local. Quando o armazenamento de um serviço não deixa o navegador baixar o
  arquivo, ele fica só no link do serviço, que expira (em geral em 7 dias).
- Vídeos e áudios gerados ficam guardados na conversa e entram no backup e na
  sincronização, o que pode deixá-los grandes.
- A memória e os agentes com ferramentas precisam de um modelo que use
  ferramentas.

## Licença

[MIT](LICENSE)
