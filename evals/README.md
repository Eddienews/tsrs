# Prompt evals

Regression tests, with [promptfoo](https://github.com/promptfoo/promptfoo), for the prompts TSRS writes itself:

- **Agent tuning** (`src/tune.ts`): the propose step returns exactly N valid, different versions as JSON; the
  judge scores a good answer above a poor one in either order (no position bias).
- **Conversation summary** (`src/summary.ts`): the summary keeps names, numbers, dates, decisions and open
  questions, in the language of the conversation.

`evals/export-cases.mjs` builds the cases from the source through Vite, so a prompt edit is tested as written.

```sh
ollama pull qwen3.5:4b        # another local model: OLLAMA_MODEL=<model> npm run evals
                              # another provider: npm run evals -- --providers openai:gpt-4.1-mini
npm run evals
npx promptfoo@0.124.1 view    # results table
```

Telemetry: set `PROMPTFOO_DISABLE_TELEMETRY=1` to turn off promptfoo's anonymous usage data.

## What they found (October 2026, local Ollama)

| Case | qwen3.5:4b | qwen3.5:9b |
|---|---|---|
| Tune: propose 3 different versions as JSON | fails: broken JSON (a missing `]`) | passes |
| Tune: judge, good answer first / second | passes / passes | passes / passes |
| Summary keeps the facts, in Portuguese | passes (failed before: answered in English) | passes |

The runs led to three fixes in this branch: `jsonOf` reads from the first `{` to the last `}` (a 4B model left a
stray backtick before the closing fence), versions that repeat the current instructions are dropped, and the
summary prompt asks for the language of the messages explicitly. Agent tuning needs a 9B-class model or larger.

