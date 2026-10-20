// Builds the promptfoo test cases from the prompts the app really sends (src/tune.ts, src/summary.ts), so an
// edit to a prompt is tested as it is, with no copy to keep in sync. Loads the TypeScript through Vite.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
const tune = await vite.ssrLoadModule('/src/tune.ts')
const summary = await vite.ssrLoadModule('/src/summary.ts')
await vite.close()

// Same parsing as jsonOf in src/tune.ts: the first fenced block (or the reply), from the first { to the last }.
const JSON_BLOCK = `\nconst m = /\`\`\`(?:json)?\\s*([\\s\\S]*?)\`\`\`/i.exec(output);\nconst text = m ? m[1] : output;\nconst data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));\n`

const system = 'Você é o assistente de suporte de uma loja online. Responda dúvidas sobre pedidos.'
const task = 'Um cliente pergunta: meu pedido 4471 não chegou e já passou o prazo. O que eu faço?'
const criteria = 'Pede o e-mail do pedido, explica o prazo de 7 dias úteis, oferece abrir uma reclamação, no máximo 5 frases.'
const good = 'Sinto muito pelo atraso. Pode me passar o e-mail usado no pedido 4471? O prazo é de 7 dias úteis; como já passou, abro agora uma reclamação para você e retorno em até 24 h.'
const bad = 'Pedidos às vezes atrasam. Aguarde mais um pouco.'

const conversation = [
  { role: 'user', content: 'Oi, sou a Marina, gerente do projeto Atlas. Temos orçamento de R$ 12.000 e prazo até 15 de novembro.' },
  { role: 'assistant', content: 'Entendido, Marina. Qual banco de dados vocês querem usar?' },
  { role: 'user', content: 'Decidimos usar Postgres. Ainda não sabemos se o login vai ser com Google ou com e-mail e senha.' },
  { role: 'assistant', content: 'Certo: Postgres decidido; o método de login fica em aberto.' },
]

const cases = [
  {
    description: 'tune: propose returns exactly 3 different versions as JSON',
    vars: { prompt: tune.proposePrompt(system, task, criteria, 3) },
    assert: [{ type: 'javascript', value: `${JSON_BLOCK}const v = data.variants\nreturn Array.isArray(v) && v.length === 3 && v.every((x) => x.label && x.change && x.system && x.system.trim() !== ${JSON.stringify(system)})` }],
  },
  ...[[good, bad, 1, 2], [bad, good, 2, 1]].map(([a, b, gi, bi]) => ({
    description: `tune: judge scores the good answer higher (good answer in position ${gi})`,
    vars: { prompt: tune.judgePrompt(task, criteria, [a, b]) },
    assert: [{ type: 'javascript', value: `${JSON_BLOCK}const s = Object.fromEntries(data.scores.map((x) => [Number(x.answer), Number(x.score)]))\nreturn s[${gi}] > s[${bi}]` }],
  })),
  {
    description: 'summary: keeps names, numbers, the decision and the open question, in Portuguese',
    vars: { prompt: JSON.stringify([...conversation, { role: 'user', content: summary.SUMMARY_PROMPT }]) },
    assert: [
      { type: 'icontains-all', value: ['Marina', 'Atlas', '12.000', '15 de novembro', 'Postgres', 'Google'] },
      { type: 'javascript', value: `/\\b(o|a|de|para|com|não)\\b/i.test(output)` },
    ],
  },
]

writeFileSync(new URL('./cases.generated.json', import.meta.url), JSON.stringify(cases, null, 2))
console.log(`${cases.length} cases written to evals/cases.generated.json`)
