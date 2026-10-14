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

export type Part = { type: 'text'; text: string } | ToolPart

export interface Message {
  id: string
  role: Role
  content: string
  attachments?: Attachment[]
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
}

export interface Chat extends ChatMeta {
  messages: Message[]
}

// A named system prompt, optionally tied to a model.
export interface Persona {
  id: string
  name: string
  system: string
  providerId?: string
  model?: string
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
}

export interface Settings {
  language: 'pt' | 'en'
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
  // Empty means "use the chat's own model".
  titleModel: string
  // Present when the API keys are password-protected; the keys are then
  // stored only inside it.
  vault?: Vault
}
