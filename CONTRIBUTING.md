# Como contribuir

Obrigado por querer construir o TSRS junto. Este guia diz o que o projeto
promete a quem usa, como rodar e testar, e como mandar uma mudança.

## Princípios

Todo recurso precisa respeitar estes pontos; um pull request que quebra algum
deles não entra, por melhor que seja o recurso.

- **Local primeiro.** Nada de servidor do TSRS: dados e chaves ficam na máquina
  de quem usa, e as mensagens vão direto ao provedor. O proxy local
  (`npm run proxy`) roda na própria máquina e só existe para provedores e
  servidores que não aceitam chamadas do navegador.
- **Sem cobrança.** Nenhum pagamento, cartão, conta ou plano dentro do app.
- **Sem telemetria.** O app não envia dados de uso para lugar nenhum.
- **Segurança por padrão.** Código gerado pelo modelo roda isolado, sem acesso
  às chaves (iframe com `sandbox`, sem `allow-same-origin`). Ferramentas de MCP
  pedem permissão, menos nos servidores que o usuário marcou como confiáveis;
  ferramentas internas só mexem em dados locais.
- **Testado.** Recurso novo vem com teste unitário e, quando tem tela, teste de
  ponta a ponta.
- **Dois idiomas.** Todo texto da interface existe em português e inglês.

Ficam fora do escopo, de propósito: contas de usuário, recursos de equipe
hospedados, pagamentos e compartilhamento por link.

## Rodando

Basta Node.js (22 ou mais novo) e um navegador.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes unitários (vitest)
npm run test:e2e   # ponta a ponta (Playwright), com um provedor falso
npm run build      # checagem de tipos + build
```

Os testes de ponta a ponta não gastam API: um provedor falso responde. Eles
usam o Chromium do Playwright, se instalado (`npx playwright install
chromium`), ou senão o Google Chrome do sistema; para outro navegador, aponte
`CHROMIUM_PATH` para ele.

Modelos locais pelo [Ollama](https://ollama.com) ou pelo LM Studio bastam para
testar quase tudo à mão sem gastar nada.

## Escolhendo o que fazer

As [issues](../../issues) listam os recursos planejados. As marcadas com
`good first issue` são as melhores para começar; as etiquetas `prioridade: …`
dizem a ordem sugerida. Comente na issue que vai pegá-la antes de começar,
para ninguém fazer o mesmo trabalho em paralelo. Para algo que não está nas
issues, abra uma primeiro e conte o que pretende.

O [ROADMAP.md](ROADMAP.md) tem o que já foi feito e o que ainda precisa ser
confirmado com provedores reais; confirmar um desses itens também ajuda.

## Estilo do código

- React 19, TypeScript, Vite, Tailwind 4 e componentes shadcn/ui
  (`src/components/ui`). O [README](README.md) tem um mapa dos arquivos.
- Sem ponto e vírgula, aspas simples. Não há formatador automático: quebre as
  linhas longas à mão, como no código ao redor.
- Comentários em inglês, curtos, dizendo o porquê, não o quê.
- Lógica sem tela fica em módulos `.ts` com teste ao lado (`x.ts` e
  `x.test.ts`); componentes ficam em `.tsx`.
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
3. Abra o pull request contando o que muda e como você testou. Inclua uma
   captura de tela quando mexer na interface.
4. Pull requests pequenos e com um assunto só são revisados mais rápido.

O código é distribuído sob a [licença MIT](LICENSE); ao contribuir, você
concorda que a sua contribuição também fica sob ela.

## Segurança

Não abra issue pública para uma vulnerabilidade. Use **Security → Report a
vulnerability** no GitHub, que manda o relato só para os mantenedores.
