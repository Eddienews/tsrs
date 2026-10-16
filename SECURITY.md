# Security · Segurança

**English** · [Português](#português)

## English

### Reporting a vulnerability

Please **don't open a public issue** for a security problem. Use
**Security → Report a vulnerability** on the repository page; the report goes
privately to the maintainers. If that option isn't available, write to
[nwlabapp@gmail.com](mailto:nwlabapp@gmail.com) with "TSRS security" in the
subject.

Include what you found, how to reproduce it, and what an attacker could do with
it. Never include real API keys. We'll acknowledge the report as soon as we can,
keep you posted while we fix it, and credit you in the release notes if you'd
like.

### Supported versions

TSRS has no releases yet: fixes go to `main`, and only the latest `main` is
supported. The version and commit you're running appear under the name in the
app.

### What's in scope

Most interesting are problems that break the promises in
[CONTRIBUTING.md](CONTRIBUTING.md#principles), for example:

- model-generated code, previews, the JavaScript interpreter or plugin
  JavaScript tools reaching the API keys or the app's storage, or the
  interpreter reaching the network;
- the local services (`/__tsrs/…`) accepting requests from another origin, or
  reading and writing outside their folders;
- the page reader or HTTP tools reaching the machine or the local network;
- the design tools (`server/design.mjs`) running anything but the reviewed copy
  of taste-skill in `vendor/`, or its inspector serving files outside the
  project folder (it opens model-written pages in a headless Chrome or Edge with
  a throwaway profile; like any web page, they can reach the internet);
- the component tool (`server/components.mjs`) reading from hosts other than
  cult/ui's and shadcn's registries, or writing outside the project folder;
- keys leaking into sync files, exports, logs or URLs;
- weaknesses in the passphrase encryption of keys or sync files.

Known limitations listed in the [README](README.md#known-limitations) (keys in
plain text without a passphrase, for example) are not vulnerabilities, but ideas
to improve them are welcome.

### Keeping yourself safe

- Install skills and plugins only from people you trust: they can add tools and
  instructions that the model will use.
- Keep the permission prompt on for MCP servers you don't trust.
- Set a passphrase for your keys on shared computers.
- Run `npm run dev` and `npm run proxy` on your own machine only; they listen on
  `localhost`.

## Português

### Como relatar uma vulnerabilidade

Por favor, **não abra uma issue pública** para um problema de segurança. Use
**Security → Report a vulnerability** na página do repositório; o relato vai só
para os mantenedores. Se essa opção não aparecer, escreva para
[nwlabapp@gmail.com](mailto:nwlabapp@gmail.com) com "TSRS segurança" no
assunto.

Conte o que encontrou, como reproduzir e o que um atacante poderia fazer com
isso. Nunca inclua chaves de API reais. Vamos confirmar o recebimento assim que
possível, manter você informado durante a correção e dar o crédito nas notas da
versão, se você quiser.

### Versões atendidas

O TSRS ainda não tem versões publicadas: as correções vão para a `main`, e só a
`main` mais recente é atendida. A versão e o commit em uso aparecem embaixo do
nome, no app.

### O que interessa

Principalmente problemas que quebram as promessas do
[CONTRIBUTING.pt-BR.md](CONTRIBUTING.pt-BR.md#princípios), por exemplo:

- código gerado pelo modelo, previews, o interpretador de JavaScript ou
  ferramentas JavaScript de plugins alcançando as chaves de API ou os dados do
  app, ou o interpretador alcançando a rede;
- os serviços locais (`/__tsrs/…`) aceitando pedidos de outra origem, ou lendo
  e gravando fora das pastas deles;
- o leitor de páginas ou ferramentas HTTP alcançando a máquina ou a rede local;
- as ferramentas de design (`server/design.mjs`) rodando qualquer coisa além da
  cópia revisada da taste-skill em `vendor/`, ou o inspetor servindo arquivos
  fora da pasta do projeto (ele abre páginas escritas pelo modelo num Chrome ou
  Edge sem janela, com perfil descartável; como qualquer página, elas alcançam a
  internet);
- a ferramenta de componentes (`server/components.mjs`) lendo de outros
  endereços além dos registros do cult/ui e do shadcn, ou gravando fora da
  pasta do projeto;
- chaves vazando em arquivos de sincronização, exportações, logs ou URLs;
- fraquezas na criptografia das chaves ou da sincronização.

As limitações conhecidas listadas no [README](README.pt-BR.md#limitações-conhecidas)
(chaves em texto puro sem senha, por exemplo) não são vulnerabilidades, mas
ideias para melhorá-las são bem-vindas.

### Para se proteger

- Instale skills e plugins só de quem você confia: eles podem acrescentar
  ferramentas e instruções que o modelo vai seguir.
- Deixe o pedido de permissão ligado para servidores MCP em que não confia.
- Use senha nas chaves em computadores compartilhados.
- Rode o `npm run dev` e o `npm run proxy` só na sua própria máquina; eles
  escutam em `localhost`.
