import { createContext } from '@silkweave/core'
import { buildMcpExpressApp } from '@silkweave/mcp'
import express, { type NextFunction, type Request, type Response } from 'express'
import { actions } from './actions/index.js'
import { LARK_DOMAIN } from './lib/platform.js'
import { VERSION } from './lib/version.js'

const host = process.env.HOST ?? '0.0.0.0'
const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) { throw new Error(`Invalid PORT '${process.env.PORT}'`) }

const allowedHosts = new Set(['localhost', '127.0.0.1', 'healthcheck.railway.app'])
for (const value of [process.env.RAILWAY_PUBLIC_DOMAIN, ...(process.env.MCP_ALLOWED_HOSTS?.split(',') ?? [])]) {
  const hostname = value?.trim()
  if (hostname) { allowedHosts.add(hostname) }
}

const serverOptions = {
  name: 'silkweave-lark',
  description: 'Feishu/Lark MCP over Streamable HTTP. Tenant access acts as the bot; user token keys select OAuth identities.',
  version: VERSION,
  lint: process.env.NODE_ENV !== 'production'
}

// A remote unauthenticated restart tool would make the Railway service easy to disrupt.
const httpActions = actions.filter((action) => action.name !== 'mcpRestart')
const mcpApp = buildMcpExpressApp(serverOptions, createContext({ adapter: 'http' }), httpActions, {
  host,
  port,
  allowedHosts: [...allowedHosts],
  cors: false,
  sideloadResources: false
})

const app = express()
app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok', transport: 'streamable-http', platform: LARK_DOMAIN, version: VERSION })
})

const bearerToken = process.env.MCP_BEARER_TOKEN
if (bearerToken) {
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.get('authorization') === `Bearer ${bearerToken}`) { return next() }
    response.set('WWW-Authenticate', 'Bearer').status(401).json({ error: 'Unauthorized' })
  })
}
app.use(mcpApp)

const server = app.listen(port, host, () => {
  console.log(`[silkweave-lark] Streamable HTTP MCP listening on ${host}:${port}/mcp (${LARK_DOMAIN})`)
})

let shuttingDown = false
function shutdown() {
  if (shuttingDown) { return }
  shuttingDown = true
  const forceExit = setTimeout(() => {
    server.closeAllConnections()
    process.exit(1)
  }, 5000)
  forceExit.unref()
  server.close((error?: Error) => {
    clearTimeout(forceExit)
    if (error) { console.error('[silkweave-lark] HTTP shutdown failed:', error) }
    process.exit(error ? 1 : 0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

