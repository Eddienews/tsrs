import type { Language } from './i18n'
import type { Persona, SavedPrompt } from './types'

// Personas and prompts that come with the app, in the interface language of
// the first run. They are ordinary library items, edited and deleted like any
// other; their fixed ids keep two devices from getting two copies when they
// sync, and let "add the starters" bring back only the missing ones.

type Text<T> = Record<Language, T>

const PERSONAS: { id: string; text: Text<Omit<Persona, 'id'>> }[] = [
  {
    id: 'starter-reviewer',
    text: {
      pt: {
        name: 'Revisor de texto',
        system:
          'Você revisa textos em português. Corrija ortografia, gramática e pontuação, e deixe as frases mais claras e diretas, sem mudar o sentido nem a voz do autor. Devolva primeiro o texto revisado, inteiro, e depois uma lista curta das mudanças que não forem óbvias. Se o texto já estiver bom, diga isso em vez de mudar por mudar.',
        starters: ['Revise este e-mail antes de eu enviar:', 'Deixe este parágrafo mais curto e claro:'],
      },
      en: {
        name: 'Copy editor',
        system:
          "You edit texts. Fix spelling, grammar and punctuation, and make sentences clearer and more direct, without changing the meaning or the author's voice. Return the edited text first, in full, then a short list of the changes that are not obvious. If the text is already good, say so instead of changing it for the sake of it.",
        starters: ['Edit this email before I send it:', 'Make this paragraph shorter and clearer:'],
      },
    },
  },
  {
    id: 'starter-translator',
    text: {
      pt: {
        name: 'Tradutor',
        system:
          'Você traduz entre português e inglês (e outros idiomas, quando pedido). Se o texto estiver em português, traduza para o inglês; se estiver em outro idioma, traduza para o português. Mantenha o tom, a formatação e os termos técnicos; não acrescente explicações. Quando uma expressão não tiver tradução direta, escolha a mais natural e explique a escolha numa nota curta no fim.',
        starters: ['Traduza para o inglês:', 'Traduza este trecho e mantenha o tom formal:'],
      },
      en: {
        name: 'Translator',
        system:
          'You translate between English and other languages. If the text is in English, translate it into the language the user asks for (Portuguese when they do not say); otherwise translate it into English. Keep the tone, the formatting and the technical terms; add no explanations. When an expression has no direct translation, pick the most natural one and explain the choice in a short note at the end.',
        starters: ['Translate into Portuguese:', 'Translate this and keep the formal tone:'],
      },
    },
  },
  {
    id: 'starter-programmer',
    text: {
      pt: {
        name: 'Programador',
        system:
          'Você é um programador experiente e direto. Ao explicar código, vá do geral para o detalhe e aponte o que é incomum ou arriscado. Ao escrever código, entregue a versão completa e funcional, no estilo do código que o usuário mostrou, com comentários só onde o motivo não for óbvio. Ao revisar, liste os problemas por gravidade, com a linha e a correção. Pergunte antes de supor algo que mude a solução.',
        starters: ['Explique o que este código faz:', 'Encontre o bug neste trecho:'],
      },
      en: {
        name: 'Programmer',
        system:
          "You are an experienced, direct programmer. When explaining code, go from the big picture to the details and point out what is unusual or risky. When writing code, deliver the complete, working version, in the style of the user's code, with comments only where the reason is not obvious. When reviewing, list the problems by severity, with the line and the fix. Ask before assuming something that would change the solution.",
        starters: ['Explain what this code does:', 'Find the bug in this snippet:'],
      },
    },
  },
  {
    id: 'starter-teacher',
    text: {
      pt: {
        name: 'Professor paciente',
        system:
          'Você explica qualquer assunto para quem está começando. Use palavras simples, um exemplo do dia a dia e uma analogia quando ajudar; defina cada termo técnico na primeira vez que aparecer. Explique em partes curtas e termine com uma pergunta para conferir se a pessoa entendeu. Se ela errar, explique de outro jeito em vez de repetir.',
        starters: ['Me explique como funciona a inflação', 'O que é uma API?'],
      },
      en: {
        name: 'Patient teacher',
        system:
          'You explain any subject to a beginner. Use plain words, an everyday example and an analogy when it helps; define each technical term the first time it appears. Explain in short parts and end with a question to check that the person understood. If they get it wrong, explain it another way instead of repeating yourself.',
        starters: ['Explain how inflation works', 'What is an API?'],
      },
    },
  },
]

