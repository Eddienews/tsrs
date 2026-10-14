import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface MockWebdav {
  // Server root; folders below it are created with MKCOL.
  url: string
  // Files by path, such as /tsrs/chat~a~1.json.
  files: Map<string, string>
  close(): Promise<void>
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, PROPFIND, MKCOL',
}

// A WebDAV server kept in memory, with one user, that accepts calls from
// any page.
export async function startMockWebdav(user: string, password: string): Promise<MockWebdav> {
  const files = new Map<string, string>()
  const folders = new Set<string>(['/'])
  const auth = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end()
    if (req.headers.authorization !== auth) return res.writeHead(401, CORS).end()
    let body = ''
    for await (const chunk of req) body += chunk
    const path = decodeURIComponent(new URL(req.url!, 'http://x').pathname)
    const folder = path.endsWith('/') ? path : `${path}/`
    if (req.method === 'MKCOL') {
      folders.add(folder)
      return res.writeHead(201, CORS).end()
    }
    if (req.method === 'PROPFIND') {
      if (!folders.has(folder)) return res.writeHead(404, CORS).end()
      const inside = [...files.keys()].filter(
        (name) => name.startsWith(folder) && !name.slice(folder.length).includes('/'),
      )
      const response = (href: string, collection: boolean) =>
        `<d:response><d:href>${encodeURI(href)}</d:href><d:propstat><d:prop><d:resourcetype>` +
        `${collection ? '<d:collection/>' : ''}</d:resourcetype></d:prop></d:propstat></d:response>`
      const xml =
        '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' +
        response(folder, true) +
        inside.map((name) => response(name, false)).join('') +
        '</d:multistatus>'
      return res.writeHead(207, { ...CORS, 'Content-Type': 'application/xml' }).end(xml)
    }
    if (req.method === 'PUT') {
      files.set(path, body)
      return res.writeHead(201, CORS).end()
    }
    if (!files.has(path)) return res.writeHead(404, CORS).end()
    if (req.method === 'DELETE') {
      files.delete(path)
      return res.writeHead(204, CORS).end()
    }
    res.writeHead(200, CORS).end(files.get(path))
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    files,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      }),
  }
}
