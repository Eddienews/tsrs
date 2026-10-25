import type { Connection } from './stream'
import type { ModelInfo, Provider, Settings } from './types'

const openaiCompatible: Omit<Provider, 'id' | 'name' | 'baseUrl' | 'keyRequired'> = {
  format: 'openai',
  chatPath: '/chat/completions',
  modelsPath: '/models',
  headers: { Authorization: 'Bearer {apiKey}' },
  defaultModels: [],
  maxTokensField: 'max_tokens',
  efforts: ['low', 'medium', 'high'],
  temperature: true,
  streamUsage: true,
}

// Adding a provider is a matter of adding a row here; anything that speaks the
// OpenAI chat-completions format needs no new code.
export const PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    chatPath: '/messages',
    modelsPath: '/models',
    headers: {
      'x-api-key': '{apiKey}',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    keyRequired: true,
    defaultModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    maxTokensField: 'max_tokens',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    temperature: false,
    streamUsage: false,
    webTools: 'anthropic',
    cacheReadShare: 0.1,
  },
  {
    ...openaiCompatible,
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyRequired: true,
    maxTokensField: 'max_completion_tokens',
    transcription: 'gpt-4o-mini-transcribe',
    image: 'gpt-image-2',
    speech: 'gpt-4o-mini-tts',
    embedding: 'text-embedding-3-small',
  },
  {
    ...openaiCompatible,
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyRequired: true,
    image: 'imagen-4.0-generate-001',
    video: 'veo-3.1-fast-generate-preview',
    speech: 'gemini-3.8-flash-tts',
    embedding: 'gemini-embedding-001',
  },
  {
    ...openaiCompatible,
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyRequired: true,
    webTools: 'openrouter',
    embedding: 'openai/text-embedding-3-small',
  },
  {
    ...openaiCompatible,
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyRequired: true,
    efforts: [],
  },
  {
    // Elorian speaks the OpenAI format; its agent model thinks before answering,
    // so it takes max_completion_tokens and low/medium/xhigh effort.
    ...openaiCompatible,
    id: 'elorian',
    name: 'Elorian',
    baseUrl: 'https://api.elorian.ai/v1',
    // Its documentation names one model and no list endpoint.
    modelsPath: '',
    keyRequired: true,
    defaultModels: ['elorian-1-agent'],
    maxTokensField: 'max_completion_tokens',
    efforts: ['low', 'medium', 'xhigh'],
    temperature: false,
    proxyOption: true,
  },
  {
    ...openaiCompatible,
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyRequired: true,
    efforts: [],
    embedding: 'mistral-embed',
    // Usage comes in the last chunk anyway; the API rejects fields it does not know.
    streamUsage: false,
  },
  {
    ...openaiCompatible,
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    keyRequired: true,
    efforts: [],
    image: 'grok-imagine-image-2.0',
    video: 'grok-imagine-video-1.5',
  },
  {
    ...openaiCompatible,
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyRequired: true,
    efforts: [],
    transcription: 'whisper-large-v3-turbo',
  },
  {
    ...openaiCompatible,
    id: 'perplexity',
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    // No model list endpoint: the known models are offered instead.
    modelsPath: '',
    keyRequired: true,
    defaultModels: ['sonar', 'sonar-pro', 'sonar-reasoning-pro', 'sonar-deep-research'],
    efforts: [],
    streamUsage: false,
  },
  // One key, two wire formats: Claude models answer only on /messages.
  {
    ...openaiCompatible,
    id: 'commandcode',
    name: 'Command Code',
    baseUrl: 'https://api.commandcode.ai/provider/v1',
    keyRequired: true,
    efforts: [],
  },
  {
    id: 'commandcode-claude',
    name: 'Command Code (Claude)',
    format: 'anthropic',
    baseUrl: 'https://api.commandcode.ai/provider/v1',
    chatPath: '/messages',
    modelsPath: '/models',
    headers: { Authorization: 'Bearer {apiKey}', 'anthropic-version': '2023-06-01' },
    keyRequired: true,
    defaultModels: [],
    maxTokensField: 'max_tokens',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    temperature: false,
    streamUsage: false,
  },
  // OpenCode's gateways answer only to the OpenCode app, not to browsers.
  {
    ...openaiCompatible,
    id: 'opencode-zen',
    name: 'OpenCode Zen',
    baseUrl: 'https://opencode.ai/zen/v1',
    keyRequired: true,
    efforts: [],
    needsProxy: true,
  },
  {
    ...openaiCompatible,
    id: 'opencode-go',
    name: 'OpenCode Go',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    keyRequired: true,
    efforts: [],
    needsProxy: true,
  },
  {
    ...openaiCompatible,
    id: 'ollama',
    name: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    keyRequired: false,
    efforts: [],
    embedding: 'nomic-embed-text',
  },
  {
    ...openaiCompatible,
    id: 'lmstudio',
    name: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    keyRequired: false,
    efforts: [],
  },
  // Coding agents installed on this computer, started by the TSRS server in the
  // conversation's project folder with their own login and plan. The base URL
  // is the command; models are the agent's own aliases.
  {
    id: 'claude-code',
    name: 'Claude Code (CLI)',
    format: 'cli',
    cli: 'claude',
    baseUrl: 'claude',
    chatPath: '',
    modelsPath: '',
    headers: {},
    keyRequired: false,
    defaultModels: ['default', 'opus', 'sonnet', 'haiku'],
    maxTokensField: 'max_tokens',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    temperature: false,
    streamUsage: false,
  },
  {
    id: 'codex-cli',
    name: 'Codex (CLI)',
    format: 'cli',
    cli: 'codex',
    baseUrl: 'codex',
    chatPath: '',
    modelsPath: '',
    headers: {},
    keyRequired: false,
    defaultModels: ['default'],
    maxTokensField: 'max_tokens',
    efforts: ['low', 'medium', 'high'],
    temperature: false,
    streamUsage: false,
  },
  {
    // Azure's v1 API speaks the OpenAI format at the resource's own address,
    // with the key in an api-key header; the model is the deployment's name.
    ...openaiCompatible,
    id: 'azure',
    name: 'Azure OpenAI',
    baseUrl: '',
    baseUrlExample: 'https://SEU-RECURSO.openai.azure.com/openai/v1',
    modelsPath: '',
    headers: { 'api-key': '{apiKey}' },
    keyRequired: true,
    maxTokensField: 'max_completion_tokens',
    deployments: true,
    proxyOption: true,
  },
  {
    ...openaiCompatible,
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    keyRequired: false,
  },
]

