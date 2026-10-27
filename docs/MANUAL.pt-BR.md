# Manual do TSRS

Como instalar, configurar e tirar o máximo do TSRS (The Signal Room Studio).

[README](../README.pt-BR.md) · [Como contribuir](../CONTRIBUTING.pt-BR.md) ·
[Roadmap](../ROADMAP.pt-BR.md)

> Os nomes de botões e telas abaixo são os da interface em português. Em inglês,
> troque o idioma em **Configurações → Geral → Idioma**.

## Sumário

1. [O que é o TSRS](#1-o-que-é-o-tsrs)
2. [Instalação](#2-instalação)
3. [Primeiros passos](#3-primeiros-passos)
4. [Conhecendo a tela](#4-conhecendo-a-tela)
5. [Conversas](#5-conversas)
6. [Arquivos, pastas e projetos](#6-arquivos-pastas-e-projetos)
7. [Preview, canvas e vídeo motion](#7-preview-canvas-e-vídeo-motion)
8. [Imagem, vídeo, voz e música](#8-imagem-vídeo-voz-e-música)
9. [Busca na web e pesquisa profunda](#9-busca-na-web-e-pesquisa-profunda)
10. [Biblioteca: agentes, prompts, memória e conhecimento](#10-biblioteca-agentes-prompts-memória-e-conhecimento)
11. [Ferramentas e MCP](#11-ferramentas-e-mcp)
12. [Extensões: skills, plugins e agenda](#12-extensões-skills-plugins-e-agenda)
13. [Custos e uso](#13-custos-e-uso)
14. [Segurança, backup e sincronização](#14-segurança-backup-e-sincronização)
15. [Receitas: tirando o máximo do TSRS](#15-receitas-tirando-o-máximo-do-tsrs)
16. [Problemas comuns](#16-problemas-comuns)
17. [Perguntas frequentes](#17-perguntas-frequentes)
18. [Estúdio: painel, quadro, mesa e agentes do computador](#18-estúdio-painel-quadro-mesa-e-agentes-do-computador)
19. [O comando tsrs: o TSRS para agentes](#19-o-comando-tsrs-o-tsrs-para-agentes)

---

## 1. O que é o TSRS

O TSRS é um estúdio para trabalhar com modelos de IA que roda **no seu
computador**. Você usa as suas próprias chaves de API (ou modelos locais, de
graça) e conversa com Claude, GPT, Gemini, Grok, DeepSeek, Mistral e outros
numa tela só.

O que muda em relação a usar o site de cada empresa:

- **Um lugar para todos os modelos**, inclusive para comparar respostas lado a lado.
- **Você paga só o que usa**, direto ao provedor, e vê o custo de cada resposta.
- **Seus dados ficam com você**: conversas no navegador, arquivos em pastas do
  seu computador, nada passa por um servidor do TSRS (não existe um).
- **Arquivos de verdade**: páginas, código, imagens, áudios e vídeos vão para
  uma pasta de projeto, que você continua no Claude Code, no Codex ou no seu editor.

## 2. Instalação

Você precisa de três coisas: **Node.js 22 ou mais novo**, **Git** e um
navegador moderno (Chrome, Edge, Brave, Arc, Firefox ou Safari). Para gerar
vídeos MP4, também do **ffmpeg** (opcional).

### Windows

Abra o **PowerShell** e rode:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Gyan.FFmpeg        # opcional, para vídeo
```

Feche e abra o PowerShell de novo (para ele achar os programas novos) e siga
para [Baixar e rodar](#baixar-e-rodar).

### macOS

Com o [Homebrew](https://brew.sh) instalado, abra o **Terminal** e rode:

```bash
brew install node git
brew install ffmpeg               # opcional, para vídeo
```

### Linux

Use o gerenciador de pacotes da sua distribuição, ou o
[nvm](https://github.com/nvm-sh/nvm) se a versão do Node.js for antiga:

```bash
# Debian / Ubuntu
sudo apt install git ffmpeg
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
nvm install 22
```

Para a leitura em voz alta no Linux, o navegador precisa de vozes instaladas
(por exemplo, pelo `speech-dispatcher`).

### Baixar e rodar

```bash
git clone https://github.com/Eddienews/tsrs.git
cd tsrs
npm ci
npm run dev
```

Abra **http://localhost:5173** no navegador. Pronto. Deixe o terminal aberto
enquanto usa o TSRS: é ele que grava as pastas de projeto, gera os vídeos e
roda a agenda.

Confira se `node --version` mostra 22 ou mais. Se aparecer um número menor,
atualize o Node.js antes do `npm ci`.

### Atualizar

Na pasta do TSRS:

```bash
git pull
npm ci
npm run dev
```

A versão e o commit em uso aparecem embaixo do nome TSRS, na barra lateral. Se
algo parecer desatualizado, compare esse número com o do GitHub.

### Instalar como aplicativo (opcional)

No Chrome ou no Edge, use o ícone de instalar na barra de endereço; no Safari do
Mac, **Arquivo → Adicionar ao Dock**. O TSRS abre numa janela própria, como um
programa. O `npm run dev` continua precisando estar rodando para os recursos de
pasta, vídeo, extensões e agenda.

## 3. Primeiros passos

### Opção grátis: modelos locais com o Ollama

1. Instale o [Ollama](https://ollama.com) e baixe um modelo, por exemplo
   `ollama pull qwen3`.
2. No TSRS, abra **Configurações → Provedores**, escolha **Ollama (local)** e
   clique em **Carregar modelos**.
3. Escolha o modelo na barra superior e converse. Não precisa de chave nem de
   internet.

O LM Studio funciona do mesmo jeito.

### Com uma chave de API

1. Crie uma chave no site do provedor (Anthropic, OpenAI, Google AI Studio,
   OpenRouter etc.). Na maioria deles é preciso pôr crédito antes.
2. Em **Configurações → Provedores**, cole a chave no provedor certo e clique
   em **Carregar modelos**.
3. Escolha o modelo na barra superior (ou digite o nome dele) e envie uma mensagem.

Depois disso a lista se atualiza sozinha uma vez por dia. Quando um provedor
lança um modelo (ou você treina um modelo seu, com fine-tuning), ele aparece com
a marca **novo** na lista e um aviso no botão do modelo, até você abrir a lista.
Modelos que você digitou à mão continuam lá; os que o provedor tirou do ar somem.

**Dica:** o **OpenRouter** dá acesso a centenas de modelos de várias empresas
com uma chave só. É um bom começo para experimentar antes de abrir conta em
cada provedor.

**Azure OpenAI:** no provedor **Azure OpenAI**, a URL base é a do seu recurso
terminada em `/openai/v1` (por exemplo,
`https://meu-recurso.openai.azure.com/openai/v1`) e a chave fica em **Chaves e
Endpoint** no portal do Azure. Em vez de carregar a lista, digite os nomes das
suas **implantações** (deployments), separados por vírgula: cada uma vira um
modelo. Se a sua organização bloquear chamadas do navegador, ligue **Usar o
proxy local**.

### Proteja as chaves

Em **Configurações → Segurança**, defina uma **senha**. As chaves passam a ficar
criptografadas no navegador, e o TSRS pede a senha ao abrir. **Bloquear agora**
tranca o app na hora. Sem senha, as chaves ficam guardadas no navegador em texto
puro — tudo bem num computador só seu, não num compartilhado.

## 4. Conhecendo a tela

- **Barra lateral (esquerda):** **Nova conversa**, busca, pastas, etiquetas e a
  lista de conversas. Embaixo, os botões **Biblioteca**, **Ferramentas**,
  **Extensões**, **Uso**, **Configurações** e o tema claro/escuro.
- **Barra superior:** o modelo da conversa (**Escolher modelo**), o agente
  (persona), os **Parâmetros**, o total de tokens e custo da conversa, a pasta
  do projeto, o **Canvas** e o **Preview**.
- **Caixa de mensagem (embaixo):** **Anexar**, **Ditar**, **Prompts salvos**,
  **Pesquisa** (pesquisa profunda), **Conversa temporária** e **Enviar**.
- **Paleta de comandos:** **Ctrl+K** (ou **⌘+K** no Mac) abre uma busca por
  qualquer ação ou conversa. É o jeito mais rápido de usar o TSRS.

Os atalhos de teclado podem ser mudados em **Configurações → Atalhos**.

## 5. Conversas

### O básico

- **Editar** uma mensagem sua e reenviar, **regenerar** a resposta ou **tentar
  de novo** depois de um erro. Cada versão fica guardada: use as setas ‹ › na
  mensagem para alternar entre elas.
- **Parar** interrompe a resposta no meio.
- **Fixar** uma mensagem importante: ela ganha um atalho no topo da conversa.
- **Ramificar a partir daqui** cria uma conversa nova a partir de uma mensagem,
  sem mexer na original. Ótimo para testar caminhos diferentes.
- **Ler em voz alta** lê a resposta (veja a [seção 8](#8-imagem-vídeo-voz-e-música)).

### Comparar modelos

Use **Comparar com outros modelos** para até três outros modelos responderem à
mesma pergunta, em colunas. Bom para escolher o modelo de uma tarefa ou para
ter uma segunda opinião.

### Pergunta à parte

Selecione um trecho de uma resposta e clique em **Perguntar à parte**. A
pergunta abre num painel lateral e não entra no histórico da conversa principal.
Use para "o que quer dizer este termo?" sem desviar o assunto.

### Parâmetros

Em **Parâmetros** você ajusta, por conversa: o prompt de sistema, a temperatura,
o máximo de tokens e o nível de raciocínio (nos modelos que pensam antes de
responder). O raciocínio aparece recolhido acima da resposta, quando o provedor
envia.

### Conversa temporária

Liga um modo em que a conversa não fica salva no histórico. Bom para perguntas
rápidas ou assuntos que você não quer guardar.

### Conversas longas

O indicador de contexto mostra quanto da memória do modelo a conversa já usa.
Cada mensagem leva a conversa inteira junto, então uma conversa longa custa mais
a cada pergunta, e o modelo tende a perder o que ficou no meio. A partir de 50%,
o TSRS sugere três saídas:

- **Continuar numa conversa nova** (também na barra superior e no Ctrl+K): o
  modelo escreve uma passagem com o que você está fazendo e por quê, as decisões,
  os arquivos alterados e o próximo passo. Uma conversa nova abre a partir dela,
  com o mesmo modelo, os mesmos ajustes e a mesma pasta do projeto. A conversa
  antiga fica como estava, com um link para a nova. É a melhor saída quando o
  trabalho continua: você escolhe o que segue adiante, e a conversa nova começa
  leve.
- **Resumir a conversa** troca o começo por um resumo ali mesmo e libera espaço
  sem perder o fio.

Para mudar de assunto sem abrir outra conversa, use **Limpar o contexto** (o
ícone de borracha na barra superior, ou Ctrl+K). Aparece uma linha na conversa:
dali para cima, nada mais vai para o modelo, e cada pergunta fica mais barata.
O histórico continua visível, e **Desfazer** na linha devolve tudo.

### Organizar

- **Pastas** e **etiquetas** na barra lateral; arraste conversas para as pastas.
- **Selecionar conversas** para arquivar, mover ou excluir várias de uma vez.
- A busca procura no título e no conteúdo das conversas.
- O título é criado sozinho depois da primeira resposta (configurável em
  **Configurações → Geral**).

## 6. Arquivos, pastas e projetos

### Anexos

Clique em **Anexar** (ou arraste para a caixa de mensagem):

- **Imagens** e **PDFs**: o modelo vê o conteúdo (nos modelos com visão).
- **Textos, código, CSV, Markdown, HTML**.
- **Planilhas Excel (.xlsx)**: cada aba vira uma tabela que o modelo lê.
- **Word (.docx)** e **PowerPoint (.pptx)**: o texto vira Markdown, com títulos,
  listas e tabelas; nas apresentações, slide a slide, com as notas do
  apresentador. Formatos antigos (.doc, .ppt) precisam ser salvos como .docx ou
  .pptx antes.
- **Áudio** (MP3, WAV, M4A…): toca na conversa e é **transcrito** pela OpenAI,
  pelo Groq ou pelo Whisper local, para qualquer modelo entender; também serve de
  trilha para os vídeos motion.
- **Vídeo** (MP4, WebM, MOV…): o TSRS tira até **16 quadros** espalhados pelo
  vídeo (um a cada 2 segundos, nos curtos) e **transcreve o que se fala** nele.
  O modelo recebe os quadros como imagens, com os tempos, e a transcrição; então
  qualquer modelo com visão pode responder sobre o vídeo ("o que acontece aos
  30 segundos?", "resuma este vídeo", "escreva a legenda"). O vídeo em si não é
  guardado, só os quadros, e não há limite de tamanho; a transcrição usa até
  300 MB. Formatos que o navegador não abre (alguns MOV e MKV) precisam ser
  convertidos para MP4 antes.

### Pasta do projeto

Quando uma conversa cria arquivos (uma página, um código, uma imagem, um vídeo),
o TSRS grava tudo numa pasta própria em `projetos/<nome-da-conversa>/`, dentro da
pasta do TSRS, com um `NOTAS.md` que registra o que foi feito.

- O botão da pasta na barra superior mostra o caminho e deixa **copiar o
  caminho** ou mover a conversa para **outra pasta** do computador.
- Antes de mudar um arquivo, o modelo lê a versão atual da pasta. Então você
  pode editar à mão, ou continuar no **Claude Code**, no **Codex** ou em qualquer
  ferramenta apontando para a mesma pasta, e depois voltar ao TSRS.
- Mídias geradas e vídeos MP4 da conversa também vão para a pasta do projeto.
- Para desligar ou mudar a pasta raiz: **Configurações → Geral**.

**Dica:** peça "crie a página inicial do site X em arquivos separados
(index.html, estilo.css, app.js)" e o projeto já nasce organizado.

### Word e PowerPoint

Com a pasta do projeto ligada, peça o documento ou a apresentação direto:

> "Monte uma proposta comercial em Word para a Acme, com escopo, cronograma e
> tabela de preços."
>
> "Faça uma apresentação de 8 slides sobre o lançamento, tema escuro, com notas
> para o apresentador."

O TSRS grava o `.docx` ou o `.pptx` na pasta do projeto, pronto para abrir no
Word, no PowerPoint, no Google Docs/Slides, no Keynote ou no LibreOffice. Para
ajustar, peça a mudança na conversa: o modelo lê o arquivo atual antes de
reescrever. Os arquivos saem com estilos padrão (títulos, listas, tabelas);
para a identidade visual da empresa, aplique o modelo dela depois, no próprio
Word ou PowerPoint.

### Contexto da pasta

Nas **Opções da pasta** (barra lateral), **Contexto da pasta…** define o que
todas as conversas daquela pasta recebem:

- **Instruções** (ex.: "Projeto do site da empresa. Público: pequenas empresas.
  Tom direto, sem jargão. Cores #dc5000 e #05070a.");
- **Arquivos de contexto** (manual da marca, briefing, planilha de preços);
- **Agente da pasta**, usado nas conversas que não escolheram outro.

É o jeito mais prático de organizar trabalho por cliente ou por projeto: crie
uma pasta, dê o contexto uma vez e toda conversa nova já começa sabendo tudo.

## 7. Preview, canvas e vídeo motion

### Preview

Quando a resposta traz HTML, SVG, JavaScript, Markdown, React (JSX/TSX) ou um
diagrama Mermaid, o **Preview** mostra o resultado funcionando, ao lado da
conversa. Ele tem abas de código e console e tamanhos de tela (celular, tablet,
desktop). A barra de endereço do preview também abre páginas locais, como o
`localhost:3000` de um projeto seu.

O código roda isolado do app: não consegue ver as suas chaves.

### Canvas

O **Canvas** é um documento ou código ao lado da conversa. O modelo escreve e
edita por partes, e você também edita à mão. Selecione um trecho para pedir uma
mudança só nele. Bom para textos longos, contratos, artigos e arquivos de
código que vão sendo refinados.

### Vídeo motion

Peça uma animação, por exemplo:

> "Uma abertura de 6 segundos em 1080x1920 com o título NWLab, fundo escuro,
> logo entrando com um brilho."

A resposta vem num bloco `motion`, que abre no Preview com uma **linha do
tempo**: dá para dar play, pausar e arrastar.

1. Para ter som, anexe um áudio na conversa (ou gere uma música, seção 8) e
   escolha a trilha no preview.
2. Clique em **Gerar MP4**. O vídeo é renderizado quadro a quadro no seu
   computador e salvo na pasta do projeto, com o volume da trilha ajustado e
   fade no final.

Precisa do `npm run dev` rodando e do ffmpeg instalado. Peça ajustes à vontade
("deixe o título 1 segundo mais cedo", "troque a cor para laranja"): cada nova
versão vira um MP4 novo, sem apagar os anteriores.

### Vídeo curto (Reels, TikTok, Shorts)

Um vídeo narrado, com imagens de banco e legendas palavra a palavra, feito a
partir de um tema:

> "Faça um vídeo curto de 30 segundos sobre os benefícios do café, para o
> Instagram, com música calma e o fechamento 'Siga @minhamarca'."

O modelo escreve o roteiro em cenas (o que é dito e o que aparece) e o TSRS:

1. **narra** com a voz escolhida em **Configurações → Mídia → Leitura em voz alta** (ou o serviço de
   áudio), sabendo o tempo de cada palavra;
2. **busca um trecho de vídeo** por cena no Pexels ou no Pixabay e baixa para
   `midia/stock/`;
3. **monta** no formato pedido (9:16, 16:9 ou 1:1): cada trecho cortado na duração
   da sua frase, **legendas palavra a palavra** em destaque laranja, o título no
   começo, uma barra de progresso e o cartão final com a sua chamada;
4. põe a **música** por baixo, abaixando sozinha quando a voz fala (gerada pela
   ElevenLabs, ou um arquivo seu da pasta do projeto);
5. salva o MP4 em `videos/` e os **créditos** de cada trecho em `CREDITOS.md`.

O vídeo aparece na própria resposta, pronto para baixar.

**O que precisa:**

- a pasta do projeto ligada e o TSRS aberto pelo `npm run dev`, com o ffmpeg;
- uma chave do **Pexels** e/ou do **Pixabay** (gratuitas) em **Configurações →
  Mídia → Vídeos de banco**;
- uma voz de serviço: **ElevenLabs** (os tempos das palavras vêm junto com a voz)
  ou OpenAI/Gemini. Nessas, com uma chave da OpenAI ou do Groq o TSRS transcreve
  a narração para acertar os tempos; sem elas, os tempos são estimados.

**Dicas:** cerca de 2,5 palavras por segundo (30 s ≈ 75 palavras, 4 a 7 cenas).
Peça buscas visuais concretas ("mãos servindo café", "cidade ao amanhecer").
Para trocar um trecho, peça "troque a imagem da cena 3 por algo com pessoas" e o
TSRS monta de novo. Os vídeos do Pexels e do Pixabay podem ser usados de graça,
inclusive comercialmente; dar crédito não é obrigatório, mas o `CREDITOS.md`
fica pronto se você quiser.

## 8. Imagem, vídeo, voz e música

Em **Configurações → Mídia** você cola as chaves dos serviços de mídia
(ElevenLabs, Runware, fal.ai, Replicate, Stability, Black Forest Labs, MiniMax,
Cartesia…) e escolhe, em **Quem gera cada tipo**, qual serviço gera imagem,
vídeo, voz, música e efeitos. As chaves da OpenAI, do Gemini e da xAI também
servem para imagem e vídeo.

Depois é só pedir na conversa: "gere uma imagem…", "crie uma música de 30
segundos…", "narre este texto…". Quando o serviço publica o preço, o TSRS mostra
o **custo estimado antes** de gerar.

### Ler respostas em voz alta

- **Grátis:** o TSRS escolhe a voz mais natural do navegador. No **Microsoft
  Edge** existem vozes neurais grátis em português muito boas ("Natural");
  vale usar o Edge para isso.
- **ElevenLabs:** escolha uma das **suas vozes** (as que você criou ou salvou),
  com amostra e preço por caractere. O botão **Criar voz…** faz uma voz nova na
  sua conta, de dois jeitos:
  - **Descrever:** escreva como é a voz ("locutor brasileiro de uns 40 anos,
    voz grave e calma…"); a ElevenLabs gera três versões, você ouve, escolhe uma,
    dá um nome e salva.
  - **Clonar de um áudio:** grave ali mesmo ou envie arquivos com 1 a 5 minutos
    de fala limpa da mesma pessoa. Só clone a sua voz ou a de quem autorizou.
  A voz criada já fica escolhida para a leitura. A ElevenLabs cobra créditos
  pela criação, conforme o seu plano.
- **OpenAI** ou **Gemini:** com a chave desses provedores.
- **Piper (local, grátis):** vozes neurais que rodam no seu computador, sem
  chave. Em **Configurações → Mídia → Leitura em voz alta**, escolha **Piper** e
  a voz (em português: faber, cadu, jeff, edresson). A primeira amostra baixa a
  voz (uns 60 MB) para a pasta `modelos/` do TSRS; depois funciona sem
  internet. A mesma voz narra os vídeos curtos.

### Ditado

O botão **Ditar** transcreve a sua fala pela OpenAI, pelo Groq (rápido e
barato), pelo **Whisper local** ou pelo reconhecimento de voz do navegador
(grátis).

O **Whisper local** (Configurações → Geral → Ditado) roda no seu computador: o
áudio não sai dele e não há custo. Escolha o tamanho: **Mínimo** (~45 MB),
**Básico** (~80 MB) ou **Pequeno** (~250 MB, erra menos em português e demora
mais). O modelo é baixado na primeira transcrição para `modelos/` e, depois,
funciona sem internet. Ele também transcreve os áudios anexados. As vozes e o
Whisper locais precisam do TSRS aberto pelo `npm run dev`.

## 9. Busca na web e pesquisa profunda

### Busca na web

Abra **Ferramentas**. Alguns provedores (Anthropic, OpenRouter, Perplexity) têm
busca própria. Para **qualquer modelo** buscar na web, configure a **Busca
própria (qualquer modelo)** com uma chave do Brave, do Tavily, do Google ou do
Kagi. O modelo então busca e lê páginas sozinho e cita as fontes.

O Brave e o Tavily têm planos gratuitos com uma cota mensal, suficientes para
uso pessoal.

### Pesquisa profunda

Ligue **Pesquisa** na caixa de mensagem e faça a pergunta. O modelo faz várias
rodadas de busca e leitura e termina num **relatório com fontes citadas**, salvo
em `pesquisas/` na pasta do projeto.

Use para: comparar fornecedores, levantar o estado de um mercado, preparar uma
reunião, revisar o que existe sobre um assunto. Leva alguns minutos e gasta mais
tokens que uma pergunta normal: veja o custo na barra superior.

## 10. Biblioteca: agentes, prompts, memória e conhecimento

O botão **Biblioteca** tem quatro abas.

### Personas (agentes)

Um agente é um "funcionário" configurado: nome, instruções, modelo preferido,
ferramentas, arquivos, base de conhecimento e sugestões iniciais. O TSRS já vem
com quatro. Crie os seus para tarefas que se repetem: redator da marca, revisor
de contratos, analista de planilhas, professor de inglês…

Escolha o agente da conversa em **Persona desta conversa**, na barra superior.

Cada agente também pode ter:

- **Parâmetros próprios**: temperatura, máximo de tokens e nível de raciocínio.
  Valem nas conversas dele que não definiram os seus em **Parâmetros**.
- **Skills e plugins escolhidos**: ligue **Escolher skills e plugins** e marque
  só os que ele usa. Desligado, ele usa todos os que estão ligados em Extensões.

**Chamar um agente com @.** No meio de qualquer conversa, digite `@` e escolha o
agente na lista (ou continue digitando o nome). Só aquela mensagem é respondida
por ele, com o prompt, as ferramentas, os parâmetros e o modelo dele; a resposta
vem marcada com `@Nome`, e a conversa continua com o agente e o modelo de antes.
Ex.: "@Revisor confira o texto acima".

### Prompts salvos

Textos que você usa sempre, com campos `{{assim}}` que o TSRS pergunta na hora:

```
Escreva um post para {{rede}} sobre {{assunto}}, em tom {{tom}}, com no máximo {{tamanho}} palavras.
```

Use pelo botão **Prompts salvos** da caixa de mensagem ou pela paleta (Ctrl+K).

**Galeria da comunidade.** Em **Biblioteca → Prompts salvos**, o botão **Galeria
da comunidade** mostra mais de 50 prompts prontos, por categoria (escrita,
trabalho, estudo, programação, marketing, dados, criação e dia a dia). Busque,
clique em **Adicionar** num prompt ou adicione todos os mostrados de uma vez; eles
viram prompts seus, que você pode editar.

**Encadear prompts.** Em **Adicionar etapa**, um prompt ganha etapas seguintes.
Ao usá-lo, o TSRS manda a primeira, espera a resposta, manda a segunda e assim
por diante. Escreva `{{resposta}}` numa etapa para incluir a resposta anterior.
Ex.: etapa 1 "Escreva um post sobre {{tema}}", etapa 2 "Revise {{resposta}} e
deixe com no máximo 100 palavras", etapa 3 "Agora sugira 3 títulos". Parar a
resposta interrompe o encadeamento.

### Memória

Com **Usar memória** ligado, o modelo pode guardar fatos sobre você ("trabalho com
marketing", "prefiro respostas curtas") numa lista que você vê, edita e apaga.
Esses fatos vão junto nas conversas novas.

### Conhecimento (bases de conhecimento)

Coloque PDFs, textos, Markdown e HTML numa **base de conhecimento**. Ela é
dividida em trechos e buscada a cada pergunta, sem enviar tudo ao modelo — o
que permite usar documentos muito maiores que o limite dele. A busca por
palavras funciona sem API; com uma chave de embeddings, a busca entende também
o sentido.

Ligue uma base a uma conversa ou a um agente. Ex.: um agente "Suporte" com a
base dos manuais do seu produto.

## 11. Ferramentas e MCP

Em **Ferramentas** você também conecta **servidores MCP** remotos, que dão ao
modelo acesso a outros sistemas (agenda, tarefas, bancos de dados,
ferramentas da sua empresa). Antes de cada uso, o TSRS pede permissão; marque
como confiáveis só os servidores que você conhece.

### Interpretador de JavaScript e gráficos

Em **Ferramentas → Código**, ligue o **Interpretador de JavaScript e gráficos**.
O modelo passa a poder rodar código para:

- **contas exatas** (juros, médias, datas), em vez de calcular "de cabeça";
- **analisar dados**: as planilhas (.xlsx) e os CSVs anexados à conversa chegam
  ao código como texto, prontos para ler;
- **desenhar gráficos** de barras, linhas, pizza ou dispersão, que aparecem na
  resposta como imagens.

Peça, por exemplo: "anexei as vendas do ano; mostre o total por mês num gráfico
de barras e diga qual mês cresceu mais". O código roda **no seu navegador,
isolado**: sem internet, sem acesso às suas chaves, conversas ou ao resto do
TSRS, e é interrompido depois de 15 segundos.

## 12. Extensões: skills, plugins e agenda

O botão **Extensões** tem três abas. Tudo fica em `extensoes/`, na pasta do
TSRS, e nada é apagado de verdade: o que você remove vai para
`extensoes/_removidas/`.

### Skills

Uma skill é um pacote de instruções (no mesmo formato `SKILL.md` das skills do
Claude) que o modelo carrega **só quando a tarefa pede**. Ex.: "padrão de
propostas comerciais da empresa", "guia de estilo do blog".

- **Exemplos** (aba própria) instala com um clique as skills e os plugins que
  vêm com o TSRS: escrita clara, ata de reunião, roteiro de vídeo curto e o
  plugin **utilidades-livres** (câmbio, feriados, clima, Wikipédia, contagem de
  palavras, os comandos `/resumo` e `/post` e o agente revisor técnico).
- **Nova skill** para escrever uma no app.
- **Instalar .zip, .skill ou SKILL.md** para usar uma pronta, inclusive skills
  feitas para o Claude.

### Plugins

Um plugin junta skills, comandos (viram prompts), agentes, servidores MCP e
**ferramentas próprias**: chamadas HTTP a uma API (com a chave guardada em
variável de ambiente, nunca no arquivo) ou pequenos códigos JavaScript que
rodam isolados. Use **Instalar plugin .zip** ou **Instalar uma pasta**; plugins
no formato do Claude também funcionam.

**Atenção:** instale plugins e skills só de quem você confia. Eles acrescentam
instruções e ferramentas que o modelo vai usar.

### Agenda

**Nova tarefa** agenda um pedido para o modelo num horário (todo dia às 8h,
toda segunda etc.). Quem roda é o servidor do `npm run dev`, então funciona
mesmo com a aba fechada, desde que o computador esteja ligado e o terminal
aberto. A resposta chega numa conversa "Agenda: <nome da tarefa>".

Para rodar com a aba fechada, o TSRS pede permissão para guardar a chave daquele
provedor no computador. Ideias: "resumo das notícias do meu setor toda manhã",
"lembrete semanal com os itens pendentes da pasta X".

Em **A tarefa pode usar**, marque o que ela pode usar além do modelo:

- **Busca na web e leitura de páginas**, com a sua Busca própria (Brave, Tavily,
  Google ou Kagi). As fontes vêm listadas no fim da resposta. A chave da busca
  também precisa ficar guardada no computador.
- **Skills** ligadas em Extensões.
- **Ferramentas HTTP** dos plugins ligados.

Ferramentas JavaScript de plugins e servidores MCP só rodam com o TSRS aberto no
navegador, então ficam de fora da agenda.

## 13. Custos e uso

- Cada resposta mostra os **tokens** e o **custo estimado**; a barra superior
  mostra o **total da conversa**.
- O botão **Uso** abre a tela de uso por dia e por modelo, com totais e
  relatório.
- Para um modelo que o TSRS não conhece, clique no aviso de preço e informe o
  preço por milhão de tokens: as respostas antigas também passam a contar.
- Na Anthropic, o **cache de prompt** é automático e reduz o custo de conversas
  longas.

**Para gastar menos:**

- Use modelos menores (Haiku, GPT mini/nano, Gemini Flash) para tarefas simples
  e os maiores só quando precisa.
- Comece conversas novas para assuntos novos: o histórico inteiro vai junto em
  cada pergunta.
- Em conversas longas, use **Continuar numa conversa nova** perto da metade do
  contexto, ou **Resumir a conversa**.
- Prefira bases de conhecimento a anexar o mesmo PDF grande em toda conversa.
- Teste ideias com o Ollama, de graça, antes de usar um modelo pago.

## 14. Segurança, backup e sincronização

### Onde ficam os seus dados

- **Conversas, configurações e biblioteca:** no navegador (IndexedDB e
  localStorage) do computador onde você usa o TSRS. Outro navegador ou outro
  computador não vê.
- **Arquivos:** `projetos/`, `extensoes/` e `renders/`, dentro da pasta do TSRS
  (ou nas pastas que você escolheu).
- **Chaves:** no navegador, criptografadas se você definiu senha. Nunca vão para
  sincronização ou exportações; no backup automático só entram cifradas com a
  sua senha.
- **Backup automático:** `backups/`, dentro da pasta do TSRS (ou a pasta em
  `TSRS_BACKUPS`).

### Perfis

Para separar, por exemplo, o pessoal do trabalho, crie um perfil em
**Configurações → Perfis** (digite o nome e clique em **Criar e abrir**). Cada
perfil tem as suas próprias chaves, conversas, biblioteca, senha, sincronização e
backup automático (em `backups/perfis/<id>/`): é como ter dois TSRS no mesmo
navegador. O perfil novo começa vazio; cole as chaves dele.

Com mais de um perfil, o nome do perfil aparece ao lado do título, na barra
lateral: clique para trocar (a página recarrega). Em **Configurações → Perfis**
você renomeia os perfis e apaga os que não usa mais (o perfil em uso e o
primeiro não podem ser apagados). As pastas de projeto, as extensões e a agenda
são do computador e valem para todos os perfis.

### Backup automático

Com o TSRS aberto pelo `npm run dev`, uma cópia das conversas, da biblioteca e
das configurações vai para `backups/` alguns segundos depois de cada mudança:

- `atual.json` é a cópia mais recente;
- `tsrs-AAAA-MM-DD.json` guarda como tudo estava no fim de cada dia, pelos
  últimos 14 dias;
- `tsrs-…-antes.json` guarda a cópia anterior quando a nova tem menos conversas,
  para um navegador esvaziado não apagar um backup cheio sem deixar rastro.

Se o TSRS abrir sem conversas e houver backup, ele pergunta se você quer
restaurar. As chaves de API só entram no backup **cifradas com a sua senha**
(defina uma em **Configurações → Segurança**); sem senha, ficam de fora e você
cola de novo. O estado, a pasta e o botão **Restaurar do backup automático**
ficam em **Configurações → Dados**.

O navegador pode apagar os dados do site sozinho. No Chrome, a opção "Excluir
dados que os sites salvaram quando você fechar todas as janelas" faz isso a cada
vez que o Chrome fecha (inclusive num reinício do Windows). Desligue a opção ou
adicione `http://localhost:5173` em "Sempre permitir que sites salvem dados".

### Backup manual

Em **Configurações → Dados**: **Exportar backup** grava tudo num arquivo JSON;
**Importar backup** restaura. Faça backups de vez em quando, principalmente
antes de limpar os dados do navegador. Uma conversa sozinha pode ser exportada
em Markdown ou numa página HTML (**Exportar Markdown**, **Exportar HTML**).

### Sincronizar entre computadores

Em **Configurações → Sincronização**, escolha:

- **Uma pasta** sincronizada pelo Dropbox, Google Drive, OneDrive ou Syncthing
  (Chrome, Edge e outros baseados no Chromium);
- **WebDAV** (Nextcloud, por exemplo) ou **S3** (AWS, Cloudflare R2…), que
  funcionam em qualquer navegador.

Use a **senha da sincronização** para que os arquivos fiquem criptografados no
serviço. As chaves de API não são sincronizadas: cole-as em cada computador.

## 15. Receitas: tirando o máximo do TSRS

**Site ou landing page.** Crie uma pasta "Site da empresa" com o contexto (marca,
cores, público). Peça a página em arquivos separados, veja no Preview, ajuste
conversando e abra a pasta do projeto no seu editor ou no Claude Code para
publicar.

**Vídeo para redes sociais.** Gere a trilha ("música eletrônica calma de 15
segundos"), peça a animação motion em 1080x1920 com o texto da campanha, ajuste
na linha do tempo e clique em **Gerar MP4**.

**Pesquisa de mercado.** Configure a busca própria, ligue **Pesquisa** e pergunte
"quais são os principais concorrentes de X no Brasil, preços e diferenciais".
O relatório com fontes fica na pasta do projeto para você revisar e reaproveitar.

**Atendimento ou suporte.** Crie uma base de conhecimento com os manuais e as
perguntas frequentes, um agente "Suporte" ligado a ela e use para responder
clientes com base nos documentos oficiais.

**Escolher o melhor modelo.** Use **Comparar com outros modelos** com a mesma
tarefa em três modelos e veja qualidade, velocidade e custo lado a lado.

**Rotina automática.** Uma tarefa na **Agenda** toda manhã com "resuma as
novidades de IA de ontem em 5 tópicos" (com a busca própria ligada).

**Padronizar a equipe.** Escreva skills com os padrões da empresa (tom de voz,
formato de propostas, checklist de revisão) e compartilhe a pasta da skill: cada
pessoa instala no seu TSRS.

**Dicas gerais:**

- Diga o **formato** que quer ("em tabela", "em 5 tópicos", "em arquivos separados").
- Dê **exemplos** do que é bom e do que não é.
- Para tarefas grandes, peça **um plano primeiro** e depois a execução.
- Use **Ramificar** para testar outra abordagem sem perder a conversa atual.
- Ctrl+K é o atalho para quase tudo.

## 16. Problemas comuns

**"Failed to fetch" ou erro de CORS com um provedor.** Algumas APIs não aceitam
chamadas do navegador. Rode `npm run proxy` em outro terminal e ligue **Usar o proxy
local** no provedor, em **Configurações → Provedores**.

**"Carregar modelos" não mostra nada.** Confira a chave (sem espaços sobrando)
e se a conta tem crédito. Dá para digitar o nome do modelo direto na barra
superior.

**O Ollama não conecta.** Confira se o Ollama está aberto (`ollama list` no
terminal) e se o modelo foi baixado.

**A pasta do projeto ou o Gerar MP4 não aparecem.** Esses recursos precisam do
TSRS aberto pelo `npm run dev`, não por um build estático. Confira se o
terminal está rodando.

**O MP4 não gera.** Instale o ffmpeg e reinicie o `npm run dev`. No Windows,
feche e abra o terminal depois de instalar.

**O vídeo saiu sem som.** Escolha a trilha no preview antes de clicar em **Gerar
MP4**.

**A leitura em voz alta está robótica.** Use o Microsoft Edge (vozes "Natural"
grátis) ou uma voz da ElevenLabs, da OpenAI ou do Gemini.

**Esqueci a senha das chaves.** Não há como recuperar: é isso que mantém as
chaves seguras. Em **Configurações → Dados**, **Apagar tudo** e cole as chaves de
novo (faça um backup das conversas antes; ele não inclui chaves).

**As conversas sumiram.** Elas ficam no navegador: confira se está no mesmo
navegador, perfil e endereço (`localhost:5173`; `127.0.0.1:5173` é outro site
para o navegador). Limpar os dados do site apaga as conversas. Com o backup
automático, o TSRS oferece restaurar ao abrir vazio; veja também a opção do
Chrome de apagar dados ao fechar, na seção 14.

**`npm ci` falha.** Confira `node --version` (precisa ser 22 ou mais). No Windows,
rode o terminal como usuário comum, não como administrador.

**A agenda não rodou.** O computador precisa estar ligado, o `npm run dev`
rodando e a chave do provedor guardada para a agenda.

## 17. Perguntas frequentes

**O TSRS é grátis?** Sim, é open source (licença MIT). Você paga só o uso dos
provedores, direto a eles, ou nada, com modelos locais.

**Os meus dados são usados para treinar modelos?** O TSRS não envia nada a
ninguém além do provedor que você escolheu. O uso dos dados por cada provedor
segue a política dele; nas APIs pagas, em geral, os dados não são usados para
treino. Confira a política do provedor.

**Funciona sem internet?** Com o Ollama ou o LM Studio, sim. Os outros
provedores precisam de internet.

**Posso usar no celular?** Por enquanto, o TSRS é feito para rodar no
computador, onde ficam as pastas, o servidor local e as chaves.

**Posso usar com a minha equipe?** Cada pessoa roda o seu TSRS. Para dividir
padrões, compartilhe skills, plugins, agentes (pelo backup) e pastas de projeto.
Recursos de equipe hospedados estão fora do escopo, de propósito.

**Como peço um recurso ou relato um problema?** Pelas
[Issues](https://github.com/Eddienews/tsrs/issues) ou pelas
[Discussions](https://github.com/Eddienews/tsrs/discussions), em português ou
inglês. Veja também o [Como contribuir](../CONTRIBUTING.pt-BR.md).

---

## 18. Estúdio: painel, quadro, mesa e agentes do computador

Na barra lateral, logo abaixo de **Nova conversa**, fica o **Estúdio**: três
páginas que tomam o lugar da conversa. **Conversa** (no alto da página) volta.
Todas precisam do TSRS servido por `npm run dev`.

### Claude Code e Codex como modelos

Se o Claude Code ou o Codex estão instalados no seu computador, eles aparecem
na lista de modelos como **Claude Code (CLI)** e **Codex (CLI)**. Eles usam o
login e o plano que você já tem neles; o TSRS não pede chave.

1. Em **Configurações → Provedores**, no bloco do agente, confira o **Comando**
   (`claude` ou `codex`; se não estiverem no PATH, cole o caminho completo) e
   clique em **Verificar**. Aparece a versão e, no Claude Code, quanto do limite
   do plano já foi usado.
2. Escolha **O que o agente pode fazer** na pasta do projeto: **Só ler**,
   **Editar arquivos** (o padrão) ou **Acesso total** (roda qualquer comando
   sem perguntar; use só em projetos em que você confia).
3. Escolha o modelo no seletor (`opus`, `sonnet`, `haiku` ou `default` no
   Claude Code; `default` no Codex usa o modelo do seu `config.toml`).

O agente trabalha na **pasta de projeto da conversa**, com as ferramentas dele:
os comandos e as edições aparecem na resposta. A segunda mensagem continua a
mesma sessão do agente; se você editar ou regenerar uma mensagem antiga, ele
começa uma sessão nova com a conversa inteira. As ferramentas do próprio TSRS
(canvas, mídia, MCP) não são oferecidas a ele.

> **Dica:** o TSRS mostra os tokens dessas respostas, mas não um preço: quem
> paga é o plano do agente.

### Painel do dia

O dia num relance: respostas, tokens e custo de hoje e da semana; o **Foco de
hoje** (uma lista curta do que fazer, que leva para o dia seguinte o que ficou
aberto); a agenda de hoje; o quadro de produção por etapa com o que vence na
semana; os agentes de linha de comando; e as conversas recentes. Em
**Configurações → Aparência** dá para fazer o TSRS **abrir no Painel do dia**.

### Quadro de produção

Um card por episódio, anúncio ou vídeo, nas colunas Roteiro, Takes, Montagem,
Render, Revisão e Publicado (**Colunas** renomeia, acrescenta e tira colunas
vazias). Arraste o card ou use as setas dele. Clique no título para editar:
série ou cliente, idioma, prazo, notas e a **conversa** onde o trabalho
acontece; **Abrir conversa** leva até ela.

Se a pasta do projeto tiver uma pasta `takes/` com um JSON por take, o card
mostra quantos estão aprovados e quantos são para refazer:

```json
{ "line": 3, "mode": "first-frame", "prompt": "…", "seed": 42, "status": "approved" }
```

`status` é `approved`, `redo` ou `pending`. Quem grava esses arquivos é quem
gera os takes: um script, um agente de linha de comando ou você.

O quadro fica em `projetos/_producao/quadro.json` (a versão anterior fica ao
lado, em `quadro.anterior.json`). Card removido vai para **Cards removidos**,
de onde volta.

### Mesa de agentes

Agentes da Biblioteca trabalhando juntos numa tarefa. Em **Nova mesa**, dê um
nome, adicione agentes e escreva o **papel** de cada um ("pesquisa
referências", "escreve a cena", "revisa"), escolha um **coordenador** e quantas
**rodadas** (até 3). Em cada rodada, cada agente lê a tarefa e tudo o que os
outros já escreveram; no fim, o coordenador escreve o resultado.

Cada agente responde com o modelo dele (sem modelo próprio, com o escolhido no
alto). Um agente que usa o Claude Code ou o Codex trabalha na pasta da mesa, e
pode criar arquivos ali. O registro da rodada fica em `mesa.md` nessa pasta, e
**Salvar como conversa** transforma o resultado numa conversa para continuar.

### Conversa por voz

O botão de fone, ao lado do microfone, liga a conversa por voz: o microfone
abre, você fala, e numa pausa de um segundo e meio a mensagem vai; a resposta é
lida em voz alta e o microfone abre de novo. Clique outra vez para sair. Usa o
ditado e a voz escolhidos em **Configurações**.

### Notas no Obsidian

Em **Configurações → Geral → Obsidian**, informe a **pasta do cofre** e a pasta
das notas dentro dele. Cada conversa pode ser salva como nota pelo menu dela
(**Salvar no Obsidian**) ou, com **Atualizar a nota a cada resposta**, depois de
cada resposta. A nota leva o modelo, as datas e as etiquetas nas propriedades, e
mantém o nome que recebeu na primeira vez.

## 19. O comando tsrs: o TSRS para agentes

O `tsrs` deixa um agente do computador (Claude Code, Codex, um bot) ou você
mesmo, no terminal, usar o TSRS que está aberto: criar e escrever em pastas de
projeto, renderizar um vídeo motion, conferir uma página, mexer no quadro de
produção, ver a agenda e gerar imagens locais.

**Preparar, uma vez:** na pasta do TSRS, rode `npm link`. Depois, com o TSRS
aberto (`npm run dev`), `tsrs status` mostra se ele responde. Sem o `npm link`,
use `node bin/tsrs.mjs` na pasta do TSRS.

**O que dá para fazer:** `tsrs --help` lista os comandos; `tsrs <comando> --help`
mostra os argumentos e um exemplo. Os principais:

| Comando | O que faz |
| --- | --- |
| `tsrs projects list` / `files` / `read` | Pastas de projeto, os arquivos de uma e o texto de um arquivo |
| `tsrs projects new "Nome"` | Cria a pasta, com NOTES.md |
| `tsrs projects write <pasta> <arquivo> --from ./arquivo` | Grava um arquivo (texto ou imagem) e anota no histórico |
| `tsrs render motion <pasta> motion-1.html` | Gera o MP4 em `videos/` da pasta |
| `tsrs design check <pasta> index.html` | Abre a página em três larguras e diz o que não cabe |
| `tsrs board list` / `add` / `move` / `update` / `remove` | O quadro de produção |
| `tsrs agenda list` / `run` | As tarefas agendadas; rodar uma agora |
| `tsrs image local "descrição" --project <pasta>` | Imagem grátis no ComfyUI ou no sd-server |

**Nada caro ou sem volta acontece sem `--yes`.** Substituir um arquivo que já
existe ou rodar uma tarefa da agenda (que chama um modelo pago) só diz o que
faria e sai com o código 3. O agente deve então perguntar a você e só repetir
com `--yes` depois do seu sim. Um cartão removido do quadro vai para os
removidos e volta pelo TSRS.

**Para agentes:** `--json` dá a resposta em formato fixo, e o código de saída diz
o que houve (0 feito, 2 argumentos errados, 3 precisa de `--yes`, 4 o TSRS não
está aberto, 5 falhou). `tsrs mcp` oferece os mesmos comandos como servidor MCP
(no Claude Code: `claude mcp add tsrs -- tsrs mcp`). A skill
`skills/tsrs/SKILL.md` ensina essas regras ao agente: copie a pasta para
`~/.claude/skills/` ou a pasta de skills do seu agente.

**Segurança:** a cada início o TSRS grava um token novo em
`extensoes/.tsrs-agent.json`, que só o seu usuário do computador lê. O comando
envia esse token; sem ele, ou vindo de uma página web, o pedido é recusado.

Conversas, biblioteca, memória, mesa de agentes, Obsidian e mídia paga ficam no
navegador e ainda não estão no comando.
