import type { ShortcutAction } from './shortcuts'

export type Role = 'user' | 'assistant'

export type AttachmentKind = 'image' | 'pdf' | 'text'

export interface Attachment {
  id: string
  name: string
  mime: string
  kind: AttachmentKind
  // Base64 for images and PDFs, the decoded text for text files.
  data: string
}

export interface Usage {
  input: number
  output: number
  // Part of `input` read from or written to the provider's prompt cache,
  // which is billed at a different rate.
  cacheRead?: number
  cacheWrite?: number
  // US dollars, when the provider reports it or the model's price is known.
  cost?: number
  // Tokens the conversation occupies after this reply. Set when the reply
  // took several requests, whose input tokens add up to more than that.
  context?: number
}

// A tool the model called while writing a reply.
export interface ToolPart {
  type: 'tool'
  id: string
  // Name the model called the tool by.
  name: string
  // Name shown to the user.
  label?: string
  // Run by the provider itself (web search); never sent back in later turns.
  provider?: boolean
  // Arguments as JSON.
  input: string
  result?: string
  error?: boolean
  status: 'approval' | 'running' | 'done'
}

export interface Source {
  url: string
  title?: string
}

// A passage of a knowledge base document sent with the question.
export interface Reference {
  // Name of the document.
  name: string
  text: string
}

export type Part = { type: 'text'; text: string } | ToolPart

export interface Message {
  id: string
  role: Role
  content: string
  // When the message was written, in ms; absent on messages from older versions.
  createdAt?: number
  attachments?: Attachment[]
  // The model's reasoning, when the provider sent it.
  thinking?: string
  // Text and tool calls in the order they happened, for replies that used
  // tools; `content` still holds all of the text.
  parts?: Part[]
  error?: string
  usage?: Usage
  // The reply stopped because it hit the output token limit.
  truncated?: boolean
  // Provider and model that wrote a reply.
  providerId?: string
  model?: string
  // Pages the provider cited for this reply (Perplexity, OpenRouter's web search).
  sources?: Source[]
  // Knowledge base passages sent with the question this reply answers.
  references?: Reference[]
  // Kept at the top of the conversation for quick access.
  pinned?: boolean
  // A summary of everything before it, which replaces those messages in later
  // requests.
  summary?: boolean
  // An image generated from this prompt; the image is in `attachments`.
  imagePrompt?: string
  // Other versions of the conversation from this message on, left behind by
  // an edit or a regeneration. Each is the rest of a conversation, starting
  // with a message that stands in this one's place.
  alts?: Message[][]
  // Position of the current version among all of them (alts plus this one).
  altIndex?: number
}

// Per-chat overrides; an unset field falls back to the provider's default.
export interface ChatParams {
  system?: string
  temperature?: number
  maxTokens?: number
  effort?: string
  // Persona the system prompt was taken from, for display only.
  personaId?: string
  // Knowledge bases searched for every question.
  knowledge?: string[]
}

// A document or piece of code written together with the model, beside a chat.
export interface Canvas {
  title: string
  // Language of the code, or 'markdown' for a document.
  lang: string
  content: string
  // Earlier contents, most recent last, so a change can be undone.
  previous?: string[]
}

// Everything about a conversation except its messages; the sidebar needs only
// this, so messages are loaded when a conversation is opened.
export interface ChatMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  providerId: string
  model: string
  pinned?: boolean
  folderId?: string
  params?: ChatParams
  canvas?: Canvas
  // Last change of any kind (rename, pin, a new message), for syncing;
  // `updatedAt` only moves with new messages, to keep the list order.
  changedAt?: number
  // Kept only in memory: never stored, synced or listed, and gone once the
  // user leaves it.
  temporary?: boolean
}

export interface Chat extends ChatMeta {
  messages: Message[]
}

// Tools an agent uses in place of the ones switched on for every chat.
export interface PersonaTools {
  webSearch: boolean
  webFetch: boolean
  // Ids of the MCP servers it may call.
  mcpServers: string[]
}

// A named system prompt, optionally tied to a model. With tools, files or
// starters it works as an agent.
export interface Persona {
  id: string
  name: string
  system: string
  providerId?: string
  model?: string
  tools?: PersonaTools
  // Sent with every conversation that uses the persona.
  files?: Attachment[]
  // Suggestions shown on an empty conversation.
  starters?: string[]
  // Knowledge bases searched in its conversations.
  knowledge?: string[]
}

export interface KnowledgeBase {
  id: string
  name: string
}

// A file added to a knowledge base, kept as the text passages it is searched by.
export interface KnowledgeDoc {
  id: string
  baseId: string
  name: string
  addedAt: number
  // Characters of text extracted from the file.
  size: number
  chunks: string[]
  // One vector per passage, for searching by meaning; `model` is the
  // provider and embedding model that made them, as 'provider/model'.
  vectors?: { model: string; data: string[] }
}

// A fact about the user the model chose, or was asked, to remember.
export interface Memory {
  id: string
  text: string
  createdAt: number
}

// A reusable piece of text to drop into the composer.
export interface SavedPrompt {
  id: string
  title: string
  text: string
}

export interface Folder {
  id: string
  name: string
}

// Wire format spoken by a provider's chat endpoint.
export type ApiFormat = 'openai' | 'anthropic'

