import { callTool, listTools } from './mcp'
import type { ToolCall, ToolDef, ToolResult } from './stream'
import type { McpServer } from './types'

// The tools offered to the model in one request, drawn from the MCP servers
// that are switched on.
export interface ToolSet {
  defs: ToolDef[]
  // Name to show the user for a tool the model called.
  label(name: string): string
  // Whether the tool may run without asking the user first.
  autoApprove(name: string): boolean
  run(call: ToolCall, signal?: AbortSignal): Promise<ToolResult>
  // Servers that could not be reached, as messages for the user.
  problems: string[]
}

// Providers accept only these characters in a tool name, up to 64 of them.
function wireName(server: McpServer, tool: string, taken: Set<string>): string {
  const clean = (text: string) => text.replace(/[^a-zA-Z0-9_-]+/g, '_')
  const base = `${clean(server.name) || 'mcp'}__${clean(tool)}`.slice(0, 60)
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`
  taken.add(name)
  return name
}

export async function gatherTools(servers: McpServer[]): Promise<ToolSet> {
  const routes = new Map<string, { server: McpServer; tool: string }>()
  const defs: ToolDef[] = []
  const problems: string[] = []
  const taken = new Set<string>()

  const listed = await Promise.allSettled(servers.map(listTools))
  listed.forEach((result, index) => {
    const server = servers[index]
    if (result.status === 'rejected') {
      problems.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
      return
    }
    for (const tool of result.value) {
      const name = wireName(server, tool.name, taken)
      routes.set(name, { server, tool: tool.name })
      defs.push({ ...tool, name })
    }
  })

  return {
    defs,
    problems,
    label(name) {
      const route = routes.get(name)
      return route ? `${route.server.name || 'MCP'} · ${route.tool}` : name
    },
    autoApprove: (name) => routes.get(name)?.server.autoApprove === true,
    async run(call, signal) {
      const route = routes.get(call.name)
      if (!route) return { content: `No tool named ${call.name}.`, isError: true }
      return callTool(route.server, route.tool, call.input, signal)
    },
  }
}
