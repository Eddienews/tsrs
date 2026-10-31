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
> máximo do TSRS: [docs/MANUAL.pt-BR.md](docs/MANUAL.pt-BR.md). E o tutorial em
> vídeo, em 14 aulas curtas: [TSRS em 14 aulas](https://radiant-tulip-gc8d.here.now/).

![Uma conversa que criou uma landing page, com o preview ao vivo ao lado](docs/screenshots/chat-and-preview.png)

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

## Telas

<table>
<tr>
<td width="50%"><a href="docs/screenshots/compare.png"><img src="docs/screenshots/compare.png" alt="Três modelos comparados lado a lado"></a><br><sub>Três modelos comparados lado a lado</sub></td>
<td width="50%"><a href="docs/screenshots/motion.png"><img src="docs/screenshots/motion.png" alt="Uma composição motion com a linha do tempo, pronta para virar MP4"></a><br><sub>Uma composição motion com a linha do tempo, pronta para virar MP4</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/screenshots/production-board.png"><img src="docs/screenshots/production-board.png" alt="O quadro de produção: cada episódio e anúncio, coluna por coluna"></a><br><sub>O quadro de produção: cada episódio e anúncio, coluna por coluna</sub></td>
<td width="50%"><a href="docs/screenshots/mission-control.png"><img src="docs/screenshots/mission-control.png" alt="O Painel do dia: foco, uso, produção e agentes num relance"></a><br><sub>O Painel do dia: foco, uso, produção e agentes num relance</sub></td>
</tr>
</table>

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
Depois disso a lista se atualiza sozinha uma vez por dia, e os modelos novos
(inclusive os seus, de fine-tuning) aparecem marcados como novos. Com o [Ollama](https://ollama.com) instalado, modelos locais funcionam sem chave
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
- Continuar uma conversa longa numa nova: o modelo escreve uma passagem (o
  objetivo, as decisões, os arquivos, o próximo passo) e a conversa nova começa
  dela, com o mesmo modelo, os mesmos ajustes e a mesma pasta do projeto. Ou
  resumir o contexto ali mesmo, ou limpar o contexto a partir de qualquer ponto
  (dá para desfazer), para as mensagens anteriores deixarem de ser enviadas.
- Paleta de comandos (Ctrl/⌘+K), atalhos configuráveis, data e hora, som ao
  terminar, tema claro e escuro, cor de destaque, tamanho da fonte e densidade.
- Interface em português e inglês.

### Arquivos e conhecimento
- Anexe imagens, PDFs, textos, arquivos do Word e do PowerPoint (lidos como
  Markdown, slide a slide com as notas), planilhas do Excel (lidas como CSV, uma
  por aba), áudio (transcrito pela OpenAI, pelo Groq ou pelo Whisper local, para
  qualquer modelo usar) e vídeo: até 16 quadros espalhados por ele vão como
  imagens, com a transcrição do que se fala, para qualquer modelo com visão
  conversar sobre ele.
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
- **Vídeos curtos** (Reels, TikTok, Shorts): peça um tema e o TSRS narra as cenas
  com o tempo de cada palavra, busca trechos de vídeo gratuitos (Pexels, Pixabay)
  para cada uma, corta na voz, põe legendas palavra a palavra, título, cartão final
  e música por baixo da voz, e salva o MP4 com um `CREDITOS.md` na pasta do projeto.
- **Ferramentas de design** para as páginas que a conversa faz: o modelo busca
  imagens reais e de licença aberta do assunto (Openverse, Wikimedia Commons, Art
  Institute of Chicago, Met; sem chave), salva em `imagens/` com os créditos em
  `CREDITOS.md`, e **olha a própria página**: renderizada no seu Chrome ou Edge
  em largura de computador, tablet e celular, medida (estouro de largura, imagem
  quebrada, contraste, texto cortado ou coberto) e fotografada, para corrigir o
  que vê. Com a skill de exemplo **taste-skill** ligada (de
  [Leonxlnx](https://github.com/Leonxlnx/taste-skill), MIT), também sorteia uma
  direção de arte de uma biblioteca estudada em 247 sites e confere a página
  contra o estilo dela. Precisa do Node 22.
- **Componentes React** para projetos em React ou Next.js: o modelo busca no
  [cult/ui](https://github.com/nolly-studio/cult-ui) (uns 150 componentes, MIT)
  e copia o que precisa para `components/ui/`, com os componentes do shadcn de
  que ele depende, os pacotes npm a instalar e o crédito em `CREDITOS.md`;
  arquivos que já existem no projeto são mantidos. Um `DESIGN.md` na pasta do
  projeto vai junto em todo pedido e vale mais que o padrão de qualquer skill.

### Mídia e voz
- Imagens, vídeo, voz, música e efeitos sonoros com as chaves dos provedores
  (OpenAI, Gemini, xAI) ou de serviços de mídia (ElevenLabs, Runware, fal.ai,
  Replicate, WaveSpeedAI, Higgsfield, Stability AI, Black Forest Labs, MiniMax,
  Cartesia), com o custo estimado antes de enviar quando o serviço publica.
- Leitura das respostas em voz alta com a voz mais natural do navegador (as
  vozes neurais grátis do Microsoft Edge) ou com uma voz da ElevenLabs, da
  OpenAI ou do Gemini; escolha as suas vozes da ElevenLabs, com amostra e preço,
  ou crie uma nova pelo app: desenhada a partir de uma descrição (três versões
  para escolher) ou clonada de gravações, com a autorização de quem fala.
- Vozes locais grátis, sem chave e sem internet depois do primeiro download: o
  Piper lê as respostas em voz alta (e narra os vídeos curtos) e o Whisper
  transcreve o ditado e os áudios anexados, os dois rodando no navegador. O
  servidor do TSRS baixa cada modelo uma vez para `modelos/` e serve de lá.
- Ditado pela OpenAI, pelo Groq, pelo Whisper local ou pelo reconhecimento de
  voz do navegador.

### Ferramentas, agentes e extensões
- Interpretador de JavaScript (opcional, em Ferramentas): o modelo roda código
  para contas exatas, análise dos CSVs e planilhas anexados e gráficos que
  aparecem na resposta. O código roda num worker dentro de um frame isolado, sem
  internet e sem acesso ao app nem às chaves.
- Servidores MCP remotos, com permissão antes de cada chamada.
- Busca na web e leitura de páginas pelo provedor (Anthropic, OpenRouter) ou com
  **a sua própria chave** (Brave, Tavily, Google, Kagi) para qualquer modelo,
  com fontes.
- **Pesquisa profunda**: rodadas de busca e leitura que terminam num relatório
  com fontes citadas, salvo na pasta do projeto.
- Agentes: personas com modelo, parâmetros (temperatura, máximo de tokens,
  raciocínio), ferramentas, skills e plugins, arquivos, conhecimento e
  sugestões iniciais; chame um para uma mensagem com **@nome**. Quatro já vêm
  no app, junto com prompts prontos com `{{campos}}`.
- Galeria da comunidade com mais de 50 prompts, por categoria, para adicionar
  à biblioteca.
- Skills e plugins de exemplo que se instalam com um clique (Extensões →
  Exemplos), com ferramentas grátis e sem chave: câmbio, feriados, clima e
  Wikipédia.
- **Prompts encadeados**: prompts salvos com etapas, cada uma enviada quando a
  resposta anterior termina, com `{{resposta}}` para essa resposta.
- Memória (opcional): fatos que o modelo guarda sobre você, numa lista editável.
- **Skills** no formato `SKILL.md` do Claude, carregadas só quando a tarefa pede.
- **Plugins** no formato dos plugins do Claude (skills, comandos, agentes,
  servidores MCP), mais ferramentas próprias por HTTP ou JavaScript isolado.
- **Agenda**: pedidos que o servidor local manda ao modelo no horário, mesmo com
  a aba fechada, se quiser com a sua busca na web, skills e ferramentas HTTP de
  plugins; as respostas chegam numa conversa.

### Estúdio
- **Agentes do seu computador**: o Claude Code e o Codex respondem numa
  conversa como qualquer modelo, pela linha de comando deles, com o login e o
  plano deles. Trabalham na pasta de projeto da conversa com as próprias
  ferramentas (os comandos e as edições aparecem na resposta), e as mensagens
  seguintes continuam a mesma sessão. Nas configurações ficam o comando e o que
  o agente pode fazer ali: só ler, editar arquivos ou acesso total.
- **Painel do dia**: respostas, tokens e custo de hoje, uma lista do que fazer
  hoje, as execuções da agenda, o quadro de produção por etapa com o que vence
  na semana, os agentes de linha de comando e quanto do limite do plano já foi
  usado, e o trabalho recente. O TSRS pode abrir nele.
- **Quadro de produção**: um card por episódio, anúncio ou vídeo, movido pelas
  etapas (roteiro, takes, montagem, render, revisão, publicado, ou colunas
  suas). O card se liga a uma conversa, mostra o prazo e conta os takes da pasta
  do projeto (`takes/*.json`). Fica em `projetos/_producao/quadro.json`, com a
  versão anterior ao lado.
- **Mesa de agentes**: agentes da Biblioteca trabalham juntos numa tarefa, cada
  um no seu papel, em até três rodadas em que todos leem o que os outros
  escreveram; um coordenador escreve o resultado. Cada agente usa o próprio
  modelo, inclusive agentes de linha de comando. A rodada fica em `mesa.md` na
  pasta dela e pode virar conversa.
- **Conversa por voz**: mãos livres; você fala, na pausa a mensagem vai, a
  resposta é lida em voz alta e o microfone abre de novo.
- **Obsidian**: as conversas viram notas no seu cofre, com modelo, datas e
  etiquetas nas propriedades, salvas pelo menu ou a cada resposta.
- As seções da barra lateral que você não usa podem ser escondidas.

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
- Perfis (pessoal, trabalho…): cada um com as suas chaves, conversas,
  biblioteca, senha, sincronização e backup, trocados pela barra lateral.
- Backup automático no disco: alguns segundos depois de cada mudança, conversas,
  biblioteca e configurações são copiadas para `backups/` na pasta do TSRS (uma
  cópia por dia durante 14 dias). Se o navegador apagar os dados, o TSRS oferece
  trazer tudo de volta; as chaves de API só entram cifradas com a sua senha.
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
| `/__tsrs/cli` | Inicia o Claude Code ou o Codex na pasta da conversa e repassa o que eles escrevem | a pasta de projeto da conversa |
| `/__tsrs/board` | O quadro de produção, e os takes contados numa pasta de projeto | `projetos/_producao/` |
| `/__tsrs/agent` | O comando `tsrs`, para agentes: exige o token de `extensoes/.tsrs-agent.json` e recusa páginas web | — |

Nada é apagado de verdade: skills e plugins removidos vão para
`extensoes/_removidas/`, e um vídeo nunca sobrescreve outro. Um build estático
(`npm run build`) continua funcionando só no navegador, sem esses recursos.

## Agentes: o comando tsrs

Claude Code, Codex ou um bot podem usar o TSRS que está rodando, pelo terminal:

```bash
npm link                     # uma vez, na pasta do TSRS: põe o `tsrs` no PATH
tsrs status
tsrs projects new "Cafe Aurora ad"
tsrs projects write cafe-aurora-ad ad.html --from ./ad.html
tsrs render motion cafe-aurora-ad ad.html --audio midia/track.mp3
tsrs board move "Cafe Aurora ad" render
tsrs agenda run "Resumo de IA"          # sai com 3: chama um modelo pago; com --yes depois de combinado
```

| Tipo | Comandos | Sem `--yes` |
| --- | --- | --- |
| leitura | `status`, `projects list/files/read`, `design check`, `video check`, `h3 prompt`, `film check`, `takes list`, `jobs list/status/wait`, `night status`, `access`, `ledger`, `board list`, `agenda list` | — |
| escrita | `projects new/write`, `render motion`, `video run`, `take`, `film shots/take`, `turnaround`, `takes check/rate`, `edit export`, `jobs cancel`, `night plan/cancel`, `board add/move/update/remove`, `image local` | substituir um arquivo, ou gerar voz no `video run`, só diz o que faria |
| custo | `agenda run` | só diz qual modelo pago chamaria |

`tsrs --help` lista todos e `tsrs <comando> --help` mostra os argumentos (a
ajuda é em inglês). Com `--json` a resposta tem formato estável
(`{ ok, text, result }` ou `{ ok: false, code, error }`). Códigos de saída: `0`
feito, `2` argumentos errados, `3` precisa de `--yes`, `4` o TSRS não está
rodando, `5` falhou. `tsrs mcp` oferece os mesmos comandos como servidor MCP por
stdio, por exemplo `claude mcp add tsrs -- tsrs mcp`; as ferramentas que pedem
`--yes` recebem `yes: true`. `skills/tsrs/SKILL.md` ensina as regras a um agente
(copie para `~/.claude/skills/tsrs/` ou a pasta de skills do seu agente).

Cada `npm run dev` grava um token novo em `extensoes/.tsrs-agent.json`, que só o
seu usuário lê; o comando o envia, e pedidos de páginas web são recusados.
Conversas, biblioteca, memória, mesa de agentes e mídia paga ficam no navegador
e ainda não estão no comando.

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

### Render mais rápido e o manifesto

Vários navegadores sem janela capturam os quadros ao mesmo tempo, cada um um
trecho do vídeo, e os trechos são unidos sem codificar de novo: cerca de metade
dos núcleos do processador, no máximo 8 (`--workers <n>` para escolher). Ao lado
de cada vídeo fica `<vídeo>.manifest.json`: a composição e cada arquivo que ela
carregou, o áudio, cada um com seu SHA-256; as versões do TSRS, do Node, do
ffmpeg e do navegador; as configurações; e o SHA-256 do próprio vídeo. As mesmas
entradas listam os mesmos hashes, então um vídeo que mudou mostra o que mudou.

## Vídeos narrados (video.json)

Um vídeo narrado a partir de um roteiro na pasta do projeto: voz, o tempo de
cada palavra, a mixagem, o render, legendas e uma versão 9:16, num comando só.

```json
{
  "name": "formulario-seguro",
  "composition": "formulario-seguro.html",
  "voice": { "provider": "runware", "voice": "826be797681d4b1a92042b54b3c75c64", "language": "pt" },
  "music": { "file": "midia/trilha.flac", "volume": -11 },
  "timing": { "lead": 0.6, "gap": 0.6, "tail": 3 },
  "words": "whisper",
  "captions": true,
  "vertical": true,
  "scenes": [
    { "id": "gancho", "text": "Seu formulário de contato parece inofensivo." },
    { "id": "dica1", "text": "Um: valide tudo no servidor.", "gap": 0.9 }
  ]
}
```

```bash
npm run video -- projetos/formulario-seguro --check   # o que falta, o que faria e gastaria
npm run video -- projetos/formulario-seguro --yes     # --yes: gera as falas novas
tsrs video check formulario-seguro                     # o mesmo, para agentes
tsrs video run formulario-seguro --yes
```

1. **Voz.** `"provider": "files"` usa o `"audio"` de cada cena (um arquivo do
   projeto). `"runware"` gera cada fala com uma voz Runware/HeyGen
   (`RUNWARE_API_KEY` onde o TSRS roda): primeiro o modelo grátis, o pago se ele
   falhar. As falas ficam em `midia/voz/` e só são geradas de novo quando o texto
   ou a voz mudam; gerar voz pede `--yes`.
2. **Tempos.** O silêncio nas pontas de cada fala é cortado, as cenas são postas
   uma depois da outra (`lead`, `gap`, `gap` por cena, `tail`) e o tempo de cada
   palavra é medido: Whisper neste computador, grátis (`"words": "whisper"`, o
   modelo `whisper-base_timestamped`, baixado uma vez para `modelos/`), aplicado
   às palavras do próprio roteiro mesmo quando ele entende errado; sem ele, ou
   com `"words": "pauses"`, as palavras seguem as pausas da voz. Tudo vai para
   `video/<nome>/timing.lock.json`.
3. **Mixagem.** A narração sobre a música, que abaixa quando a voz fala.
4. **Render.** A composição na duração da narração, com a linha do tempo na
   página: `NWLab.timeline` (cenas com `start`, `dur`, `text`, `words`) e
   `NWLab.word('cena', 'palavra', n, desvio)`, o segundo em que a voz diz aquela
   palavra. O `--check` avisa quando a página espera uma palavra que o roteiro
   não diz.
5. **Legendas** (`"captions": true` ou um estilo: `size`, `color`, `accent`,
   `band`, `font`, `position`): uma linha por vez, a palavra falada na cor de
   destaque, desenhadas pelo runtime (não precisa de libass).
6. **9:16** (`"vertical": true`): o vídeo na largura sobre uma cópia desfocada de
   si mesmo, as legendas abaixo. Com os dois, a composição é renderizada uma vez
   sem legendas (`video/<nome>/clean.mp4`) e as legendas são postas por cima em
   cada formato.

Os vídeos vão para `videos/` com seus manifestos, que guardam também os hashes
do roteiro e do arquivo de tempos.

## Takes do MiniMax H3

Vídeo com som, feito neste computador pelo MiniMax H3 no ComfyUI com os nós
ComfyUI-MiniMaxH3-Easy, no mesmo grafo do workflow deles. O TSRS acha os
arquivos pelo nome no que o ComfyUI tem: o modelo FL2VA
(`diffusion_models/minimax_h3_fl2va*`; o Ref2VA para fotos de referência), um
text encoder do H3 (Qwen3-VL-4B com a projeção ClipProj, ou outro), os dois VAEs
do H3 e, se houver, uma LoRA de 4 passos (4 passos em vez de 20). Um take de
3 s em 480P levou 83 s numa RTX 3070 Laptop (8 GB).

Um shot é um arquivo JSON do projeto:

```json
{
  "scene": "Seu Silva at his desk, morning light through the blinds",
  "size": "MS", "angle": "eye level", "movement": "push-in",
  "beats": ["he types slowly", "he stops and looks at the camera"],
  "dialogue": [{ "speaker": "Seu Silva", "voice": "a calm, low voice", "text": "Bom dia.", "language": "pt" }],
  "soundscape": "Keyboard clicks, a fan humming",
  "seconds": 5
}
```

```bash
tsrs h3 prompt seu-silva-ep07 shots/s01.json             # o prompt do H3, os frames, o que corrigir
tsrs take seu-silva-ep07 shots/s01.json --image midia/s01.png   # vai para a fila: responde na hora com o id
tsrs jobs wait take-001-k3x9a --seconds 300              # espera (no máximo 600 s por chamada)
tsrs jobs cancel take-001-k3x9a                          # para também no ComfyUI
```

- **Prompt.** O shot é escrito no formato do próprio H3 (`integrated_multimodal_description`,
  `overall_soundscape`, `non_diegetic_music`; com referências, `subject_definitions`,
  `retention_analysis`, `detailed_description`). Tamanho, ângulo e movimento
  viram as frases de câmera do guia da MiniMax; as batidas viram "First, … Then,
  … Finally, …" (nunca `[Shot 2]`, que pede um corte); cada fala vai em
  `<d>[Portuguese] …</d>` com a frase que fecha a boca depois; um shot sem fala
  diz "Mouths stay closed." e "Only ambient sound is heard."
- **Duração.** O H3 aceita 17n+5 frames a 24 fps (22 a 362): 5 s = 124, 8 s = 192, 10 s = 243.
- **Checagens** antes de renderizar: duração que o H3 não aceita, mais palavras
  do que cabem (3,4 por segundo em inglês, 2,8 em português), fala escrita na
  cena, prompt com mais de 7000 caracteres e frases com "no X" / "sem X": o H3
  não tem prompt negativo, então nomear algo tende a trazê-lo. Erros barram o
  take; avisos vêm junto.
- **Início.** `--image` (primeiro quadro), `--last`, os dois, ou `--refs` (até 9
  fotos de referência, Ref2VA); o arquivo do shot também pode trazê-los.
- **Fila.** Um take por vez na GPU, em ordem; a resposta é o id do job. Um take
  cancelado ou que passou do tempo sai da fila do ComfyUI e é interrompido.
- **Saída.** `takes/<nome>.mp4` e `takes/<nome>.json` (status `pending`, prompt,
  seed, passos, modelos, frames, fotos): o quadro conta com os takes do cartão.

### Takes checados e o corte para o Resolve

Todo take é checado quando fica pronto (na CPU; `--check no` para pular), e o
veredito vai para `takes/<nome>.json`; um take reprovado vira `redo`:

- **As falas** são ouvidas pelo Whisper neste computador e comparadas com o
  roteiro: menos de 85 % das palavras ouvidas, 3 ou mais seguidas faltando, ou
  o final faltando reprova. Números são escritos por extenso em português e
  inglês, e acentos não contam. Voz num shot sem fala também reprova; palavras
  depois das falas ficam anotadas (a boca pode continuar mexendo).
- **A imagem**: um corte dentro do shot reprova e dá o trecho mais longo sem
  corte, para aparar; com `--image`/`--last`, se o primeiro e o último quadros
  seguraram as fotos. Os limites vêm do FastH3 em 1280x736 e cada número fica
  no relatório, para ajustar em outros builds.

Um take de 5 s em 480P com uma fala em português levou 119 s para sair e 16 s
para ser checado numa RTX 3070 Laptop; o Whisper ouviu as 7 palavras.

```bash
tsrs takes list seu-silva-ep07                  # status, checagens, ★ o melhor take de cada shot
tsrs takes check seu-silva-ep07 s01             # checa de novo
tsrs takes rate seu-silva-ep07 s01-2 approved   # approved, redo ou pending
tsrs edit export seu-silva-ep07 --music midia/trilha.flac
```

O `edit export` pega o melhor take de cada shot (o aprovado; senão um que
passou nas checagens; senão o mais novo que não está como redo), na ordem dos
shots (ou `--takes s01,s03-2,s02`), apara cada um no trecho sem corte e grava em
`exports/`: `<nome>.fcpxml` (FCPXML 1.11, a música numa trilha própria; no
DaVinci Resolve: File > Import > Timeline), `<nome>.edl` (CMX 3600, só imagem) e
`<nome>-resolve.zip` (o FCPXML com as mídias ao lado).

### Um filme planejado e checado antes de renderizar (film.json)

Quem dirige — você, o Claude, o Codex ou um bot — escreve o plano num arquivo
do projeto, o `film.json`: a bíblia (elenco com descrição, voz e fotos; locais;
o look) e as cenas com seus shots. O TSRS confere tudo do mesmo jeito sempre e
diz exatamente o que corrigir, shot a shot, então a qualidade não depende do
modelo que escreveu o plano. Formato e exemplo: veja a seção em inglês no
README.md.

```bash
tsrs film check seu-silva-ep07    # ✗ o que corrigir, ! o que olhar, ✓ pronto — shot a shot
tsrs film take seu-silva-ep07     # grava shots/*.json e põe um take de cada na fila, em ordem
```

- As descrições da bíblia entram palavra por palavra em todo shot do personagem
  ou do local; as falas ficam fora da imagem, em `<d>` com o idioma.
- As checagens: elenco e locais que existem na bíblia, quem fala está no shot,
  alguém citado na ação mas fora do elenco (o modelo desenharia um estranho),
  duração, palavras por segundo, fala na ação, "sem X" e os inícios abaixo.
- `start`: `text`; `cast` (as fotos do elenco como referência: o rosto não muda
  de shot para shot); `previous` (abre no último quadro do take do shot
  anterior: movimento contínuo; espera aquele take na fila); `image` (abre numa
  foto do projeto).

#### Falas na sua voz clonada (ElevenLabs)

Dê a um personagem `"elevenlabsVoice": "<id da voz>"` (uma voz clonada no
ElevenLabs) e todo take em que só ele fala sai com as falas nessa voz: depois
que o H3 faz o take, o som passa pelo voice changer do ElevenLabs, que mantém o
tempo, então a boca continua sincronizada; o volume é igualado ao do take, o som
original fica em `takes/<take>.h3.mp4` e as checagens ouvem a voz clonada. Um
shot com falas de mais de uma voz fica com as vozes do H3 (o voice changer muda
todas as vozes que ouve), e o `film check` avisa. A chave é a variável
`ELEVENLABS_API_KEY` (no Windows, `setx ELEVENLABS_API_KEY "..."` funciona sem
reiniciar o TSRS); usa créditos do ElevenLabs, cerca de um segundo de áudio por
segundo de fala. Chave recusada (HTTP 401/403) para na hora.

```bash
tsrs takes revoice seu-silva-ep07 c1-s01 --voice e1MAZ8in8PhkrhQwfrMh --yes   # um take que já existe
tsrs takes revoice seu-silva-ep07 c1-s01 --voice h3                            # a voz do H3 de volta
tsrs take seu-silva-ep07 shots/c1-s01.json --revoice no                        # este take sem trocar
```

### Bots que dirigem: o modo estúdio, o ledger e o benchmark

- **Acesso "Só o estúdio"** para o Claude Code e o Codex (Configurações): o
  agente só tem os comandos do TSRS (o servidor MCP dele), os próprios arquivos
  da pasta, nenhum terminal (`--restricted` no Claude Code), nenhuma das suas
  chaves no ambiente (só o login dele), uma linha dizendo que arquivos e
  resultados de ferramentas são material, nunca instrução, e no máximo 2 horas
  por turno.
- **Chamada recusada não é repetida igual**: a mesma chamada em 2 minutos
  recebe a mesma recusa e "mude o que fez falhar", até algo mudar.
- **`tsrs ledger`**: o que os comandos fizeram de verdade, pelos registros do
  TSRS; o bot termina o relatório com ele em vez da memória.
- **O benchmark** mede o quanto um agente dirige bem o TSRS, do mesmo jeito para
  o Claude, o Codex ou um bot como o Nori do OpenMausBot. Oito briefs
  (`bench/briefs.json`) rodam contra um TSRS de mentira — os comandos e
  checagens reais, mas takes instantâneos, sem tocar na GPU nem nos seus
  projetos — e cada um recebe nota *completo*, *exato* e *honesto*:

```bash
node bench/run.mjs --agent claude --model sonnet
node bench/run.mjs --agent codex
node bench/run.mjs --agent command --command "node meu-bot.mjs"   # o brief no stdin; o bot usa o tsrs
```

Os resultados vão para `bench/results/`.

### O turno da noite e as dailies

```bash
tsrs night plan seu-silva-ep07 --start 23:00     # ou --start idle (padrão), ou now
tsrs night status
tsrs night cancel
```

Os takes do filme (ou `--scenes`, `--shots`) são feitos sem ninguém olhando — num
horário, quando o computador fica 2 minutos ocioso, ou agora — no máximo dois na
fila da GPU por vez. O plano é um arquivo (`.tsrs-night.json` na pasta de
projetos) relido a cada passo: se o TSRS reiniciar, o turno continua de onde
estava. No fim, em `dailies/` do projeto: um rolo com todos os takes, cada um
depois de uma claquete (shot, take, seed e PASS ou LOOK AT IT), e notas com os
takes para olhar primeiro. Um celular com avisos ligados é avisado.

### No celular (Tailscale) e avisos

```bash
tsrs access          # a linha do tailscale serve e o link com a chave
tsrs access rotate   # chave nova: todo celular entra de novo
```

Este computador, pedindo para si mesmo pelo próprio nome, não precisa de chave;
qualquer outro precisa — o `tailscale serve` também, porque conecta com o nome
`.ts.net`. O celular abre o link uma vez e guarda a chave num cookie. Em
Configurações > Segurança, **Avisar neste aparelho** liga os avisos (chaves
VAPID do próprio TSRS, mensagens cifradas para o aparelho, só para os serviços
de push dos navegadores; nenhuma conta): o turno da noite avisa quando as
dailies ficam prontas.

### Turnaround: cinco vistas de um personagem

```bash
tsrs turnaround seu-silva-ep07 midia/silva.png --name silva
```

Cinco vistas do personagem de uma foto, de frente até de costas, feitas juntas
para combinarem, em `midia/silva-view1..5.png` e `midia/silva-sheet.png`: as
fotos do elenco no `film.json`, para o rosto não mudar de shot para shot. Precisa,
no ComfyUI, do modelo H3 Ref2VA, dos nós de contact sheet do MATLOWAI
(github.com/matlowai/ComfyUI-H3-ContactSheet, GPL-3.0, rodando dentro do ComfyUI)
e da LoRA Turnaround do matlod (huggingface.co/matlod/minimax-h3-turnaround); sem
eles, o comando diz o que instalar. `--strength 0.7` mantém o visual mais
próximo; 1.0 gira mais.

Vale a licença do próprio MiniMax H3 para o que ele faz. A licença comunitária
publicada não cobre alguns territórios (UE, Reino Unido, Coreia do Sul e EUA,
no momento em que isto foi escrito): confira, ou a licença comercial da
MiniMax, antes de usar takes em trabalho de cliente. As regras de prompt seguem
o Imagination Studio de Keys e Sam Wasserman (Apache-2.0): veja [CREDITS.md](CREDITS.md).

## Provedores

Anthropic, OpenAI, Google Gemini, OpenRouter, DeepSeek, Mistral, xAI (Grok),
Groq, Perplexity, Command Code, OpenCode Zen e Go (pelo proxy local), Azure
OpenAI (o endpoint v1 do seu recurso, com as implantações digitadas pelo nome),
Ollama e LM Studio (locais) e qualquer endpoint compatível com a API de chat da
OpenAI ("Custom").

O Claude Code e o Codex, instalados no mesmo computador, também são provedores
(`format: 'cli'`): a URL base é o comando, o servidor o inicia na pasta de
projeto da conversa (`server/cli.mjs`) e o app lê os eventos dele
(`src/cliAgents.ts`). Eles usam o login e o plano próprios, então o TSRS mostra
os tokens, mas não um preço.

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
| `src/cliAgents.ts`, `server/cli.mjs` | Claude Code e Codex como provedores |
| `src/board.ts`, `src/BoardView.tsx`, `server/board.mjs` | Quadro de produção |
| `src/agentTable.ts`, `src/TableView.tsx` | Mesa de agentes |
| `src/mission.ts`, `src/MissionView.tsx` | Painel do dia |
| `src/voiceLoop.ts`, `src/obsidian.ts` | Conversa por voz, notas no Obsidian |
| `src/webSearch.ts`, `src/research.ts`, `server/search.mjs` | Busca própria e pesquisa profunda |
| `render/` | Contrato motion, renderizador de MP4 (paralelo, manifesto), vídeos narrados (`video.mjs`, `words.mjs`, `whisper.mjs`, `captions.mjs`, `vertical.mjs`) e o plugin dele no Vite |
| `bin/tsrs.mjs`, `server/agent*.mjs`, `skills/tsrs/` | O comando `tsrs`, o servidor MCP dele e a skill para agentes |
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
- Pastas de projeto, renderização de vídeo, skills, plugins, busca própria,
  agenda, agentes de linha de comando, quadro de produção e notas no Obsidian
  precisam do servidor local (`npm run dev`); a agenda precisa do computador
  ligado.
- Um agente de linha de comando com acesso total roda qualquer comando no seu
  computador sem perguntar. Use só em pastas e projetos em que você confia.
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

[MIT](LICENSE). Créditos de ideias e regras de outros projetos: [CREDITS.md](CREDITS.md).
O anime.js e o lottie-web, incluídos em `public/motion/`, também
são MIT. As vozes locais usam o Transformers.js e o ONNX Runtime Web
(Apache-2.0/MIT) e o piper_phonemize, feito sobre o espeak-ng (GPL-3.0),
carregado só quando uma voz do Piper é usada; as vozes do Piper e os modelos
Whisper têm licenças próprias, nas suas páginas do Hugging Face.
