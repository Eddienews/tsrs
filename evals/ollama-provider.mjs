// Local Ollama provider for the evals: asks for the answer without the model's reasoning (think: false), the way
// the app shows it. Model and host come from OLLAMA_MODEL / OLLAMA_HOST (default qwen3.5:4b on localhost).
export default class OllamaNoThink {
  constructor(options = {}) {
    this.config = options.config ?? {}
    this.model = process.env.OLLAMA_MODEL || this.config.model || 'qwen3.5:4b'
    this.host = (process.env.OLLAMA_HOST || this.config.host || 'http://127.0.0.1:11434').replace(/\/$/, '')
  }

  id() {
    return `ollama-nothink:${this.model}`
  }

  async callApi(prompt) {
    let messages
    try {
      const parsed = JSON.parse(prompt)
      messages = Array.isArray(parsed) ? parsed : null
    } catch {
      messages = null
    }
    messages ??= [{ role: 'user', content: prompt }]
    try {
      const res = await fetch(`${this.host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          think: false,
          options: { temperature: this.config.temperature ?? 0, num_ctx: this.config.num_ctx ?? 8192 },
        }),
      })
      if (!res.ok) return { error: `Ollama ${res.status}: ${await res.text()}` }
      const data = await res.json()
      return { output: data.message?.content ?? '' }
    } catch (e) {
      return { error: `Ollama is not reachable at ${this.host}: ${e.message}` }
    }
  }
}
