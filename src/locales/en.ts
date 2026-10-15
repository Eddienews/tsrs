// English text for each Portuguese string passed to t().
export const en: Record<string, string> = {
  // App
  'Informe a URL base de {provider} nas configurações.':
    'Enter the base URL for {provider} in the settings.',
  'As chaves de API estão bloqueadas por senha.': 'The API keys are locked with a password.',
  'Informe a chave de API de {provider} nas configurações.':
    'Enter the API key for {provider} in the settings.',
  'Escolha ou digite um modelo.': 'Choose or type a model.',
  'Busca na web': 'Web search',
  'Leitura de página': 'Page fetch',
  'Nova conversa': 'New chat',
  'Excluir a conversa "{title}"?': 'Delete the chat "{title}"?',
  'Excluir a pasta "{name}"? As conversas dela são mantidas.':
    'Delete the folder "{name}"? Its chats are kept.',
  '{imported} de {total} conversas importadas.': '{imported} of {total} chats imported.',
  'Persona desta conversa': 'Persona for this chat',
  'Sem persona': 'No persona',
  'Sem nome': 'Unnamed',
  Parâmetros: 'Parameters',
  Biblioteca: 'Library',
  Ferramentas: 'Tools',
  'Total de tokens e custo estimado desta conversa': 'Total tokens and estimated cost of this chat',
  'Suas conversas e chaves ficam só neste navegador. As mensagens vão direto para o provedor escolhido.':
    'Your chats and keys stay in this browser only. Messages go straight to the chosen provider.',
  'Carregando…': 'Loading…',
  Desbloquear: 'Unlock',
  'Abrir configurações': 'Open settings',
  'Remover anexo': 'Remove attachment',
  'Anexar imagens, PDFs ou arquivos de texto': 'Attach images, PDFs or text files',
  Anexar: 'Attach',
  'Inserir um prompt salvo': 'Insert a saved prompt',
  'Sem título': 'Untitled',
  'Gerenciar prompts…': 'Manage prompts…',
  'Criar um prompt…': 'Create a prompt…',
  'Escreva sua mensagem… (Enter envia, Shift+Enter quebra a linha)':
    'Write your message… (Enter sends, Shift+Enter adds a line break)',
  Parar: 'Stop',
  Enviar: 'Send',

  // Sidebar
  'Novo título da conversa:': 'New chat title:',
  'Nome da pasta:': 'Folder name:',
  'Novo nome da pasta:': 'New folder name:',
  Opções: 'Options',
  Desafixar: 'Unpin',
  Fixar: 'Pin',
  Renomear: 'Rename',
  'Mover para “{name}”': 'Move to “{name}”',
  'Tirar da pasta': 'Remove from folder',
  'Exportar Markdown': 'Export Markdown',
  Excluir: 'Delete',
  'Nova pasta': 'New folder',
  'Buscar nas conversas…': 'Search chats…',
  '{count} resultado': '{count} result',
  '{count} resultados': '{count} results',
  Fixadas: 'Pinned',
  'Opções da pasta': 'Folder options',
  'Excluir pasta': 'Delete folder',
  Conversas: 'Chats',
  Configurações: 'Settings',

  // Messages
  Copiado: 'Copied',
  Copiar: 'Copy',
  'aguardando permissão': 'waiting for permission',
  'executando…': 'running…',
  falhou: 'failed',
  concluída: 'done',
  'O modelo quer usar esta ferramenta.': 'The model wants to use this tool.',
  Negar: 'Deny',
  Permitir: 'Allow',
  'Salvar e reenviar': 'Save and resend',
  Cancelar: 'Cancel',
  'Versão {number}': 'Version {number}',
  'Usar esta': 'Use this one',
  'Pensando…': 'Thinking…',
  'Resposta cortada: o limite de tokens de saída foi atingido.':
    'Reply cut short: the output token limit was reached.',
  'Versão anterior': 'Previous version',
  'Próxima versão': 'Next version',
  Editar: 'Edit',
  'Tentar de novo': 'Try again',
  Regenerar: 'Regenerate',
  Comparar: 'Compare',
  'Lado a lado': 'Side by side',
  '{input} entrada · {output} saída': '{input} input · {output} output',

  // Chat parameters
  'Prompt de sistema desta conversa': 'System prompt for this chat',
  'Vazio usa o prompt de sistema global.': 'Empty uses the global system prompt.',
  Temperatura: 'Temperature',
  padrão: 'default',
  'Máximo de tokens': 'Max tokens',
  'Nível de raciocínio': 'Reasoning effort',
  'Os modelos atuais de {provider} não aceitam temperatura; use o nível de raciocínio.':
    'Current {provider} models do not accept a temperature; use the reasoning effort.',

  // Settings
  Idioma: 'Language',
  Fechar: 'Close',
  '{count} modelos carregados.': '{count} models loaded.',
  'Falhou: {message}': 'Failed: {message}',
  'Prompt de sistema global': 'Global system prompt',
  'Opcional. Usado nas conversas sem prompt próprio.':
    'Optional. Used in chats without a prompt of their own.',
  Títulos: 'Titles',
  'Gerar o título da conversa automaticamente': 'Generate the chat title automatically',
  'Modelo para títulos': 'Model for titles',
  'Vazio usa o modelo da conversa. Um modelo barato do mesmo provedor serve.':
    'Empty uses the chat model. A cheap model from the same provider is enough.',
  Provedores: 'Providers',
  'chave salva': 'key saved',
  bloqueada: 'locked',
  'Chave de API': 'API key',
  'Chave de API (opcional)': 'API key (optional)',
  'Desbloqueie as chaves para ver ou alterar': 'Unlock the keys to view or change',
  'URL base': 'Base URL',
  'https://exemplo.com/v1': 'https://example.com/v1',
  'Carregar modelos': 'Load models',
  '{count} modelos na lista.': '{count} models in the list.',
  'Segurança das chaves': 'Key security',
  'Sem proteção, as chaves ficam no localStorage deste navegador em texto puro. Com uma senha, elas são gravadas criptografadas e pedidas uma vez a cada abertura do app.':
    'Without protection, the keys are kept in this browser’s localStorage in plain text. With a password, they are stored encrypted and asked for once each time the app is opened.',
  Senha: 'Password',
  'Repita a senha': 'Repeat the password',
  Proteger: 'Protect',
  'Mostrar senha': 'Show password',
  'Chaves protegidas por senha e desbloqueadas.': 'Keys protected by a password and unlocked.',
  'Bloquear agora': 'Lock now',
  'Remover proteção': 'Remove protection',
  'Chaves protegidas por senha e bloqueadas.': 'Keys protected by a password and locked.',
  'Apagar todas as chaves salvas e remover a senha?':
    'Erase all saved keys and remove the password?',
  'Esqueci a senha': 'Forgot password',
  'A senha não pode ser recuperada. As chaves só são enviadas ao provedor correspondente.':
    'The password cannot be recovered. Keys are only sent to their own provider.',
  Dados: 'Data',
  'Exportar backup': 'Export backup',
  'Importar backup': 'Import backup',
  'O backup contém conversas, pastas, personas e prompts. Chaves de API não são exportadas.':
    'The backup contains chats, folders, personas and prompts. API keys are not exported.',

  // Unlock
  'Senha incorreta. Se o navegador preencheu o campo sozinho, apague-o antes de digitar.':
    'Wrong password. If the browser filled in the field by itself, clear it before typing.',
  'Desbloquear chaves': 'Unlock keys',
  'Suas chaves de API estão protegidas por senha.': 'Your API keys are protected by a password.',
  'Agora não': 'Not now',
  'Verificando…': 'Checking…',

  // Library
  Nome: 'Name',
  'Prompt de sistema': 'System prompt',
  'Provedor da persona': 'Persona provider',
  'Modelo atual da conversa': 'Current chat model',
  Modelo: 'Model',
  'Nova persona': 'New persona',
  'Prompts salvos': 'Saved prompts',
  'Textos prontos para inserir na mensagem pelo botão Prompts.':
    'Ready-made texts to insert into the message with the Prompts button.',
  Título: 'Title',
  Texto: 'Text',
  'Novo prompt': 'New prompt',

  // Compare
  Gerar: 'Generate',

  // Tools
  'Conectando…': 'Connecting…',
  '{count} ferramentas: {names}': '{count} tools: {names}',
  'Conectado, mas o servidor não oferece ferramentas.':
    'Connected, but the server offers no tools.',
  'Leitura de páginas': 'Page fetch',
  'Executadas pelo próprio provedor e cobradas por ele. A busca funciona com Anthropic e OpenRouter; a leitura de páginas, só com Anthropic.':
    'Run and billed by the provider itself. Search works with Anthropic and OpenRouter; page fetch, with Anthropic only.',
  '{provider}, o provedor selecionado, não oferece nenhuma das duas.':
    '{provider}, the selected provider, offers neither.',
  'Servidores MCP': 'MCP servers',
  'Servidores remotos (HTTP) cujas ferramentas o modelo pode chamar. O servidor precisa aceitar chamadas do navegador (CORS); servidores locais por linha de comando e login por OAuth não são suportados.':
    'Remote (HTTP) servers whose tools the model can call. The server must accept calls from the browser (CORS); local command-line servers and OAuth login are not supported.',
  ativo: 'enabled',
  'https://exemplo.com/mcp': 'https://example.com/mcp',
  'Token (opcional)': 'Token (optional)',
  'Usar nas conversas': 'Use in chats',
  'Executar sem pedir permissão': 'Run without asking for permission',
  'Testar conexão': 'Test connection',
  'Novo servidor': 'New server',
  'Sem a opção de executar sem permissão, cada chamada aparece na conversa e espera você permitir. O resultado de uma ferramenta é enviado ao modelo.':
    'Without the option to run without permission, each call appears in the chat and waits for you to allow it. The result of a tool is sent to the model.',

  // Files and export
  '"{name}" passa de 10 MB.': '"{name}" is larger than 10 MB.',
  colado: 'pasted',
  '"{name}" não é imagem, PDF nem texto.': '"{name}" is not an image, a PDF or text.',
  conversa: 'chat',
  Você: 'You',
  Assistente: 'Assistant',
  'Anexos: {names}': 'Attachments: {names}',
  'Erro: {message}': 'Error: {message}',
  'O arquivo não é um JSON válido.': 'The file is not valid JSON.',
  'O arquivo não é um backup do TSRS.': 'The file is not a TSRS backup.',
  'O backup foi criado por uma versão mais nova do TSRS.':
    'The backup was created by a newer version of TSRS.',

  // MCP and provider errors
  'O servidor pode não permitir chamadas do navegador (CORS).':
    'The server may not allow calls from the browser (CORS).',
  'Servidor MCP "{name}": {detail}.': 'MCP server "{name}": {detail}.',
  'Chave de API inválida ou sem permissão': 'Invalid API key or no permission',
  'Modelo ou endereço não encontrado': 'Model or address not found',
  'Limite de uso atingido; tente de novo em {seconds} s':
    'Rate limit reached; try again in {seconds} s',
  'Limite de uso atingido; tente de novo em instantes': 'Rate limit reached; try again shortly',
  'O provedor está com problemas; tente de novo em instantes':
    'The provider is having problems; try again shortly',
  'O provedor recusou a requisição': 'The provider rejected the request',
  'Não foi possível conectar a {host}. Verifique sua conexão e a URL base; se ambas estiverem certas, o provedor pode não permitir chamadas diretas do navegador (CORS).':
    'Could not connect to {host}. Check your connection and the base URL; if both are right, the provider may not allow direct calls from the browser (CORS).',
  'O modelo recusou esta solicitação.': 'The model refused this request.',
  'O modelo pediu ferramentas {count} vezes seguidas; a resposta foi interrompida.':
    'The model asked for tools {count} times in a row; the reply was stopped.',

  // Layout and navigation
  'TSRS · pronto': 'TSRS · ready',
  'No que vamos trabalhar?': 'What are we working on?',
  'Explique um conceito difícil em termos simples': 'Explain a hard concept in simple terms',
  'Revise e melhore um texto meu': 'Review and improve a text of mine',
  'Crie uma página HTML simples para eu ver no preview':
    'Create a simple HTML page for me to see in the preview',
  'Compare os prós e os contras de duas opções': 'Compare the pros and cons of two options',
  'Escolher modelo': 'Choose model',
  'Buscar ou digitar um modelo…': 'Search or type a model…',
  'Nenhum modelo encontrado.': 'No model found.',
  'Usar “{model}”': 'Use “{model}”',
  'Digite o nome do modelo ou carregue a lista nas configurações.':
    'Type the model name or load the list in the settings.',
  'Abrir a lista de conversas': 'Open the chat list',
  'contexto {percent}%': 'context {percent}%',
  'Alternar tema': 'Toggle theme',
  Pastas: 'Folders',
  'Nenhuma conversa ainda.': 'No chats yet.',
  'Buscar conversas, modelos e ações…': 'Search chats, models and actions…',
  'Nada encontrado.': 'Nothing found.',
  Ações: 'Actions',
  'Trocar de modelo': 'Switch model',
  'Inserir prompt': 'Insert prompt',
  'Solte os arquivos para anexar': 'Drop files to attach',
  Entrada: 'Input',
  Resultado: 'Result',

  // Deleting everything
  'Apagar tudo': 'Delete everything',
  'Remove deste navegador todas as conversas, chaves de API e configurações. Não pode ser desfeito; exporte um backup antes se quiser guardar as conversas.':
    'Removes every chat, API key and setting from this browser. This cannot be undone; export a backup first if you want to keep the chats.',
  'Apagar todas as conversas, chaves de API e configurações deste navegador?':
    'Delete every chat, API key and setting from this browser?',

  // Message actions, sources and export
  '{title} (ramificação)': '{title} (branch)',
  'Ramificar a partir daqui': 'Branch from here',
  'Mensagens fixadas': 'Pinned messages',
  Fixada: 'Pinned',
  Fontes: 'Sources',
  'Ler em voz alta': 'Read aloud',
  'Parar a leitura': 'Stop reading',
  'Exportar HTML': 'Export HTML',
  'Abrir o preview sozinho': 'Open the preview automatically',
  'Abrir o preview sozinho quando a resposta trouxer uma página, imagem SVG, componente React ou diagrama':
    'Open the preview automatically when a reply brings a page, SVG image, React component or diagram',

  // Dictation
  Ditar: 'Dictate',
  'Parar o ditado': 'Stop dictating',
  Ditado: 'Dictation',
  Automático: 'Automatic',
  'Reconhecimento do navegador': 'Browser speech recognition',
  'O áudio vai para o provedor escolhido, que cobra pela transcrição. No automático, usa a OpenAI ou o Groq se houver chave e, senão, o navegador (no Chrome, o áudio vai para o Google).':
    'The audio goes to the chosen provider, which charges for the transcription. Automatic uses OpenAI or Groq when there is a key and otherwise the browser (in Chrome, the audio goes to Google).',
  'O navegador não permitiu usar o microfone ou o reconhecimento de voz.':
    'The browser did not allow the microphone or speech recognition.',
  'Nenhuma fala foi detectada.': 'No speech was detected.',
  'O reconhecimento de voz do navegador não está disponível aqui. Configure uma chave da OpenAI ou do Groq para ditar.':
    'Browser speech recognition is not available here. Set up an OpenAI or Groq key to dictate.',

  // Prompt cache
  'Cache de prompt (Anthropic)': 'Prompt cache (Anthropic)',
  'A Anthropic guarda a conversa por alguns minutos e cobra cerca de 10% do preço pela parte já enviada. A gravação no cache custa 25% a mais, então só não compensa em conversas de uma pergunta.':
    'Anthropic keeps the conversation for a few minutes and charges about 10% of the price for the part already sent. Writing to the cache costs 25% more, so it only fails to pay off in one-question chats.',
  '{input} entrada ({cached} do cache) · {output} saída': '{input} in ({cached} cached) · {output} out',

  // Reasoning
  Raciocínio: 'Reasoning',
  'Mostrar o raciocínio do modelo': "Show the model's reasoning",
  'Aparece recolhido acima da resposta, quando o provedor envia. Nos modelos Claude 4.6 ou mais novos, pede um resumo do raciocínio, sem custo extra.':
    'Shown folded above the reply when the provider sends it. On Claude 4.6 and newer models, asks for a summary of the reasoning at no extra cost.',

  // Comparison
  'Comparar com outros modelos': 'Compare with other models',
  'Até {count} modelos respondem à mesma pergunta ao mesmo tempo. As respostas ficam lado a lado e o modelo da conversa não muda.':
    'Up to {count} models answer the same question at the same time. The answers sit side by side and the chat keeps its model.',
  'Remover {model}': 'Remove {model}',
  '{count} colunas': '{count} columns',

  // Usage screen
  Uso: 'Usage',
  Conversa: 'Chat',
  Período: 'Period',
  '{count} dias': '{count} days',
  '{count} tokens': '{count} tokens',
  Tokens: 'Tokens',
  tokens: 'tokens',
  'Custo estimado': 'Estimated cost',
  Respostas: 'Replies',
  'Média por dia': 'Average per day',
  '{count} respostas sem preço conhecido': '{count} replies with no known price',
  'Nenhuma resposta neste período.': 'No replies in this period.',
  'Tokens por dia': 'Tokens per day',
  'Por modelo': 'By model',
  Custo: 'Cost',
  'O custo é uma estimativa feita neste navegador. Os títulos gerados automaticamente não entram na conta, e respostas apagadas deixam de ser contadas.':
    'The cost is an estimate made in this browser. Automatically generated titles are not counted, and deleted replies stop being counted.',
  '{count} respostas antigas, de antes de as mensagens terem data, aparecem no dia da última atividade da conversa.':
    '{count} older replies, from before messages had a date, appear on the day of their chat’s last activity.',

  // Preview panel
  'Não foi possível carregar as bibliotecas do preview. Verifique a conexão com a internet.':
    'Could not load the libraries the preview needs. Check the internet connection.',
  'Avisar o modelo sobre o preview': 'Tell the model about the preview',
  'Acrescenta ao prompt de sistema uma nota dizendo que blocos de código HTML, SVG, JavaScript e Markdown podem ser abertos no preview.':
    'Adds a note to the system prompt saying that HTML, SVG, JavaScript and Markdown code blocks can be opened in the preview.',
  Preview: 'Preview',
  'Abrir preview': 'Open preview',
  'Abrir ou fechar o preview': 'Open or close the preview',
  'Fechar o preview': 'Close the preview',
  'Fechar {name}': 'Close {name}',
  Celular: 'Phone',
  Tablet: 'Tablet',
  Computador: 'Desktop',
  Recarregar: 'Reload',
  Endereço: 'Address',
  'Digite um endereço, como localhost:3000': 'Type an address, such as localhost:3000',
  'Abrir em nova aba': 'Open in new tab',
  Baixar: 'Download',
  'Nada para mostrar ainda': 'Nothing to show yet',
  'Use “Abrir preview” em um bloco de código HTML, SVG, JavaScript ou Markdown, ou digite um endereço acima.':
    'Use “Open preview” on an HTML, SVG, JavaScript or Markdown code block, or type an address above.',
  'Se a página ficar em branco, o site não permite ser exibido dentro de outros aplicativos.':
    'If the page stays blank, the site does not allow being shown inside other apps.',
  Código: 'Code',
  Console: 'Console',
  'O console está vazio.': 'The console is empty.',

  // Dialogs
  'Guardadas apenas neste navegador.': 'Stored only in this browser.',
  Seções: 'Sections',
  Geral: 'General',
  Aparência: 'Appearance',
  Segurança: 'Security',
  Atalhos: 'Shortcuts',
  'Mostrar chave': 'Show key',
  'Ocultar chave': 'Hide key',
  'Ocultar senha': 'Hide password',
  Tema: 'Theme',
  Claro: 'Light',
  Escuro: 'Dark',
  'Cor de destaque': 'Accent color',
  Âmbar: 'Amber',
  Verde: 'Green',
  Azul: 'Blue',
  Vermelho: 'Red',
  'Tamanho da fonte': 'Font size',
  Pequena: 'Small',
  Média: 'Medium',
  Grande: 'Large',
  Densidade: 'Density',
  Compacta: 'Compact',
  Confortável: 'Comfortable',
  'Paleta de comandos': 'Command palette',
  'Enviar mensagem': 'Send message',
  'Quebrar a linha': 'Insert a line break',
  'O que o modelo pode usar.': 'What the model is allowed to use.',
  'Mostrar detalhes': 'Show details',
  'Ocultar detalhes': 'Hide details',
  'Use {{variável}} para campos preenchidos ao inserir o prompt.':
    'Use {{variable}} for fields filled in when inserting the prompt.',
  'Valem apenas para esta conversa.': 'Applied to this conversation only.',

  // Memory, agents, summaries, images, side questions, proxy
  'Memória': 'Memory',
  'Esta conversa já ocupa {percent}% do contexto do modelo. Resuma a conversa para continuar com menos tokens, ou comece uma nova.':
    'This chat already fills {percent}% of the model context. Summarize it to go on with fewer tokens, or start a new chat.',
  'Resumir a conversa': 'Summarize the chat',
  'Descreva a imagem que você quer gerar…': 'Describe the image you want to generate…',
  'Gerar uma imagem com a próxima mensagem': 'Generate an image from the next message',
  'Imagem': 'Image',
  'Os arquivos de uma persona somam no máximo cerca de 1,5 MB.':
    'A persona\'s files can add up to about 1.5 MB at most.',
  'Ferramentas próprias': 'Own tools',
  'Desligado, a persona usa as ferramentas ligadas para todas as conversas.':
    'When off, the persona uses the tools switched on for every chat.',
  'Arquivos': 'Files',
  'Enviados com a primeira mensagem de cada pedido, como contexto.':
    'Sent with the first message of every request, as context.',
  'Anexar arquivos': 'Attach files',
  'Sugestões iniciais (uma por linha)': 'Starter suggestions (one per line)',
  'Usar memória': 'Use memory',
  'Ligada, o modelo recebe esta lista em toda conversa e pode acrescentar ou apagar fatos sozinho quando você pedir ou quando achar útil. Precisa de um modelo que use ferramentas.':
    'When on, the model gets this list in every chat and can add or delete facts on its own, when you ask or when it finds it useful. Needs a model that uses tools.',
  'Fato': 'Fact',
  'Esquecer': 'Forget',
  'Nenhum fato guardado ainda.': 'No facts saved yet.',
  'Novo fato': 'New fact',
  'Esquecer todos os fatos?': 'Forget every fact?',
  'Esquecer tudo': 'Forget all',
  'Uma persona é um prompt de sistema com nome, opcionalmente ligado a um modelo. Com ferramentas, arquivos e sugestões próprias, vira um agente. Escolha a persona de cada conversa na barra superior.':
    'A persona is a named system prompt, optionally tied to a model. With its own tools, files and suggestions it becomes an agent. Choose each chat\'s persona in the top bar.',
  'Resumindo a conversa…': 'Summarizing the chat…',
  'Conversa resumida até aqui: as mensagens acima não são mais enviadas ao modelo.':
    'Chat summarized up to here: the messages above are no longer sent to the model.',
  'Baixar imagem': 'Download image',
  'Gerando imagem…': 'Generating image…',
  'Perguntar à parte': 'Ask on the side',
  'Proxy local': 'Local proxy',
  'Alguns provedores (como o OpenCode) não aceitam chamadas do navegador. Rode npm run proxy na pasta do TSRS e ligue o proxy no provedor; para outros endereços, inicie com --allow host.':
    'Some providers (such as OpenCode) do not accept calls from a browser. Run npm run proxy in the TSRS folder and switch the proxy on for the provider; for other addresses, start it with --allow host.',
  'Usar o proxy local': 'Use the local proxy',
  'Pergunta à parte': 'Side question',
  'As perguntas e respostas daqui não entram na conversa.':
    'Questions and answers here are not added to the chat.',
  'Pergunta': 'Question',
  'O que você quer saber sobre este trecho?':
    'What do you want to know about this passage?',
  'O que você quer saber sobre esta resposta?':
    'What do you want to know about this reply?',
  'Perguntar': 'Ask',
  'Não foi possível conectar ao proxy local em {url}. Inicie-o com npm run proxy.':
    'Could not connect to the local proxy at {url}. Start it with npm run proxy.',
  'O provedor não devolveu nenhuma imagem.': 'The provider returned no image.',

  // Knowledge bases, canvas, sync
  'Adicionar documentos': 'Add documents',
  'A pasta foi criada por uma versão mais nova do TSRS.':
    'The folder was created by a newer version of TSRS.',
  'A pasta tem um {file} que não é do TSRS.':
    'The folder has a {file} that is not from TSRS.',
  'Bases de conhecimento': 'Knowledge bases',
  'Canvas': 'Canvas',
  'Conhecimento': 'Knowledge',
  '{count} trechos': '{count} passages',
  'Crie bases de conhecimento na Biblioteca.': 'Create knowledge bases in the Library.',
  'Da base de conhecimento: {names}': 'From the knowledge base: {names}',
  'Descartar o canvas': 'Discard the canvas',
  'Descartar o canvas desta conversa?': 'Discard this chat\'s canvas?',
  'Desconectar': 'Disconnect',
  'Desfazer a última mudança': 'Undo the last change',
  'Documento': 'Document',
  'Documentos guardados neste navegador. Ligue uma base numa conversa (em Parâmetros) ou numa persona, e os trechos que mais combinam com cada pergunta vão junto com ela. O modelo também pode buscar de novo na base, com outras palavras.':
    'Documents kept in this browser. Turn a base on for a chat (in Parameters) or a persona, and the passages that best match each question go with it. The model can also search the base again, with other words.',
  'Escolher pasta': 'Choose folder',
  'Escreva aqui, ou peça ao modelo para escrever.':
    'Write here, or ask the model to write.',
  'Esta pasta é protegida por senha. Informe a senha da sincronização.':
    'This folder is password-protected. Enter the sync password.',
  'Esta pasta não usa senha. Apague a senha da sincronização ou escolha outra pasta.':
    'This folder has no password. Clear the sync password or choose another folder.',
  'Excluir a base': 'Delete the base',
  'Excluir a base "{name}" e os documentos dela?':
    'Delete the base "{name}" and its documents?',
  'Fechar o canvas': 'Close the canvas',
  'Lendo os arquivos…': 'Reading the files…',
  'Linguagem': 'Language',
  '"{name}" está vazio.': '"{name}" is empty.',
  '"{name}" não é PDF nem texto.': '"{name}" is neither a PDF nor text.',
  '"{name}" não tem texto que dê para ler (talvez seja só imagem).':
    '"{name}" has no readable text (it may be images only).',
  '"{name}" passa de 30 MB.': '"{name}" is over 30 MB.',
  'Nenhuma pasta escolhida.': 'No folder chosen.',
  'Nenhum documento ainda.': 'No documents yet.',
  'Nenhum trecho encontrado.': 'No passages found.',
  'Nome da base': 'Base name',
  'Nova base': 'New base',
  'O navegador precisa da sua permissão para usar a pasta. Clique em Sincronizar agora.':
    'The browser needs your permission to use the folder. Click Sync now.',
  'Os trechos que mais combinam com cada pergunta vão junto com ela.':
    'The passages that best match each question go with it.',
  'Pasta: {name}': 'Folder: {name}',
  'PDF, planilhas Excel, texto, Markdown, HTML, CSV, código…':
    'PDF, Excel spreadsheets, text, Markdown, HTML, CSV, code…',
  'Peça uma mudança (selecione um trecho para mudar só ele)':
    'Ask for a change (select a passage to change only that)',
  'Pedir': 'Ask',
  'Pedir uma mudança': 'Ask for a change',
  'Personas, prompts, memória e conhecimento.':
    'Personas, prompts, memory and knowledge.',
  'Remover': 'Remove',
  'Remover {name}': 'Remove {name}',
  'Senha da sincronização incorreta.': 'Wrong sync password.',
  'Senha da sincronização (opcional)': 'Sync password (optional)',
  '{sent} enviados, {received} recebidos, {removed} apagados.':
    '{sent} sent, {received} received, {removed} deleted.',
  'Sincronização': 'Sync',
  'Sincronizando…': 'Syncing…',
  'Sincronizar agora': 'Sync now',
  'Sobre este trecho do canvas:': 'About this passage of the canvas:',
  'Testar uma busca': 'Try a search',
  'Texto do canvas': 'Canvas text',
  'Título do canvas': 'Canvas title',
  'Última sincronização: {time}': 'Last sync: {time}',
  'Ver formatado': 'View formatted',
  // Search by meaning and the knowledge search tool
  '"{name}" não foi indexado por sentido: {error}': '"{name}" was not indexed by meaning: {error}',
  'A busca por sentido falhou ({error}); usei só a busca por palavras.':
    'Search by meaning failed ({error}); only words were searched.',
  'Busca na base': 'Knowledge search',
  'Indexado por sentido': 'Indexed by meaning',
  'Busca por sentido': 'Search by meaning',
  'Desligada': 'Off',
  'Modelo de embeddings': 'Embedding model',
  'Encontra também trechos que dizem a mesma coisa com outras palavras. O texto dos documentos vai uma vez ao provedor para virar vetores, e cada pergunta vai também. Custa pouco, mas não é grátis.':
    'Also finds passages that say the same thing in other words. The documents\' text goes to the provider once to become vectors, and so does each question. It costs little, but it is not free.',
  'Nenhum provedor de embeddings com chave. Configure a OpenAI, o Gemini, o OpenRouter ou a Mistral.':
    'No embedding provider has a key. Set up OpenAI, Gemini, OpenRouter or Mistral.',
  'Indexando…': 'Indexing…',
  'Indexar por sentido': 'Index by meaning',
  '1 documento ainda não foi indexado.': '1 document is not indexed yet.',
  '{count} documentos ainda não foram indexados.': '{count} documents are not indexed yet.',
  'O provedor não devolveu os vetores pedidos.': 'The provider did not return the requested vectors.',
  'Informe a chave de API deste provedor nas configurações.':
    'Enter this provider\'s API key in the settings.',
  'Informe o modelo de embeddings.': 'Enter the embedding model.',
  // Syncing through WebDAV or S3
  'WebDAV: {url}': 'WebDAV: {url}',
  'S3: {bucket}': 'S3: {bucket}',
  'Sincronize conversas, biblioteca e documentos entre dispositivos por uma pasta que um serviço como Dropbox, Google Drive, OneDrive ou Syncthing mantém igual em todos eles, por um servidor WebDAV (Nextcloud, um NAS…) ou por um bucket S3 seu. O TSRS não tem servidor: só lê e grava arquivos ali. As chaves de API e as configurações não vão junto.':
    'Sync chats, the library and documents between devices through a folder that a service such as Dropbox, Google Drive, OneDrive or Syncthing keeps the same on all of them, a WebDAV server (Nextcloud, a NAS…) or an S3 bucket of your own. TSRS has no server: it only reads and writes files there. API keys and settings do not go with them.',
  'Com senha, os arquivos ficam criptografados. Use a mesma senha em todos os dispositivos; ela é definida na primeira sincronização e não pode ser trocada depois (para trocar, use outro lugar).':
    'With a password, the files are encrypted. Use the same password on every device; it is set on the first sync and cannot be changed later (to change it, use another place).',
  'Sincronizar por': 'Sync through',
  'Pasta': 'Folder',
  'Este navegador não deixa sites gravarem numa pasta. Use o Chrome, o Edge ou outro navegador baseado no Chromium, ou sincronize por WebDAV ou S3.':
    'This browser does not let sites write to a folder. Use Chrome, Edge or another Chromium-based browser, or sync through WebDAV or S3.',
  'Endereço da pasta': 'Folder address',
  'Usuário': 'User',
  'Senha ou senha de app': 'Password or app password',
  'A pasta é criada se não existir. O servidor precisa aceitar chamadas deste endereço (CORS); o Nextcloud e muitos outros não aceitam, e então é preciso o proxy local.':
    'The folder is created if it does not exist. The server must accept calls from this address (CORS); Nextcloud and many others do not, and then the local proxy is needed.',
  'Endpoint (vazio para a AWS)': 'Endpoint (empty for AWS)',
  'Região': 'Region',
  'Bucket': 'Bucket',
  'Pasta no bucket': 'Folder in the bucket',
  'Access key': 'Access key',
  'Secret key': 'Secret key',
  'O bucket precisa aceitar chamadas deste endereço (CORS). Regras para copiar:':
    'The bucket must accept calls from this address (CORS). Rules to copy:',
  'Use uma chave que só acesse este bucket. No Cloudflare R2, a região é auto.':
    'Use a key that can reach only this bucket. On Cloudflare R2, the region is auto.',
  'Passar pelo proxy local': 'Go through the local proxy',
  'Inicie o proxy permitindo o servidor: npm run proxy -- --allow {host}':
    'Start the proxy allowing the server: npm run proxy -- --allow {host}',
  'Conectar': 'Connect',
  'Sincroniza ao abrir o app, alguns segundos depois de cada mudança e a cada dois minutos. Vale a mudança mais recente de cada conversa e de cada item da biblioteca.':
    'Syncs when the app opens, a few seconds after each change and every two minutes. The latest change of each chat and of each library item wins.',
  'Não foi possível conectar a {host}. O servidor precisa aceitar chamadas deste endereço (CORS), ou use o proxy local.':
    'Could not connect to {host}. The server must accept calls from this address (CORS), or use the local proxy.',
  'O servidor recusou o acesso ({status}). Confira o usuário e a senha ou as chaves.':
    'The server refused access ({status}). Check the user and password or the keys.',
  'Não foi possível criar a pasta no servidor': 'Could not create the folder on the server',
  'Não foi possível listar a pasta no servidor': 'Could not list the folder on the server',
  'Não foi possível listar o bucket': 'Could not list the bucket',
  // Temporary chats
  'Conversa temporária': 'Temporary chat',
  'Temporária': 'Temporary',
  'Nova conversa temporária': 'New temporary chat',
  'Conversa temporária: não fica no histórico, não é sincronizada nem usa a memória. Some quando você sair dela.':
    'Temporary chat: it is not kept in the history, synced or given memory. It is gone once you leave it.',
  // Usage details
  'Tocar um som quando a resposta terminar': 'Play a sound when a reply is done',
  '{keys} deixou de abrir "{action}".': '{keys} no longer opens "{action}".',
  'Clique num atalho e pressione as teclas novas, com Ctrl, ⌘ ou Alt. Backspace tira o atalho; Esc cancela.':
    'Click a shortcut and press the new keys, with Ctrl, ⌘ or Alt. Backspace removes the shortcut; Esc cancels.',
  'Atalho de {action}': 'Shortcut for {action}',
  'Pressione as teclas…': 'Press the keys…',
  'Voltar aos atalhos padrão': 'Restore the default shortcuts',
  'Nenhum': 'None',
  // Tags, archive and bulk actions
  'Excluir {count} conversas?': 'Delete {count} chats?',
  'Selecionar "{title}"': 'Select "{title}"',
  'Etiquetas, separadas por vírgula:': 'Tags, separated by commas:',
  'Arquivada': 'Archived',
  'Etiquetas': 'Tags',
  'Desarquivar': 'Unarchive',
  'Arquivar': 'Archive',
  'Selecionar conversas': 'Select chats',
  'Filtrar por etiqueta': 'Filter by tag',
  '1 selecionada': '1 selected',
  '{count} selecionadas': '{count} selected',
  'Cancelar a seleção': 'Cancel the selection',
  'Etiqueta para acrescentar:': 'Tag to add:',
  'Mover': 'Move',
  'Etiquetar': 'Tag',
  '#{tag} · {count}': '#{tag} · {count}',
  'Arquivadas ({count})': 'Archived ({count})',
  // Spreadsheets
  'O arquivo não é uma planilha .xlsx válida.': 'The file is not a valid .xlsx spreadsheet.',
  '"{name}" não tem nenhuma célula preenchida.': '"{name}" has no filled-in cells.',
  '"{name}" é uma planilha num formato que o TSRS não lê. Salve como .xlsx ou CSV.':
    '"{name}" is a spreadsheet in a format TSRS cannot read. Save it as .xlsx or CSV.',
  // Starter library
  'Adicionar as personas prontas ({count})': 'Add the starter personas ({count})',
  'Adicionar os prompts prontos ({count})': 'Add the starter prompts ({count})',
  // Media services
  'Vídeo': 'Video',
  'Gerar um vídeo com a próxima mensagem': 'Generate a video from the next message',
  'Áudio': 'Audio',
  'Gerar áudio com a próxima mensagem': 'Generate audio from the next message',
  'Descreva o vídeo que você quer gerar…': 'Describe the video you want…',
  'Escreva o texto a narrar, ou descreva o som ou a música…':
    'Write the text to narrate, or describe the sound or the music…',
  '{count} vozes carregadas.': '{count} voices loaded.',
  'Criar chave': 'Create a key',
  'Chave de {name}': '{name} key',
  'id:segredo': 'id:secret',
  'Escreva o id e o segredo da chave separados por dois-pontos. A API da Higgsfield não aceita chamadas do navegador: ela só funciona com o proxy local rodando (npm run proxy).':
    'Write the key\'s id and secret separated by a colon. Higgsfield\'s API refuses calls from browsers: it only works with the local proxy running (npm run proxy).',
  'Carregar vozes': 'Load voices',
  'Modelo de {kind}': '{kind} model',
  'ex.: {example}': 'e.g. {example}',
  'Efeitos sonoros': 'Sound effects',
  'Música': 'Music',
  'Este serviço não tem modelo padrão para isso: informe um.':
    'This service has no default model for this: enter one.',
  'Ver vozes': 'See voices',
  'Ver modelos de {name}': 'See {name} models',
  'Opções do modelo (JSON)': 'Model options (JSON)',
  'Opções do modelo de {kind}': '{kind} model options',
  'Não é um objeto JSON válido.': 'Not a valid JSON object.',
  'Vão junto com o pedido, para parâmetros que só alguns modelos aceitam (duração, proporção, resolução…). Cada modelo lista os seus na página dele.':
    'Sent with the request, for parameters only some models take (duration, aspect ratio, resolution…). Each model lists its own on its page.',
  'Serviços que geram imagem, vídeo e áudio. Os botões Imagem, Vídeo e Áudio, ao lado de Prompts, transformam a próxima mensagem num pedido; o arquivo gerado fica na conversa. As chaves ficam neste navegador, como as dos provedores, e cada serviço cobra pelo que gerar.':
    'Services that generate images, video and audio. The Image, Video and Audio buttons, next to Prompts, turn the next message into a request; the generated file stays in the chat. Keys stay in this browser, like the providers\' keys, and each service charges for what it generates.',
  'Chaves': 'Keys',
  'Quem gera cada tipo': 'Who generates each kind',
  'No automático, usa o primeiro serviço com chave que tenha modelo padrão: para imagem, a OpenAI ou o Gemini antes dos serviços de mídia. Na ElevenLabs, o modelo é o id de uma voz, sound-effects ou music.':
    'On automatic, the first service with a key and a default model is used: for images, OpenAI or Gemini before the media services. On ElevenLabs, the model is a voice id, sound-effects or music.',
  'O arquivo não pôde ser baixado para o app; fica no link do serviço, que pode expirar.':
    'The file could not be downloaded into the app; it stays at the service\'s link, which may expire.',
  'Gerando vídeo…': 'Generating video…',
  'Gerando áudio…': 'Generating audio…',
  'Mídia': 'Media',
  'Informe a chave de {name} em Configurações → Mídia.':
    'Enter the {name} key in Settings → Media.',
  'Informe o modelo em Configurações → Mídia.': 'Enter the model in Settings → Media.',
  'Configure uma chave da OpenAI, do Gemini ou de um serviço de mídia para gerar imagens.':
    'Set up an OpenAI, Gemini or media service key to generate images.',
  'Configure a chave do fal.ai, do Replicate ou da WaveSpeedAI, ou escolha o serviço e o modelo de vídeo em Configurações → Mídia.':
    'Set up a fal.ai, Replicate or WaveSpeedAI key, or choose the video service and model in Settings → Media.',
  'Configure a chave da ElevenLabs, do fal.ai ou do Replicate, ou escolha o serviço de áudio em Configurações → Mídia.':
    'Set up an ElevenLabs, fal.ai or Replicate key, or choose the audio service in Settings → Media.',
  'As opções do modelo não são um objeto JSON válido.':
    'The model options are not a valid JSON object.',
  'Não foi possível conectar a {name}.': 'Could not connect to {name}.',
  '{name} recusou a chave ({status}).': '{name} refused the key ({status}).',
  '{name} demorou demais para responder.': '{name} took too long to answer.',
  '{name} só funciona pelo proxy local. Informe o endereço dele em Configurações → Provedores.':
    '{name} only works through the local proxy. Enter its address in Settings → Providers.',
  '{name} não devolveu nenhum arquivo.': '{name} returned no file.',
  'o conteúdo foi barrado pela moderação': 'the content was blocked by moderation',
  'na fila: {position}': 'in queue: {position}',
  'gerando': 'generating',
}
