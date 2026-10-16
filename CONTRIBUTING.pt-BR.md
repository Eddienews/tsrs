# Como contribuir

[English](CONTRIBUTING.md) · **Português**

Obrigado por querer construir o TSRS junto. Este guia diz o que o projeto
promete a quem usa, como rodar e testar, e como mandar uma mudança. Toda
participação segue o [Código de Conduta](CODE_OF_CONDUCT.md).

Não precisa saber programar para ajudar: relatar um problema, testar um
provedor com a sua chave (veja "A confirmar com provedor real" no
[ROADMAP](ROADMAP.pt-BR.md)), melhorar a documentação ou a tradução e responder
dúvidas nas [Discussions](../../discussions) também contam.

## Princípios

Todo recurso precisa respeitar estes pontos; um pull request que quebra algum
deles não entra, por melhor que seja o recurso.

- **Local primeiro.** Nada de servidor do TSRS: dados e chaves ficam na máquina
  de quem usa, e as mensagens vão direto ao provedor. O que roda fora do
  navegador roda na própria máquina do usuário: o servidor local do
  `npm run dev` (pastas de projeto, vídeo, extensões, agenda) e o proxy local
  (`npm run proxy`), que só existe para APIs que não aceitam o navegador. O app
  continua funcionando como build estático, sem eles.
- **Sem cobrança.** Nenhum pagamento, cartão, conta ou plano dentro do app.
- **Sem telemetria.** O app não envia dados de uso para lugar nenhum.
- **Segurança por padrão.** Código gerado pelo modelo e ferramentas JavaScript
  de plugins rodam isolados, sem acesso às chaves (iframe com `sandbox`, sem
  `allow-same-origin`). Ferramentas de MCP pedem permissão, menos nos servidores
  que o usuário marcou como confiáveis. Os serviços locais só aceitam pedidos da
  origem do próprio app, e o leitor de páginas recusa endereços da máquina e da
  rede local.
- **Nada é apagado sem querer.** Arquivos removidos vão para uma pasta de
  removidos; um arquivo novo nunca sobrescreve outro.
- **Testado.** Recurso novo vem com teste unitário e, quando tem tela ou
  servidor, teste de ponta a ponta.
- **Dois idiomas.** Todo texto da interface existe em português e inglês.

Ficam fora do escopo, de propósito: contas de usuário, recursos de equipe
hospedados, pagamentos e compartilhamento por link.

## Rodando

Basta Node.js (22 ou mais novo) e um navegador. Para mexer no vídeo motion,
também o [ffmpeg](https://ffmpeg.org).

```bash
npm ci
npm run dev        # http://localhost:5173, com o servidor local
npm test           # testes unitários (vitest)
npm run test:e2e   # ponta a ponta (Playwright), com um provedor falso
npm run build      # checagem de tipos + build
```

Os testes de ponta a ponta não gastam API: um provedor falso
(`e2e/mock-provider.ts`) responde, junto com servidores falsos de MCP e WebDAV.
Eles usam o Chromium do Playwright, se instalado (`npx playwright install
chromium`), ou senão o Google Chrome do sistema; para outro navegador, aponte
`CHROMIUM_PATH` para ele. O `playwright.config.ts` sobe dois servidores: o
projeto `app` (porta 5174) e o projeto `extensions` (porta 5175), cada um com
pastas temporárias próprias (`TSRS_RENDERS`, `TSRS_PROJECTS`,
`TSRS_EXTENSIONS`), então os testes nunca tocam nas suas pastas de verdade.

Modelos locais pelo [Ollama](https://ollama.com) ou pelo LM Studio bastam para
testar quase tudo à mão sem gastar nada.

## Escolhendo o que fazer

As [issues](../../issues) listam os recursos planejados. As marcadas com
`good first issue` são as melhores para começar, e `help wanted` marca onde
ajuda faz mais diferença; as etiquetas `prioridade: …` dizem a ordem sugerida.
Comente na issue que vai pegá-la antes de começar, para ninguém fazer o mesmo
trabalho em paralelo. Para algo que não está nas issues, abra uma (ou uma
conversa nas Discussions) e conte o que pretende antes de escrever o código.

O [ROADMAP](ROADMAP.pt-BR.md) tem o que já foi feito e o que ainda precisa ser
confirmado com provedores reais; confirmar um desses itens também ajuda.

### Sem programar: prompts, skills e plugins

- **Um prompt para a galeria da comunidade:** acrescente uma entrada em
  `src/communityPrompts.ts`, na categoria certa, em português e em inglês, com
  os mesmos `{{campos}}` nos dois. Curto, útil para muita gente e com um id novo.
  O `npm test` confere a entrada.
- **Uma skill ou um plugin de exemplo:** acrescente uma pasta em
  `exemplos/skills/` ou `exemplos/plugins/`, nos formatos descritos em
  `server/extensions.mjs`, e uma linha no `exemplos/README.md`. Ferramentas que
  chamam uma API devem usar uma grátis, sem chave e que permita esse uso.

## Onde fica cada coisa

- `src/`: o app (React). O [README](README.pt-BR.md#estrutura-do-projeto) tem o
  mapa dos arquivos.
- `server/`: os serviços locais montados no `npm run dev` (pastas de projeto,
  extensões, busca, agenda), cada um com o seu plugin do Vite.
- `render/`: o contrato motion, o renderizador de MP4 e o plugin dele.
- `proxy/`: o proxy CORS local.
- `public/motion/`: o runtime do motion e as bibliotecas que ele carrega.
- `e2e/`: testes de ponta a ponta e os servidores falsos.

## Estilo do código

- React 19, TypeScript, Vite, Tailwind 4 e componentes shadcn/ui
  (`src/components/ui`).
- Sem ponto e vírgula, aspas simples. Não há formatador automático: quebre as
  linhas longas à mão, como no código ao redor, e não reformate linhas que você
  não mudou.
- Comentários em inglês, curtos, dizendo o porquê, não o quê.
- Lógica sem tela fica em módulos `.ts` com teste ao lado (`x.ts` e
  `x.test.ts`); componentes ficam em `.tsx`. Código do servidor (`server/`,
  `render/`) é testado nos specs de ponta a ponta.
- Para verificar os tipos, use `npx tsc --noEmit` (sem `--noEmit`, o `tsc`
  grava arquivos no projeto).

### Textos da interface

Todo texto visível passa por `t()`, com o texto em **português** como chave:

```tsx
t('Excluir a base "{name}"?', { name })
```

A tradução em inglês vai em `src/locales/en.ts`. O teste
`src/i18n.test.ts` falha se faltar uma tradução, se sobrar uma que ninguém usa
ou se os campos `{assim}` não baterem.

## Mandando a mudança

1. Faça um fork e crie uma branch a partir da `main`.
2. Rode `npm test`, `npm run test:e2e` e `npm run build`; a CI roda os mesmos.
3. Abra o pull request preenchendo o modelo: o que muda, como você testou e
   uma captura de tela quando mexer na interface.
4. Pull requests pequenos e com um assunto só são revisados mais rápido.

Issues e pull requests podem ser escritos em português ou em inglês.

O código é distribuído sob a [licença MIT](LICENSE); ao contribuir, você
concorda que a sua contribuição também fica sob ela.

## Segurança

Não abra issue pública para uma vulnerabilidade: veja o
[SECURITY.md](SECURITY.md). E nunca cole uma chave de API numa issue, num log ou
num commit.