export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}

export function usesProxy(settings: Settings, provider: Provider): boolean {
  return settings.providers[provider.id]?.proxy ?? !!provider.needsProxy
}

// What a request to the provider needs, with the proxy when it goes through one.
export function connection(settings: Settings, providerId: string): Connection {
  const provider = getProvider(providerId)
  const { baseUrl, apiKey, cliAccess } = settings.providers[provider.id]
  if (provider.format === 'cli') return { provider, baseUrl, apiKey: '', access: cliAccess ?? 'edit' }
  const proxy = usesProxy(settings, provider) ? settings.proxyUrl.trim() : ''
  return { provider, baseUrl, apiKey, ...(proxy ? { proxy } : {}) }
}

// Fallback for models whose provider does not report limits and prices.
// Prices are list prices as of 2026-10 and only feed the cost estimate.
export const KNOWN_MODELS: Record<string, ModelInfo> = {
  'claude-fable-5-1': { context: 1_000_000, inputPrice: 10, outputPrice: 50, cacheReadPrice: 0.25 },
  'claude-opus-5-5': { context: 1_000_000, inputPrice: 4, outputPrice: 20, cacheReadPrice: 0.2 },
  'claude-sonnet-5-5': { context: 1_000_000, inputPrice: 2, outputPrice: 10 },
  'claude-haiku-5-5': {
    context: 1_000_000,
    inputPrice: 0.1,
    outputPrice: 0.5,
    longPrompt: { above: 100_000, inputPrice: 0.5, outputPrice: 2.5 },
  },
  // OpenAI, from developers.openai.com/api/docs/pricing and the model pages,
  // October 2026. OpenAI's cache has no write charge.
  'gpt-6-astra': { inputPrice: 10, outputPrice: 50, cacheReadPrice: 1 },
  'gpt-6.1-sol': { inputPrice: 2, outputPrice: 10, cacheReadPrice: 0.1 },
  'gpt-6-luna': { inputPrice: 0.1, outputPrice: 0.5, cacheReadPrice: 0.01 },
  'gpt-5.5': {
    context: 1_050_000,
    inputPrice: 5,
    outputPrice: 30,
    cacheReadPrice: 0.5,
    // Above 272K input tokens the whole request costs 2x input and 1.5x output.
    longPrompt: { above: 272_000, inputPrice: 10, outputPrice: 45 },
  },
  'gpt-5.5-pro': { context: 1_050_000, inputPrice: 30, outputPrice: 180 },
  'gpt-5': { context: 400_000, inputPrice: 1.25, outputPrice: 10, cacheReadPrice: 0.125 },
  'chat-latest': { inputPrice: 5, outputPrice: 30, cacheReadPrice: 0.5 },
  'gpt-5.3-codex': { inputPrice: 1.75, outputPrice: 14, cacheReadPrice: 0.175 },
}

// The built-in prices of a model, also under a dated name such as
// gpt-5-2025-08-07.
export function knownModel(model: string): ModelInfo {
  return KNOWN_MODELS[model] ?? KNOWN_MODELS[model.replace(/-\d{4}-\d{2}-\d{2}$/, '')] ?? {}
}
