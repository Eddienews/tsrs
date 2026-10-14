import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { t } from './i18n'
import type { ToolDef, ToolResult } from './stream'
import type { McpServer } from './types'

// Longest tool result kept; longer ones are cut so a single call cannot fill
// the model's context.
const MAX_RESULT = 100_000

interface Connection {
  // Address and token the connection was opened with.
  key: string
  client: Promise<Client>
  tools?: Promise<ToolDef[]>
}

const connections = new Map<string, Connection>()

function explain(server: McpServer, err: unknown): Error {
  const detail = err instanceof Error ? err.message : String(err)
  // fetch reports CORS blocks and unreachable hosts the same way.
  const hint =
    err instanceof TypeError
      ? ' ' + t('O servidor pode não permitir chamadas do navegador (CORS).')
      : ''
  const name = server.name || server.url
  return new Error(t('Servidor MCP "{name}": {detail}.', { name, detail }) + hint)
}

async function open(server: McpServer): Promise<Client> {
  // Loaded on first use: most conversations never touch MCP.
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
  ])
  const client = new Client({ name: 'tsrs', version: '0.1.0' })
  const headers = server.token ? { Authorization: `Bearer ${server.token}` } : undefined
  await client.connect(
    new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers } }),
  )
  return client
}

function connection(server: McpServer): Connection {
  const key = `${server.url}\n${server.token}`
  let current = connections.get(server.id)
  if (current?.key !== key) {
    forget(server.id)
    current = { key, client: open(server) }
    connections.set(server.id, current)
  }
  return current
}

// Closes the connection to a server, so the next use opens a fresh one.
export function forget(id: string): void {
  connections.get(id)?.client.then((client) => client.close()).catch(() => {})
  connections.delete(id)
}

export async function listTools(server: McpServer): Promise<ToolDef[]> {
  const current = connection(server)
  current.tools ??= current.client.then(async (client) => {
    const { tools } = await client.listTools()
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      schema: tool.inputSchema,
    }))
  })
  try {
    return await current.tools
  } catch (err) {
    forget(server.id)
    throw explain(server, err)
  }
}

function textOf(item: any): string {
  if (item.type === 'text') return item.text
  if (item.type === 'resource') return item.resource?.text ?? `[${item.resource?.uri}]`
  return `[${item.type}]`
}

export async function callTool(
  server: McpServer,
  name: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    const client = await connection(server).client
    const result = await client.callTool(
      { name, arguments: input as Record<string, unknown> },
      undefined,
      { signal },
    )
    const items = Array.isArray(result.content) ? result.content : []
    const content =
      items.map(textOf).join('\n') ||
      (result.structuredContent ? JSON.stringify(result.structuredContent) : '')
    return { content: content.slice(0, MAX_RESULT), isError: result.isError === true }
  } catch (err) {
    if (signal?.aborted) throw err
    forget(server.id)
    throw explain(server, err)
  }
}