export interface Provider {
  id: string
  name: string
  format: ApiFormat
  baseUrl: string
  chatPath: string
  modelsPath: string
  // Header values may contain the {apiKey} placeholder.
  headers: Record<string, string>
  keyRequired: boolean
  defaultModels: string[]
  maxTokensField: 'max_tokens' | 'max_completion_tokens'
  // Reasoning-effort levels the provider accepts; empty hides the control.
  efforts: string[]
  // False when the provider's current models reject sampling parameters.
  temperature: boolean
  // Whether to ask an OpenAI-format endpoint for token usage in the stream.
  streamUsage: boolean
  // Price of input read from the prompt cache, as a share of the input price,
  // when the provider bills it the same way for every model; absent when
  // unknown, in which case cached input is priced like any other.
  cacheReadShare?: number
  // Speech-to-text model for dictation, when the provider has one.
  transcription?: string
  // Model for image generation, when the provider has one.
  image?: string
  // Embedding model, for searching knowledge bases by meaning.
  embedding?: string
  // The provider's API does not accept calls from a browser; it is reached
  // through the local proxy by default.
  needsProxy?: boolean
  // How the provider offers web search (and, for Anthropic, page fetching)
  // run on its own servers; absent when it does not.
  webTools?: 'anthropic' | 'openrouter'
}

// A remote MCP server reached over HTTP.
export interface McpServer {
  id: string
  name: string
  url: string
  // Sent as a bearer token when not empty.
  token: string
  enabled: boolean
  // Run this server's tools without asking first.
  autoApprove: boolean
}

export interface ModelInfo {
  // Context window in tokens.
  context?: number
  // US dollars per million tokens.
  inputPrice?: number
  outputPrice?: number
  // Price of input read from the prompt cache; the full input price when unset.
  cacheReadPrice?: number
  // Rate card that replaces the prices above when the prompt is longer than
  // `above` tokens.
  longPrompt?: { above: number; inputPrice: number; outputPrice: number }
}

// API keys encrypted with a key derived from the user's password. All fields
// are base64.
export interface Vault {
  salt: string
  iv: string
  data: string
}

export interface ProviderSettings {
  apiKey: string
  baseUrl: string
  models: string[]
  modelInfo?: Record<string, ModelInfo>
  // Send requests through the local proxy; unset follows `needsProxy`.
  proxy?: boolean
}

// How the interface looks; applied as a class and data attributes on <html>.
export interface Appearance {
  theme: 'light' | 'dark'
  accent: 'signal' | 'green' | 'blue' | 'red'
  font: 'sm' | 'md' | 'lg'
  density: 'compact' | 'comfortable'
}

// A folder on a WebDAV server (Nextcloud, ownCloud, a NAS…).
export interface WebdavSync {
  url: string
  user: string
  // Held like an API key.
  password: string
}

// A bucket on S3 or a compatible service (Cloudflare R2, Backblaze B2, MinIO…).
export interface S3Sync {
  // Empty for AWS itself.
  endpoint: string
  region: string
  bucket: string
  // Folder inside the bucket.
  prefix: string
  accessKey: string
  // Held like an API key.
  secretKey: string
}

// Syncing through a folder that a sync service (Dropbox, Drive, Syncthing…)
// copies between devices, a WebDAV server or an S3 bucket; at most one is
// connected.
export interface SyncSettings {
  // Name of the chosen folder; the handle itself is kept in IndexedDB.
  folder: string
  webdav?: WebdavSync
  s3?: S3Sync
  // Reach the WebDAV server or the bucket through the local proxy.
  proxy?: boolean
  // Encrypts what is written to the folder; held like an API key.
  password: string
  lastSync?: number
  // Chats, library items and documents deleted here, by id ('persona:',
  // 'doc:'… prefix for the others), with when, so other devices delete them too.
  deleted: Record<string, number>
  // What each library item looked like when last seen, as a hash, and when it
  // last changed; absent until the library is first looked at.
  items?: Record<string, { hash: string; at: number }>
}

export interface Settings {
  language: 'pt' | 'en'
  appearance: Appearance
  providers: Record<string, ProviderSettings>
  providerId: string
  model: string
  systemPrompt: string
  folders: Folder[]
  personas: Persona[]
  prompts: SavedPrompt[]
  mcpServers: McpServer[]
  // Provider-side tools, used when the provider offers them.
  webSearch: boolean
  webFetch: boolean
  autoTitle: boolean
  // Let Anthropic cache the conversation so that resending it costs less.
  promptCache: boolean
  // Show the model's reasoning, asking for it where the provider needs that.
  showThinking: boolean
  // Who turns speech into text: a provider with a transcription model, the
  // browser, or 'auto' (the first such provider with a key, else the browser).
  dictation: string
  // Open the preview when a reply ends with a page, drawing or component.
  autoPreview: boolean
  // Play a short chime when a reply is done.
  doneSound: boolean
  // Shortcuts changed by the user; the others keep their defaults.
  shortcuts: Partial<Record<ShortcutAction, string>>
  // Tell the model that code blocks can be opened in the preview panel.
  previewHint: boolean
  // Empty means "use the chat's own model".
  titleModel: string
  // Let the model save facts about the user and read them in every chat.
  memory: boolean
  memories: Memory[]
  // Who draws images: a provider with an image model or 'auto' (the first
  // such provider with a key). An empty model uses the provider's default.
  imageProvider: string
  imageModel: string
  // Who turns passages into vectors to search knowledge bases by meaning:
  // 'off', 'auto' (the first provider with an embedding model and a key) or a
  // provider. An empty model uses the provider's default.
  embedProvider: string
  embedModel: string
  // Address of the local proxy (npm run proxy) for providers without CORS.
  proxyUrl: string
  knowledgeBases: KnowledgeBase[]
  sync: SyncSettings
  // Present when the API keys are password-protected; the keys are then
  // stored only inside it.
  vault?: Vault
}
