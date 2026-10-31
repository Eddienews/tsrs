// Mounts the agent commands (agent.mjs) in the TSRS dev and preview servers,
// at /__tsrs/agent, and writes the agent file the `tsrs` command reads: this
// server's address and a fresh token, readable by this computer's user only.

import { readFile, rm } from 'node:fs/promises'
import { defaultFolder, exclusiveRender, renderBusy, renderMotion } from '../render/serve.mjs'
import { versionInfo } from '../render/version-plugin.mjs'
import { checkVideo, describeCheck, readSpec, runVideo } from '../render/video.mjs'
import { AGENT_PATH, agentFile, agentHandler, createAgent, writeAgentFile } from './agent.mjs'
import { comfyStatus, makeImage as comfyImage } from './comfy.mjs'
import { inspectPage } from './design.mjs'
import { projectsRoot } from './projects.mjs'
import { makeImage as sdcppImage, sdcppStatus } from './sdcpp.mjs'

// The address a command on this computer reaches the server at.
export function localUrl(address, https = false) {
  if (!address || typeof address === 'string') return null
  const host = ['::', '0.0.0.0', '::1', '127.0.0.1'].includes(address.address) || !address.address ? 'localhost' : address.address
  return `${https ? 'https' : 'http'}://${host.includes(':') ? `[${host}]` : host}:${address.port}`
}

export function tsrsAgent(agendaFor) {
  const mount = (server, dev) => {
    const log = (line) => server.config.logger.info(`[tsrs] ${line}`)
    let token = null
    const runCommand = createAgent(
      {
        agenda: agendaFor?.(server) ?? { list: async () => ({ tasks: [], pending: 0 }), runNow: async () => {} },
        version: () => versionInfo(dev),
        renderMotion,
        video: { readSpec, checkVideo, describeCheck, runVideo },
        renderBusy,
        exclusiveRender,
        renderFolder: defaultFolder(),
        inspectPage,
        log,
        comfy: { status: () => comfyStatus(), makeImage: (job) => comfyImage(job) },
        sdcpp: { status: () => sdcppStatus(), makeImage: (job) => sdcppImage(job) },
      },
      projectsRoot(),
    )
    const handle = agentHandler(runCommand, () => token)
    server.middlewares.use(AGENT_PATH, async (req, res, next) => {
      try {
        if (!(await handle(req, res))) next()
      } catch (error) {
        next(error)
      }
    })
    const http = server.httpServer
    http?.once('listening', async () => {
      const url = localUrl(http.address(), !!server.config.server?.https)
      if (!url) return
      try {
        token = await writeAgentFile(url)
      } catch (error) {
        server.config.logger.warn(`[tsrs] The tsrs command will not reach this server: ${error.message}`)
      }
    })
    http?.once('close', async () => {
      // Leave the file of another TSRS that started after this one alone.
      try {
        if (JSON.parse(await readFile(agentFile(), 'utf8')).token === token) await rm(agentFile(), { force: true })
      } catch {
        // already gone
      }
    })
  }
  return {
    name: 'tsrs-agent',
    configureServer: (server) => mount(server, true),
    configurePreviewServer: (server) => mount(server, false),
  }
}
