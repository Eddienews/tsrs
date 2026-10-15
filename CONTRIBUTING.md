# Contributing

**English** · [Português](CONTRIBUTING.pt-BR.md)

Thanks for wanting to build TSRS together. This guide covers what the project
promises its users, how to run and test it, and how to send a change. All
participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).

You don't need to write code to help: reporting a problem, testing a provider
with your own key (see "To confirm with real providers" in the
[ROADMAP](ROADMAP.md)), improving the docs or the translation, and answering
questions in [Discussions](../../discussions) all count.

## Principles

Every feature must respect these points; a pull request that breaks one of them
won't be merged, however good the feature is.

- **Local first.** No TSRS server: data and keys stay on the user's machine,
  and messages go straight to the provider. Whatever runs outside the browser
  runs on the user's own machine: the local server in `npm run dev` (project
  folders, video, extensions, schedule) and the local proxy (`npm run proxy`),
  which only exists for APIs that refuse browser calls. The app keeps working
  as a static build without them.
- **No billing.** No payments, cards, accounts or plans inside the app.
- **No telemetry.** The app sends usage data nowhere.
- **Secure by default.** Model-generated code and plugins' JavaScript tools run
  isolated, without access to the keys (a `sandbox` iframe without
  `allow-same-origin`). MCP tools ask for permission, except on servers the user
  marked as trusted. Local services only accept requests from the app's own
  origin, and the page reader refuses addresses on the machine and the local
  network.
- **Nothing is deleted by accident.** Removed files go to a removed folder; a
  new file never overwrites another.
- **Tested.** New features come with unit tests and, when they have a UI or a
  server part, end-to-end tests.
- **Two languages.** Every UI text exists in Portuguese and English.

Deliberately out of scope: user accounts, hosted team features, payments and
sharing by link.

## Running

All you need is Node.js (22 or newer) and a browser. To work on motion video,
also [ffmpeg](https://ffmpeg.org).

```bash
npm ci
npm run dev        # http://localhost:5173, with the local server
npm test           # unit tests (vitest)
npm run test:e2e   # end to end (Playwright), against a fake provider
npm run build      # type check + build
```

End-to-end tests spend no API credits: a fake provider
(`e2e/mock-provider.ts`) answers, along with fake MCP and WebDAV servers. They
use Playwright's Chromium if installed (`npx playwright install chromium`), or
else the system's Google Chrome; for another browser, point `CHROMIUM_PATH` at
it. `playwright.config.ts` starts two servers: the `app` project (port 5174) and
the `extensions` project (port 5175), each with its own temporary folders
(`TSRS_RENDERS`, `TSRS_PROJECTS`, `TSRS_EXTENSIONS`), so tests never touch your
real folders.

Local models through [Ollama](https://ollama.com) or LM Studio are enough to
test almost everything by hand without spending anything.

## Picking something to do

The [issues](../../issues) list planned features. Those labelled
`good first issue` are the best place to start, and `help wanted` marks where
help matters most; the `prioridade: …` (priority) labels give the suggested
order. Comment on an issue before you start on it, so nobody does the same work
in parallel. For something that isn't in the issues, open one (or a Discussions
thread) and describe what you have in mind before writing the code.

The [ROADMAP](ROADMAP.md) lists what's done and what still needs confirming with
real providers; confirming one of those also helps.

## Where things live

- `src/`: the app (React). The [README](README.md#project-layout) has a map of
  the files.
- `server/`: the local services mounted by `npm run dev` (project folders,
  extensions, search, schedule), each with its own Vite plugin.
- `render/`: the motion contract, the MP4 renderer and its plugin.
- `proxy/`: the local CORS proxy.
- `public/motion/`: the motion runtime and the libraries it loads.
- `e2e/`: end-to-end tests and the fake servers.

## Code style

- React 19, TypeScript, Vite, Tailwind 4 and shadcn/ui components
  (`src/components/ui`).
- No semicolons, single quotes. There is no automatic formatter: wrap long lines
  by hand, like the surrounding code, and don't reformat lines you didn't change.
- Comments in English, short, saying why rather than what.
- Logic without UI lives in `.ts` modules with a test beside it (`x.ts` and
  `x.test.ts`); components live in `.tsx`. Server code (`server/`, `render/`)
  is tested in the end-to-end specs.
- To check types, use `npx tsc --noEmit` (without `--noEmit`, `tsc` writes files
  into the project).

### UI texts

Every visible text goes through `t()`, with the **Portuguese** text as the key:

```tsx
t('Excluir a base "{name}"?', { name })
```

The English translation goes in `src/locales/en.ts`. The `src/i18n.test.ts` test
fails when a translation is missing, when one is unused, or when the `{fields}`
don't match. If you don't speak Portuguese, write your best attempt at the key
and say so in the pull request; we'll fix the wording together.

## Sending the change

1. Fork the repo and create a branch from `main`.
2. Run `npm test`, `npm run test:e2e` and `npm run build`; CI runs the same.
3. Open the pull request and fill in the template: what changes, how you tested
   it, and a screenshot when you touch the UI.
4. Small pull requests about one thing get reviewed faster.

Issues and pull requests may be written in English or Portuguese.

The code is distributed under the [MIT licence](LICENSE); by contributing, you
agree that your contribution is under it too.

## Security

Don't open a public issue for a vulnerability: see [SECURITY.md](SECURITY.md).
And never paste an API key into an issue, a log or a commit.
