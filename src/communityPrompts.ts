import type { Language } from './i18n'
import type { SavedPrompt } from './types'

// The community's prompts: a gallery to add from, by category, in both
// languages. Anyone can add one with a pull request (see CONTRIBUTING.md):
// a short title, a text with {{fields}} for what changes each time, and
// optional steps that run as a chain ({{resposta}} brings the previous reply).
// Ids are fixed, so a prompt added twice or synced stays one.

export const COMMUNITY_CATEGORIES = ['escrita', 'trabalho', 'estudo', 'programacao', 'marketing', 'dados', 'criacao', 'dia-a-dia'] as const
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number]

interface Entry {
  id: string
  category: CommunityCategory
  pt: { title: string; text: string; steps?: string[] }
  en: { title: string; text: string; steps?: string[] }
}

const P = (
  id: string,
  category: CommunityCategory,
  pt: Entry['pt'],
  en: Entry['en'],
): Entry => ({ id: `community-${id}`, category, pt, en })

const ENTRIES: Entry[] = [
  // Escrita
  P('rewrite-tone', 'escrita', {
    title: 'Reescrever em outro tom',
    text: 'Reescreva o texto abaixo num tom {{tom}}, mantendo o sentido e o tamanho parecido:\n\n{{texto}}',
  }, {
    title: 'Rewrite in another tone',
    text: 'Rewrite the text below in a {{tone}} tone, keeping the meaning and a similar length:\n\n{{text}}',
  }),
  P('shorten', 'escrita', {
    title: 'Encurtar sem perder o essencial',
    text: 'Corte o texto abaixo para no máximo {{palavras}} palavras, sem perder nenhuma informação importante:\n\n{{texto}}',
  }, {
    title: 'Shorten without losing the point',
    text: 'Cut the text below to at most {{words}} words, without losing any important information:\n\n{{text}}',
  }),
  P('simple-language', 'escrita', {
    title: 'Linguagem simples',
    text: 'Reescreva o texto abaixo em linguagem simples, para alguém sem conhecimento técnico, com frases curtas e sem jargão:\n\n{{texto}}',
  }, {
    title: 'Plain language',
    text: 'Rewrite the text below in plain language for someone with no technical background: short sentences, no jargon:\n\n{{text}}',
  }),
  P('titles', 'escrita', {
    title: 'Títulos para um texto',
    text: 'Sugira 10 títulos para o texto abaixo, variados (informativo, curioso, com número, pergunta). Marque os 3 melhores e diga por quê.\n\n{{texto}}',
  }, {
    title: 'Headlines for a text',
    text: 'Suggest 10 headlines for the text below, varied (informative, curious, with a number, a question). Mark the best 3 and say why.\n\n{{text}}',
  }),
  P('feedback-text', 'escrita', {
    title: 'Crítica honesta de um texto',
    text: 'Leia o texto abaixo como um editor exigente. Aponte o que não funciona (clareza, estrutura, argumentos, ritmo), com trechos e sugestões. Não reescreva tudo; diga o que eu devo mudar.\n\n{{texto}}',
  }, {
    title: 'Honest critique of a text',
    text: "Read the text below as a demanding editor. Point out what doesn't work (clarity, structure, arguments, rhythm), quoting passages with suggestions. Don't rewrite it all; tell me what to change.\n\n{{text}}",
  }),
  P('outline', 'escrita', {
    title: 'Estrutura de um artigo',
    text: 'Monte a estrutura de um artigo sobre {{tema}} para {{público}}: título, introdução em uma frase, 5 a 7 seções com os pontos de cada uma e a conclusão.',
    steps: ['Agora escreva o artigo completo seguindo esta estrutura, com cerca de {{palavras}} palavras:\n\n{{resposta}}'],
  }, {
    title: 'Article outline',
    text: 'Outline an article about {{topic}} for {{audience}}: title, a one-sentence introduction, 5 to 7 sections with their points, and the conclusion.',
    steps: ['Now write the full article following this outline, about {{words}} words long:\n\n{{resposta}}'],
  }),
  P('proofread-list', 'escrita', {
    title: 'Revisão com lista de erros',
    text: 'Revise o texto abaixo e devolva uma tabela com: trecho original, correção e motivo. Só erros reais de ortografia, gramática ou pontuação.\n\n{{texto}}',
  }, {
    title: 'Proofread as a list',
    text: 'Proofread the text below and return a table with: original passage, correction and reason. Only real spelling, grammar or punctuation mistakes.\n\n{{text}}',
  }),

  // Trabalho
  P('email-ask', 'trabalho', {
    title: 'E-mail pedindo algo',
    text: 'Escreva um e-mail curto e educado para {{destinatário}} pedindo {{pedido}}. Contexto: {{contexto}}. Termine com um próximo passo claro.',
  }, {
    title: 'Email asking for something',
    text: 'Write a short, polite email to {{recipient}} asking for {{request}}. Context: {{context}}. End with a clear next step.',
  }),
  P('email-no', 'trabalho', {
    title: 'Dizer não com educação',
    text: 'Escreva uma resposta recusando {{pedido}} de forma educada e firme, sem desculpas demais, e oferecendo {{alternativa}} se fizer sentido.',
  }, {
    title: 'Say no politely',
    text: 'Write a reply turning down {{request}} politely and firmly, without over-apologizing, and offering {{alternative}} if it makes sense.',
  }),
  P('meeting-agenda', 'trabalho', {
    title: 'Pauta de reunião',
    text: 'Monte a pauta de uma reunião de {{duração}} sobre {{assunto}} com {{participantes}}: objetivo, tópicos com tempo de cada um e o que deve sair decidido.',
  }, {
    title: 'Meeting agenda',
    text: 'Draft the agenda for a {{length}} meeting about {{subject}} with {{attendees}}: goal, topics with time for each, and what must be decided.',
  }),
  P('status-report', 'trabalho', {
    title: 'Relatório de status',
    text: 'Transforme estas anotações num relatório de status semanal com: feito, em andamento, bloqueios (com o que preciso) e próximos passos.\n\n{{anotações}}',
  }, {
    title: 'Status report',
    text: 'Turn these notes into a weekly status report with: done, in progress, blockers (with what I need) and next steps.\n\n{{notes}}',
  }),
  P('proposal', 'trabalho', {
    title: 'Proposta comercial',
    text: 'Escreva uma proposta comercial de {{serviço}} para {{cliente}}: o problema dele, a solução, o que está incluído, prazo, investimento ({{valor}}) e próximos passos. Tom profissional e direto.',
  }, {
    title: 'Business proposal',
    text: "Write a business proposal for {{service}} for {{client}}: their problem, the solution, what's included, timeline, price ({{price}}) and next steps. Professional and direct tone.",
  }),
  P('job-post', 'trabalho', {
    title: 'Anúncio de vaga',
    text: 'Escreva o anúncio de uma vaga de {{cargo}} em {{empresa}}: sobre a empresa, o que a pessoa vai fazer, requisitos, diferenciais, benefícios e como se candidatar. Linguagem inclusiva.',
  }, {
    title: 'Job posting',
    text: 'Write a job posting for a {{role}} at {{company}}: about the company, what the person will do, requirements, nice-to-haves, benefits and how to apply. Inclusive language.',
  }),
  P('decision', 'trabalho', {
    title: 'Ajudar a decidir',
    text: 'Preciso decidir: {{decisão}}. As opções são {{opções}}. Faça as perguntas que faltam, depois compare as opções por critérios que importam e recomende uma, dizendo o que me faria mudar de ideia.',
  }, {
    title: 'Help me decide',
    text: 'I need to decide: {{decision}}. The options are {{options}}. Ask the questions that are missing, then compare the options on the criteria that matter and recommend one, saying what would change your mind.',
  }),
  P('feedback-person', 'trabalho', {
    title: 'Feedback para alguém da equipe',
    text: 'Ajude a preparar um feedback para {{pessoa}} sobre {{situação}}: o que observei, o impacto, o que espero dali em diante. Específico, respeitoso e sem rodeios.',
  }, {
    title: 'Feedback for a teammate',
    text: 'Help me prepare feedback for {{person}} about {{situation}}: what I observed, the impact, what I expect from now on. Specific, respectful and straightforward.',
  }),

  // Estudo
  P('explain-levels', 'estudo', {
    title: 'Explicar em três níveis',
    text: 'Explique {{assunto}} em três níveis: para uma criança de 10 anos, para um estudante e para um especialista.',
  }, {
    title: 'Explain at three levels',
    text: 'Explain {{subject}} at three levels: to a 10-year-old, to a student and to an expert.',
  }),
  P('quiz', 'estudo', {
    title: 'Testar o que aprendi',
    text: 'Faça {{quantas}} perguntas de múltipla escolha sobre {{assunto}}, uma por vez. Espere a minha resposta, diga se acertei e explique antes de passar para a próxima.',
  }, {
    title: 'Quiz me',
    text: 'Ask me {{how many}} multiple-choice questions about {{subject}}, one at a time. Wait for my answer, tell me if I got it right and explain before moving on.',
  }),
  P('flashcards', 'estudo', {
    title: 'Cartões de estudo',
    text: 'Transforme o conteúdo abaixo em cartões de estudo (pergunta e resposta curtas), numa tabela, cobrindo os pontos principais:\n\n{{conteúdo}}',
  }, {
    title: 'Flashcards',
    text: 'Turn the content below into flashcards (short question and answer), as a table, covering the main points:\n\n{{content}}',
  }),
  P('summary-book', 'estudo', {
    title: 'Resumo de livro ou capítulo',
    text: 'Resuma {{livro ou capítulo}}: a ideia central, os 5 argumentos principais, exemplos marcantes e o que dá para aplicar na prática.',
  }, {
    title: 'Book or chapter summary',
    text: 'Summarize {{book or chapter}}: the central idea, the 5 main arguments, memorable examples and what can be applied in practice.',
  }),
  P('socratic', 'estudo', {
    title: 'Professor socrático',
    text: 'Quero entender {{assunto}}. Não me dê a resposta: faça perguntas que me levem a chegar nela, uma por vez, e me corrija quando eu errar.',
  }, {
    title: 'Socratic tutor',
    text: "I want to understand {{subject}}. Don't give me the answer: ask questions that lead me to it, one at a time, and correct me when I'm wrong.",
  }),
  P('language-practice', 'estudo', {
    title: 'Praticar um idioma',
    text: 'Vamos conversar em {{idioma}} sobre {{tema}}, no nível {{nível}}. Responda sempre em {{idioma}} e, no fim de cada resposta, corrija os erros da minha última mensagem em português.',
  }, {
    title: 'Practice a language',
    text: "Let's talk in {{language}} about {{topic}}, at {{level}} level. Always answer in {{language}} and, at the end of each reply, correct the mistakes in my last message in English.",
  }),

  // Programação
  P('explain-error', 'programacao', {
    title: 'Explicar um erro',
    text: 'Explique este erro, a causa mais provável e como corrigir. Se faltar contexto, diga o que preciso mostrar.\n\n{{erro}}',
  }, {
    title: 'Explain an error',
    text: "Explain this error, its most likely cause and how to fix it. If context is missing, tell me what to show.\n\n{{error}}",
  }),
  P('write-tests', 'programacao', {
    title: 'Escrever testes',
    text: 'Escreva testes para o código abaixo com {{framework}}, cobrindo o caso normal, os limites e os erros. Explique em uma linha o que cada teste garante.\n\n{{código}}',
  }, {
    title: 'Write tests',
    text: 'Write tests for the code below with {{framework}}, covering the normal case, the edges and the errors. Explain in one line what each test ensures.\n\n{{code}}',
  }),
  P('refactor', 'programacao', {
    title: 'Refatorar com cuidado',
    text: 'Refatore o código abaixo para ficar mais legível, sem mudar o comportamento. Mostre o código novo e liste as mudanças e o motivo de cada uma.\n\n{{código}}',
  }, {
    title: 'Careful refactor',
    text: 'Refactor the code below to make it more readable, without changing its behavior. Show the new code and list the changes and why.\n\n{{code}}',
  }),
  P('regex', 'programacao', {
    title: 'Expressão regular',
    text: 'Escreva uma expressão regular ({{linguagem}}) que encontre {{o que encontrar}}. Explique cada parte e dê exemplos que casam e que não casam.',
  }, {
    title: 'Regular expression',
    text: "Write a regular expression ({{language}}) that matches {{what to match}}. Explain each part and give examples that match and that don't.",
  }),
  P('sql', 'programacao', {
    title: 'Consulta SQL',
    text: 'Com estas tabelas:\n{{tabelas}}\n\nEscreva uma consulta SQL ({{banco}}) que {{o que quero}}. Explique a consulta e aponte índices que ajudariam.',
  }, {
    title: 'SQL query',
    text: 'With these tables:\n{{tables}}\n\nWrite a SQL query ({{database}}) that {{what I want}}. Explain the query and point out indexes that would help.',
  }),
  P('commit-message', 'programacao', {
    title: 'Mensagem de commit',
    text: 'Escreva a mensagem de commit para esta mudança: um título no imperativo com até 72 caracteres e um parágrafo dizendo o porquê.\n\n{{diff ou descrição}}',
  }, {
    title: 'Commit message',
    text: 'Write the commit message for this change: an imperative title of up to 72 characters and a paragraph saying why.\n\n{{diff or description}}',
  }),
  P('code-plan', 'programacao', {
    title: 'Planejar antes de codar',
    text: 'Quero implementar {{funcionalidade}} em {{projeto/stack}}. Antes de qualquer código, faça um plano: arquivos que mudam, passos, riscos e como testar.',
    steps: ['Agora implemente o primeiro passo do plano, completo:\n\n{{resposta}}'],
  }, {
    title: 'Plan before coding',
    text: 'I want to implement {{feature}} in {{project/stack}}. Before any code, make a plan: files that change, steps, risks and how to test.',
    steps: ['Now implement the first step of the plan, in full:\n\n{{resposta}}'],
  }),

  // Marketing e redes
  P('social-post', 'marketing', {
    title: 'Post para redes sociais',
    text: 'Escreva um post sobre {{assunto}} para {{rede}}, para {{público}}, com gancho na primeira linha e uma chamada para ação no fim.',
    steps: ['Adapte este post para Instagram, LinkedIn e X, respeitando o estilo e o tamanho de cada rede:\n\n{{resposta}}'],
  }, {
    title: 'Social media post',
    text: 'Write a post about {{subject}} for {{network}}, for {{audience}}, with a hook in the first line and a call to action at the end.',
    steps: ["Adapt this post for Instagram, LinkedIn and X, following each network's style and length:\n\n{{resposta}}"],
  }),
  P('content-calendar', 'marketing', {
    title: 'Calendário de conteúdo',
    text: 'Monte um calendário de {{semanas}} semanas de conteúdo para {{marca}} em {{redes}}: data, formato, tema, gancho e objetivo de cada post.',
  }, {
    title: 'Content calendar',
    text: 'Plan a {{weeks}}-week content calendar for {{brand}} on {{networks}}: date, format, topic, hook and goal of each post.',
  }),
  P('product-description', 'marketing', {
    title: 'Descrição de produto',
    text: 'Escreva a descrição de {{produto}} para uma loja online: benefícios antes das características, para {{cliente}}, com uma lista de detalhes técnicos no fim.',
  }, {
    title: 'Product description',
    text: 'Write the description of {{product}} for an online store: benefits before features, for {{customer}}, with a list of technical details at the end.',
  }),
  P('ad-copy', 'marketing', {
    title: 'Textos de anúncio',
    text: 'Escreva 5 variações de anúncio para {{produto}} no {{plataforma}}: título curto, texto e chamada para ação. Cada variação com um ângulo diferente (dor, desejo, prova, urgência, curiosidade).',
  }, {
    title: 'Ad copy',
    text: 'Write 5 ad variations for {{product}} on {{platform}}: short headline, body and call to action. Each with a different angle (pain, desire, proof, urgency, curiosity).',
  }),
  P('newsletter', 'marketing', {
    title: 'Newsletter',
    text: 'Escreva uma newsletter de {{marca}} sobre {{assuntos}}: assunto do e-mail, abertura pessoal, as novidades em blocos curtos e um fechamento com chamada para ação.',
  }, {
    title: 'Newsletter',
    text: "Write {{brand}}'s newsletter about {{topics}}: subject line, a personal opening, the news in short blocks and a closing with a call to action.",
  }),
  P('persona-customer', 'marketing', {
    title: 'Perfil de cliente',
    text: 'Crie o perfil do cliente ideal de {{negócio}}: quem é, rotina, problemas, objeções, onde busca informação e que palavras usa para descrever o que precisa.',
  }, {
    title: 'Customer profile',
    text: "Create the ideal customer profile for {{business}}: who they are, routine, problems, objections, where they look for information and the words they use to describe what they need.",
  }),

  // Dados
  P('analyze-table', 'dados', {
    title: 'Analisar uma tabela',
    text: 'Analise a tabela anexada (ou abaixo): o que ela mostra, tendências, números fora do padrão e 3 perguntas que valeria investigar.\n\n{{tabela}}',
  }, {
    title: 'Analyze a table',
    text: 'Analyze the attached table (or the one below): what it shows, trends, outliers and 3 questions worth investigating.\n\n{{table}}',
  }),
  P('formula', 'dados', {
    title: 'Fórmula de planilha',
    text: 'Escreva uma fórmula de {{Excel ou Google Planilhas}} que {{o que calcular}}. Os dados estão em {{colunas}}. Explique a fórmula parte por parte.',
  }, {
    title: 'Spreadsheet formula',
    text: 'Write a {{Excel or Google Sheets}} formula that {{what to calculate}}. The data is in {{columns}}. Explain the formula piece by piece.',
  }),
  P('chart-choice', 'dados', {
    title: 'Que gráfico usar',
    text: 'Quero mostrar {{o que mostrar}} para {{público}}. Os dados são: {{dados}}. Que gráfico usar, por quê, e como deixá-lo claro? Faça o gráfico em HTML para eu ver no preview.',
  }, {
    title: 'Which chart to use',
    text: 'I want to show {{what to show}} to {{audience}}. The data is: {{data}}. Which chart should I use, why, and how do I make it clear? Make the chart in HTML so I can see it in the preview.',
  }),
  P('survey', 'dados', {
    title: 'Questionário',
    text: 'Monte um questionário para descobrir {{objetivo}} com {{público}}: 8 a 12 perguntas, sem induzir respostas, misturando múltipla escolha, escala e abertas.',
  }, {
    title: 'Survey',
    text: 'Build a survey to find out {{goal}} from {{audience}}: 8 to 12 questions, not leading, mixing multiple choice, scales and open questions.',
  }),
  P('clean-data', 'dados', {
    title: 'Limpar dados',
    text: 'Os dados abaixo estão bagunçados. Padronize {{o que padronizar}}, remova duplicados e devolva em CSV, dizendo o que mudou.\n\n{{dados}}',
  }, {
    title: 'Clean up data',
    text: 'The data below is messy. Standardize {{what to standardize}}, remove duplicates and return it as CSV, saying what changed.\n\n{{data}}',
  }),

  // Criação (vídeo, imagem, motion)
  P('short-video', 'criacao', {
    title: 'Vídeo curto narrado',
    text: 'Faça um vídeo curto de {{segundos}} segundos sobre {{assunto}}, no formato {{9:16 ou 16:9}}, para {{público}}. Narração em frases curtas e cenas com buscas visuais concretas.',
  }, {
    title: 'Narrated short video',
    text: 'Make a {{seconds}}-second short video about {{subject}}, in {{9:16 or 16:9}} format, for {{audience}}. Narration in short sentences and scenes with concrete visual searches.',
  }),
  P('video-script', 'criacao', {
    title: 'Roteiro de vídeo',
    text: 'Escreva o roteiro de um vídeo de {{minutos}} minutos sobre {{assunto}} para {{canal}}: gancho nos primeiros 5 segundos, blocos com o que aparece na tela e o que é dito, e o fechamento.',
  }, {
    title: 'Video script',
    text: 'Write the script of a {{minutes}}-minute video about {{subject}} for {{channel}}: a hook in the first 5 seconds, blocks with what is on screen and what is said, and the closing.',
  }),
  P('image-prompt', 'criacao', {
    title: 'Prompt de imagem',
    text: 'Transforme esta ideia num prompt detalhado para gerar uma imagem: {{ideia}}. Inclua estilo, composição, luz, cores e enquadramento. Depois gere a imagem.',
  }, {
    title: 'Image prompt',
    text: 'Turn this idea into a detailed image prompt: {{idea}}. Include style, composition, lighting, colors and framing. Then generate the image.',
  }),
  P('motion-title', 'criacao', {
    title: 'Abertura animada',
    text: 'Faça uma animação motion de {{segundos}} segundos com o título "{{título}}", no estilo {{estilo}}, com as cores {{cores}}, para eu exportar em MP4.',
  }, {
    title: 'Animated opener',
    text: 'Make a {{seconds}}-second motion animation with the title "{{title}}", in a {{style}} style, with the colors {{colors}}, for me to export as MP4.',
  }),
  P('landing-page', 'criacao', {
    title: 'Página de apresentação',
    text: 'Crie uma página HTML de apresentação para {{produto ou evento}}: topo com chamada, benefícios, como funciona, depoimento de exemplo e botão de ação. Visual {{estilo}}, responsiva.',
  }, {
    title: 'Landing page',
    text: 'Create an HTML landing page for {{product or event}}: hero with a call to action, benefits, how it works, a sample testimonial and an action button. {{style}} look, responsive.',
  }),
  P('podcast', 'criacao', {
    title: 'Pauta de podcast',
    text: 'Monte a pauta de um episódio de podcast sobre {{tema}} com {{convidado}}: abertura, 8 perguntas em ordem que conte uma história e um fechamento.',
  }, {
    title: 'Podcast outline',
    text: 'Plan a podcast episode about {{topic}} with {{guest}}: opening, 8 questions in an order that tells a story, and a closing.',
  }),

  // Dia a dia
  P('trip-plan', 'dia-a-dia', {
    title: 'Roteiro de viagem',
    text: 'Monte um roteiro de {{dias}} dias em {{lugar}} para {{quem vai}}, com orçamento {{orçamento}}: dia a dia, deslocamentos e uma dica de comida por dia.',
  }, {
    title: 'Trip itinerary',
    text: 'Plan a {{days}}-day itinerary in {{place}} for {{travelers}}, on a {{budget}} budget: day by day, getting around and a food tip for each day.',
  }),
  P('meal-plan', 'dia-a-dia', {
    title: 'Cardápio da semana',
    text: 'Monte um cardápio de {{refeições}} para a semana, para {{pessoas}} pessoas, {{restrições}}, com a lista de compras agrupada por seção do mercado.',
  }, {
    title: 'Weekly meal plan',
    text: 'Plan {{meals}} for the week, for {{people}} people, {{restrictions}}, with a shopping list grouped by store section.',
  }),
  P('budget', 'dia-a-dia', {
    title: 'Organizar o orçamento',
    text: 'Minha renda é {{renda}} e meus gastos são: {{gastos}}. Organize por categoria, mostre onde dá para cortar e proponha uma divisão do mês.',
  }, {
    title: 'Sort out a budget',
    text: 'My income is {{income}} and my expenses are: {{expenses}}. Group them by category, show where I can cut and propose a monthly split.',
  }),
  P('hard-conversation', 'dia-a-dia', {
    title: 'Preparar uma conversa difícil',
    text: 'Preciso conversar com {{pessoa}} sobre {{assunto}}. Ajude a preparar: como começar, o que dizer, reações prováveis e como responder a cada uma, com calma.',
  }, {
    title: 'Prepare a hard conversation',
    text: 'I need to talk to {{person}} about {{subject}}. Help me prepare: how to start, what to say, likely reactions and how to respond to each, calmly.',
  }),
  P('habit', 'dia-a-dia', {
    title: 'Criar um hábito',
    text: 'Quero criar o hábito de {{hábito}}. Monte um plano de 4 semanas começando pequeno, com gatilho, recompensa e o que fazer quando eu falhar um dia.',
  }, {
    title: 'Build a habit',
    text: 'I want to build the habit of {{habit}}. Make a 4-week plan starting small, with a trigger, a reward and what to do when I miss a day.',
  }),
  P('gift-ideas', 'dia-a-dia', {
    title: 'Ideias de presente',
    text: 'Sugira 10 ideias de presente para {{pessoa}}, que gosta de {{gostos}}, até {{valor}}. Varie entre objetos, experiências e algo feito à mão.',
  }, {
    title: 'Gift ideas',
    text: 'Suggest 10 gift ideas for {{person}}, who likes {{interests}}, up to {{price}}. Mix objects, experiences and something handmade.',
  }),
  P('explain-document', 'dia-a-dia', {
    title: 'Entender um documento',
    text: 'Explique o documento anexado (contrato, conta, laudo…) em linguagem simples: o que ele diz, prazos e valores, o que me obriga e o que eu deveria perguntar antes de assinar ou pagar.',
  }, {
    title: 'Understand a document',
    text: 'Explain the attached document (contract, bill, report…) in plain language: what it says, deadlines and amounts, what it commits me to and what I should ask before signing or paying.',
  }),
]

export interface CommunityPrompt extends SavedPrompt {
  category: CommunityCategory
}

export function communityPrompts(language: Language): CommunityPrompt[] {
  return ENTRIES.map(({ id, category, ...text }) => ({ id, category, ...text[language] }))
}

// Words that find a prompt, accents ignored.
export function matchesQuery(prompt: SavedPrompt, query: string): boolean {
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const words = fold(query).split(/\s+/).filter(Boolean)
  const text = fold(`${prompt.title} ${prompt.text}`)
  return words.every((w) => text.includes(w))
}
