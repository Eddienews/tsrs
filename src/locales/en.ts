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
  'Esta conversa já ocupa {percent}% do contexto do modelo. Comece uma nova conversa para evitar erros e reduzir o custo.':
    'This chat already fills {percent}% of the model context. Start a new chat to avoid errors and reduce the cost.',
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
  'Uma persona é um prompt de sistema com nome, opcionalmente ligado a um modelo. Escolha a persona de cada conversa na barra superior.':
    'A persona is a named system prompt, optionally tied to a model. Choose the persona for each chat in the top bar.',
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
  'Comparar com outro modelo': 'Compare with another model',
  'O modelo escolhido responde à mesma pergunta. As versões ficam lado a lado e o modelo da conversa não muda.':
    'The chosen model answers the same question. The versions are shown side by side and the chat model does not change.',
  Provedor: 'Provider',
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

  // Preview panel
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
  'Personas e prompts reutilizáveis.': 'Reusable personas and prompts.',
  'Use {{variável}} para campos preenchidos ao inserir o prompt.':
    'Use {{variable}} for fields filled in when inserting the prompt.',
  'Valem apenas para esta conversa.': 'Applied to this conversation only.',
}
