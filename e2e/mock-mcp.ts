import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

export interface MockMcp {
  url: string
  // Text each call to the `echo` tool received.
  calls: string[]
  // Authorization header of each request.
  tokens: (string | undefined)[]
  close(): Promise<void>
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
}

// A real MCP server over streamable HTTP with a single `echo` tool.
export async function startMockMcp(): Promise<MockMcp> {
  const calls: string[] = []
  const tokens: (string | undefined)[] = []

  const http_ = http.createServer(async (req, res) => {
    for (const [name, value] of Object.entries(CORS)) res.setHeader(name, value)
    if (req.method === 'OPTIONS') return res.writeHead(204).end()
    // Stateless: no server-to-client stream and no session to delete.
    if (req.method !== 'POST') return res.writeHead(405).end()
    tokens.push(req.headers.authorization)

    const server = new McpServer({ name: 'mock', version: '1.0.0' })
    server.registerTool(
      'echo',
      { description: 'Repeats the text it is given.', inputSchema: { text: z.string() } },
      async ({ text }) => {
        calls.push(text)
        return { content: [{ type: 'text', text: `eco: ${text}` }] }
      },
    )
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res)
  })

  await new Promise<void>((resolve) => http_.listen(0, '127.0.0.1', resolve))
  const { port } = http_.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    calls,
    tokens,
    close: () => new Promise((resolve) => http_.close(() => resolve())),
  }
}
