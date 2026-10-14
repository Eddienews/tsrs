import type { ModelInfo, Provider } from './types'

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
  },
  {
    ...openaiCompatible,
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyRequired: true,
    maxTokensField: 'max_completion_tokens',
  },
  {
    ...openaiCompatible,
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyRequired: true,
  },
  {
    ...openaiCompatible,
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyRequired: true,
    webTools: 'openrouter',
  },
  {
    ...openaiCompatible,
    id: 'ollama',
    name: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    keyRequired: false,
    efforts: [],
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

// Fallback for models whose provider does not report limits and prices.
// Prices are list prices as of 2026-10 and only feed the cost estimate.
export const KNOWN_MODELS: Record<string, ModelInfo> = {
  'claude-fable-5-1': { context: 1_000_000, inputPrice: 10, outputPrice: 50 },
  'claude-opus-5-5': { context: 1_000_000, inputPrice: 4, outputPrice: 20 },
  'claude-sonnet-5-5': { context: 1_000_000, inputPrice: 2, outputPrice: 10 },
  'claude-haiku-5-5': {
    context: 1_000_000,
    inputPrice: 0.1,
    outputPrice: 0.5,
    longPrompt: { above: 100_000, inputPrice: 0.5, outputPrice: 2.5 },
  },
}
