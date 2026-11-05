import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'
import { CatalogRegistry, parseCatalogDefinitions } from './catalogs.js'
import { registerRoutes } from './routes.js'

export function createServer(environment: NodeJS.ProcessEnv = process.env) {
  const definitions = parseCatalogDefinitions(environment.ICEBERG_CATALOGS_JSON, environment)
  const registry = new CatalogRegistry(definitions, environment)
  const app = Fastify({
    logger: {
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[REDACTED]',
      },
    },
  })

  registerRoutes(app, registry)
  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createServer()
  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.API_HOST ?? '127.0.0.1'

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  await app.listen({ port, host })
}