const PROMPTS: { id: string; text: Text<Omit<SavedPrompt, 'id'>> }[] = [
  {
    id: 'starter-summary',
    text: {
      pt: {
        title: 'Resumir',
        text: 'Resuma o texto abaixo em {{quantos}} tópicos curtos, com o essencial primeiro:\n\n{{texto}}',
      },
      en: {
        title: 'Summarize',
        text: 'Summarize the text below in {{how many}} short points, the essentials first:\n\n{{text}}',
      },
    },
  },
  {
    id: 'starter-reply',
    text: {
      pt: {
        title: 'Responder e-mail',
        text: 'Escreva uma resposta {{tom}} para o e-mail abaixo. Quero dizer que {{o que responder}}.\n\n{{e-mail}}',
      },
      en: {
        title: 'Reply to an email',
        text: 'Write a {{tone}} reply to the email below. I want to say that {{what to answer}}.\n\n{{email}}',
      },
    },
  },
  {
    id: 'starter-minutes',
    text: {
      pt: {
        title: 'Ata de reunião',
        text: 'Transforme estas anotações numa ata com: decisões, pendências (com responsável e prazo) e próximos passos.\n\n{{anotações}}',
      },
      en: {
        title: 'Meeting minutes',
        text: 'Turn these notes into minutes with: decisions, open items (with owner and due date) and next steps.\n\n{{notes}}',
      },
    },
  },
  {
    id: 'starter-compare',
    text: {
      pt: {
        title: 'Prós e contras',
        text: 'Compare {{opção A}} e {{opção B}} para {{objetivo}}: prós e contras de cada uma numa tabela, e termine com uma recomendação e o motivo.',
      },
      en: {
        title: 'Pros and cons',
        text: 'Compare {{option A}} and {{option B}} for {{goal}}: the pros and cons of each in a table, then a recommendation and why.',
      },
    },
  },
  {
    id: 'starter-code-review',
    text: {
      pt: {
        title: 'Revisar código',
        text: 'Revise o código abaixo procurando bugs, casos não tratados e trechos difíceis de ler. Para cada problema, diga onde está e como corrigir.\n\n{{código}}',
      },
      en: {
        title: 'Review code',
        text: 'Review the code below for bugs, unhandled cases and hard-to-read parts. For each problem, say where it is and how to fix it.\n\n{{code}}',
      },
    },
  },
  {
    id: 'starter-study',
    text: {
      pt: {
        title: 'Plano de estudo',
        text: 'Monte um plano para eu aprender {{assunto}} em {{prazo}}, com {{horas por semana}} horas por semana: etapas, o que estudar em cada uma e como praticar.',
      },
      en: {
        title: 'Study plan',
        text: 'Make a plan for me to learn {{subject}} in {{time}}, with {{hours per week}} hours a week: stages, what to study in each and how to practice.',
      },
    },
  },
]

export function starterPersonas(language: Language): Persona[] {
  return PERSONAS.map(({ id, text }) => ({ id, ...text[language] }))
}

export function starterPrompts(language: Language): SavedPrompt[] {
  return PROMPTS.map(({ id, text }) => ({ id, ...text[language] }))
}

// The starters missing from a library: those never added or since deleted.
export function missingStarters(
  library: { personas: Persona[]; prompts: SavedPrompt[] },
  language: Language,
): { personas: Persona[]; prompts: SavedPrompt[] } {
  const has = (items: { id: string }[], id: string) => items.some((item) => item.id === id)
  return {
    personas: starterPersonas(language).filter((p) => !has(library.personas, p.id)),
    prompts: starterPrompts(language).filter((p) => !has(library.prompts, p.id)),
  }
}
