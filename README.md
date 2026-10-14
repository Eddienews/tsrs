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
```

Os testes de ponta a ponta precisam de um Chromium: rode
`npx playwright install chromium` uma vez, ou aponte `CHROMIUM_PATH` para o
navegador do sistema.

Abra **Configurações**, informe a chave do provedor, clique em **Carregar
modelos** (ou digite o nome do modelo na barra superior) e envie uma mensagem.

## Recursos

- Respostas em streaming, com Markdown, realce de sintaxe e botão de copiar.
- Editar e reenviar uma mensagem, regenerar a resposta e tentar de novo após um erro.
- Versões: editar ou regenerar guarda a versão anterior da conversa, e as
  setas ‹ › em cada mensagem alternam entre elas.
- Comparar modelos: até três outros modelos respondem à mesma pergunta ao mesmo
  tempo, e as respostas aparecem em colunas lado a lado.
- Ferramentas: servidores MCP remotos (HTTP), com pedido de permissão a cada
  chamada, e busca na web e leitura de páginas executadas pelo provedor
  (Anthropic; busca também no OpenRouter).
- Biblioteca de personas (prompts de sistema com nome, opcionalmente ligados a
  um modelo) e de prompts salvos para inserir na mensagem, com campos
  `{{nome}}` preenchidos na hora de inserir.
- Preview: blocos de código HTML, SVG, JavaScript, Markdown, React (JSX/TSX) e
  Mermaid abrem em um painel ao lado da conversa, com abas de código e console e tamanhos de tela; a barra
  de endereço também abre páginas por URL (por exemplo, `localhost:3000`).
- Paleta de comandos (Ctrl/⌘+K) para ir a conversas, trocar de modelo e abrir
  telas.
- O modelo é avisado, por uma nota no prompt de sistema, de que o preview existe
  (pode ser desligado em Configurações → Geral).
- Tema claro e escuro, cor de destaque, tamanho da fonte e densidade.
- Anexos: imagens e PDFs (colar, arrastar ou escolher) e arquivos de texto.
- Conversas com busca, pastas, fixar, renomear e título gerado automaticamente.
- Parâmetros por conversa: prompt de sistema, temperatura, máximo de tokens e
  nível de raciocínio.
- Exportar uma conversa em Markdown; backup e restauração de tudo em JSON
  (conversas, pastas, personas e prompts; sem as chaves de API); apagar tudo o
  que o app guardou no navegador.
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

## Provedores

Anthropic, OpenAI, Google Gemini, OpenRouter, DeepSeek, Mistral, xAI (Grok),
Groq, Perplexity, Command Code, Ollama (local), LM Studio (local) e qualquer
endpoint compatível com a API de chat da OpenAI ("Custom").

O Command Code aparece duas vezes, com a mesma chave: "Command Code" para os
modelos no formato da OpenAI e "Command Code (Claude)" para os modelos Claude,
que ele só serve no formato da Anthropic. A API dele exige o plano Pro.

Na Anthropic, o cache de prompt fica ligado por padrão: a parte da conversa já
enviada é cobrada a cerca de 10% do preço nas mensagens seguintes. O rodapé de
cada resposta mostra quantos tokens vieram do cache.

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
| `src/Markdown.tsx`       | Markdown das respostas e blocos de código                   |
| `src/ToolCallBlock.tsx`  | Chamada de ferramenta e pedido de permissão                 |
| `src/Composer.tsx`       | Campo de envio, anexos e prompts salvos                     |
| `src/PreviewPanel.tsx`   | Painel de preview                                           |
| `src/preview.ts`         | Documento do preview, console e endereços                   |
| `src/prompts.ts`         | Campos `{{nome}}` dos prompts salvos                        |
| `src/CommandPalette.tsx` | Paleta de comandos                                          |
| `src/appearance.ts`      | Tema, cor de destaque, fonte e densidade                    |
| `src/components/ui/`     | Componentes de interface (shadcn/ui sobre Radix)            |
| `src/styles.css`         | Tailwind e as variáveis de cor e tipografia                 |
| `src/ParamsPanel.tsx`    | Parâmetros da conversa                                      |
| `src/SettingsDialog.tsx` | Chaves, URLs base, títulos, segurança e dados               |
| `src/UnlockDialog.tsx`   | Pedido de senha para desbloquear as chaves                  |
| `src/LibraryDialog.tsx`  | Personas e prompts salvos                                   |
| `src/CompareDialog.tsx`  | Escolha do modelo para comparar uma resposta                |
| `public/sw.js`           | Service worker: app disponível sem conexão                  |
| `e2e/`                   | Testes de ponta a ponta e o provedor falso que eles usam    |

No IndexedDB, cada conversa é gravada em duas partes: os metadados (título,
pasta, modelo) e as mensagens. A lista lateral lê só os metadados; as
mensagens são lidas quando a conversa é aberta.

## Roadmap

Próximos passos em [ROADMAP.md](ROADMAP.md).

## Limitações conhecidas

- Sem senha, as chaves de API ficam no `localStorage` em texto puro. Com senha,
  ficam criptografadas em repouso, mas continuam na memória da página enquanto
  o app está desbloqueado.
- O custo é uma estimativa: usa o valor informado pelo provedor quando existe
  e, senão, uma tabela de preços que pode estar desatualizada. Sem preço
  conhecido, só os tokens são mostrados.
- Sem sincronização entre dispositivos.
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
- Provedores que não liberam CORS para o navegador precisam de um proxy.

## Licença

[MIT](LICENSE)
