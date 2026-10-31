// TSRS from a phone (access.mjs): the key asked of anyone who is not this
// computer, and the push endpoints. Mounted first, before every other
// middleware, in the dev and preview servers. Tailscale's names (*.ts.net)
// are allowed as hosts; everything they ask for still needs the key.

import { accessGate, accessKey, hostName, pushHandler } from './access.mjs'
import { extensionsRoot } from './extensions.mjs'

export function tsrsAccess() {
  const mount = (server) => {
    const root = extensionsRoot()
    const secure = (req) => req.headers['x-forwarded-proto'] === 'https' || hostName(req.headers.host).endsWith('.ts.net')
    server.middlewares.use(accessGate(() => accessKey(root), { secure }))
    server.middlewares.use('/__tsrs/push', pushHandler(root))
  }
  return {
    name: 'tsrs-access',
    config: () => ({ server: { allowedHosts: ['.ts.net'] }, preview: { allowedHosts: ['.ts.net'] } }),
    configureServer: mount,
    configurePreviewServer: mount,
  }
}
