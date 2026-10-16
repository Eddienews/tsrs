# Roadmap

**English** · [Português](ROADMAP.pt-BR.md)

What already exists, what comes next and what is deliberately left out. Within
each section, the order is the suggested order.

## Done

- [x] Streaming chat with Markdown, attachments, versions, editing and regeneration
- [x] Conversations with search, folders, pinning, renaming and automatic titles
- [x] Six initial providers (Anthropic, OpenAI, Gemini, OpenRouter, Ollama, Custom)
- [x] Tokens and cost per reply and per conversation; full-context warning
- [x] API keys protected by a passphrase
- [x] Personas and saved prompts with `{{name}}` fields
- [x] Tools: remote MCP and the provider's web search / page reading
- [x] PWA (installable, opens offline)
- [x] Portuguese and English interface
- [x] New design (Tailwind + shadcn/ui), light/dark theme and appearance settings
- [x] Preview panel: HTML, SVG, JavaScript, Markdown, React and Mermaid
- [x] Command palette (Ctrl/⌘+K)
- [x] Usage view by day and by model
- [x] Comparing up to three models at once
- [x] Model reasoning, collapsed above the reply
- [x] Delete everything
- [x] Automatic prompt caching on Anthropic, with its cost counted separately
- [x] More providers: DeepSeek, Mistral, xAI, Groq, Perplexity, LM Studio and Command Code
- [x] Branching a conversation from a message
- [x] Pinned messages, with shortcuts at the top of the conversation
- [x] Reading replies aloud (system voices)
- [x] Dictation (OpenAI, Groq or the browser's speech recognition)
- [x] Exporting a conversation as a single HTML file
- [x] Sources cited by Perplexity and by OpenRouter's search
- [x] Option to open the preview automatically
- [x] Cache tokens from OpenAI-format providers (the discount only counts when
      the provider's cache price is known)
- [x] Optional local proxy (`npm run proxy`) and the OpenCode Zen and Go providers
- [x] Memory: the model keeps facts about you in a list you can see and edit
- [x] Agents: personas with a model, tools, files and starter suggestions
- [x] Context summary when a conversation gets close to the model's limit
- [x] Image generation (OpenAI GPT Image and Gemini Imagen)
- [x] Image, video and audio through media services (ElevenLabs, Runware, fal.ai,
      Replicate, WaveSpeedAI, Higgsfield)
- [x] Side question: ask about a passage of a reply without cluttering the conversation
- [x] Split bundle: the app opens with ~550 kB of JavaScript (it was ~930 kB);
      Markdown, syntax highlighting and dialogs arrive right after
- [x] Local knowledge base (RAG): PDFs, text and HTML split into chunks and
      searched by words (BM25), with no API, per conversation or per persona
- [x] Canvas: a document or code beside the conversation, edited by the model
      (with tools) and by hand, with undo, preview and requests about a passage
- [x] Sync between devices through a synced folder (Dropbox, Drive, Syncthing…),
      optionally encrypted, with no TSRS server

## Done in the second phase

- [x] Knowledge base with embeddings (search by meaning, not only by words),
      using the provider's embeddings API
- [x] Knowledge search tool so the model can refine the question itself
- [x] Library sync item by item instead of all at once
- [x] Sync without a folder (the user's own WebDAV or S3 storage), for browsers
      without folder access such as Firefox and Safari
- [x] Video through Veo (Gemini key) and voice through OpenAI (`gpt-4o-mini-tts`)
- [x] Voice through Gemini TTS (`gemini-3.8-flash-tts`). Sora is left out:
      OpenAI shut down Sora 2 and the videos API on 2026-09-24
- [x] Reading replies aloud with an ElevenLabs, OpenAI or Gemini voice
- [x] Estimated cost before generating (Veo, fal.ai and Runware; the other
      services only report it afterwards)
- [x] More services with official APIs: Stability, Black Forest Labs (through
      the proxy), MiniMax (video and voice), Cartesia and xAI's Grok Imagine
      (image and video)
- [x] Motion video: `motion` blocks with a timeline in the preview and
      `npm run render` to MP4, frame by frame, as in NWLab ForgeOS
- [x] Extensions: skills in Claude's format, plugins (skills, commands, agents,
      MCP and custom HTTP or JavaScript tools) and a schedule run by the server
- [x] Project folder: each conversation's files written to a real folder, so
      work can continue in Claude Code, Codex or an editor
- [x] Audio attachments: play in the conversation, transcribe (OpenAI or Groq)
      for the model and use as the soundtrack of a motion video
- [x] Make MP4 button in the preview, with a soundtrack from the conversation
      or the computer; the renderer ships inside `npm run dev`
- [x] Better voices: the browser's most natural voice (Edge's free neural
      voices) and your own ElevenLabs voices, with samples and prices; costs for
      OpenAI models
- [x] Version number and commit on screen
- [x] Folder context: instructions, files and an agent for a folder's conversations
- [x] Web search and page reading with your own key (Brave, Tavily, Google,
      Kagi), for any model
- [x] Deep research: rounds of searching and reading that end in a report with
      sources, saved in the project folder
- [x] User-entered prices for models the app does not know
- [x] Word and PowerPoint: attached and read as text, and written into the project folder
- [x] Clearing the context from a point, undoable
- [x] Agents: their own parameters, skills and plugins; called with @name
- [x] Prompt chains, with `{{resposta}}` for the previous reply
- [x] Scheduled tasks with your own web search, skills and plugins' HTTP tools
- [x] Short videos: narration with word timings, stock clips, captions, music and credits
- [x] Automatic backup on disk, with the keys sealed by the password, and a restore offer when the browser was wiped
- [x] Local voices with no key: Piper reads aloud and Whisper transcribes, in the browser, with the models kept on disk
- [x] Make ElevenLabs voices from the app: designed from a description or cloned from recordings
- [x] Talk about videos: frames and the transcription of their sound, for any model with vision
- [x] Model lists that update once a day and mark new models, fine-tuned ones included
- [x] Azure OpenAI, through the resource's v1 endpoint and its deployments
- [x] Profiles: personal and work apart in the same browser, each with its own keys, conversations and backup
- [x] Community gallery with over 50 prompts, and example skills and plugins that install with one click
- [x] JavaScript interpreter and charts, isolated with no network

## Next

Planned work lives in the [issues](../../issues), with priority labels; ideas
and conversations go to [Discussions](../../discussions). Left out so far, for
lack of an official API or of browser support:

- [ ] Luma (its API is moving to an "Agents API"), Runway (only documents
      image-to-video), Ideogram, Recraft, official Kling and Hume (they refuse
      browser calls and would need the proxy), Deepgram (no Portuguese voices).
      Midjourney, Suno and Udio have no official API

## To confirm with real providers

- [ ] MCP with a real remote server (only run against the test server)
- [ ] Reasoning summaries on Anthropic
- [ ] Prompt caching on Anthropic (check "from cache" under the reply)
- [ ] The newer providers, including Command Code (CORS checked; a conversation not yet)
- [ ] The install button (PWA); in Safari on the Mac, "Add to Dock"
- [ ] Dictation with OpenAI or Groq and reading aloud (only on Linux does the
      browser need voices installed, for example through speech-dispatcher;
      Windows and macOS ship their own)
- [ ] OpenCode Zen and Go through the local proxy, with a paid key
- [ ] Image generation on OpenAI (`gpt-image-2`) and Gemini
      (`imagen-4.0-generate-001`); model names may change
- [ ] Veo with a Gemini key (access to preview models may be limited) and the
      OpenAI voice in Portuguese
- [ ] Media services with real keys (only tested against simulated responses):
      ElevenLabs, Runware, fal.ai, Replicate and Higgsfield through the proxy,
      WaveSpeedAI, Stability, Black Forest Labs, MiniMax, Cartesia and xAI's
      Grok Imagine; check the default models, whether Runware's storage allows
      downloading the files, and the exact response formats
- [ ] Memory with a real model: whether it saves useful facts without overdoing it
- [ ] Context summary in a real long conversation
- [ ] Sync between two real devices, through Dropbox, Drive or Syncthing
- [ ] Canvas with a real model: whether it prefers editing passages to rewriting everything
- [ ] Knowledge-base search quality with real documents
- [ ] Embeddings with real keys (OpenAI, Gemini, OpenRouter, Mistral, Ollama)
- [ ] The `knowledge_search` tool with a real model: whether it searches again
      when the chunks are not enough
- [ ] Own search and deep research with a real key (Brave, Tavily, Google or Kagi)
- [ ] The schedule with a real task at its time, with the tab closed
- [ ] ElevenLabs' exact cost read by the browser (the `character-cost` header)
- [ ] Full installation and test runs on macOS and Linux
- [ ] WebDAV on a real Nextcloud (through the local proxy) and S3 on AWS or R2
      (only tested with local WsgiDAV and rclone)

## Out of scope

Team features (shared workspace, user management, per-person analytics) and
sharing by link: they need a server and accounts, the opposite of what TSRS is
for. Sync between devices is an exception because it uses the user's own folder
or storage.
