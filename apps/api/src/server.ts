import Fastify from 'fastify'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CatalogRegistry, parseCatalogDefinitions } from './catalogs.js'
import { FileCatalogStore } from './catalog-store.js'
import { registerRoutes } from './routes.js'
import { parseWorkerDefinitions, WorkerRegistry } from './workers.js'

export async function createServer(environment: NodeJS.ProcessEnv = process.env) {
  const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
  const configPath = resolve(repositoryRoot, environment.ICEBERG_CATALOGS_FILE ?? '.local/catalogs.json')
  const store = new FileCatalogStore(configPath)
  const storedDefinitions = await store.load(environment)
  const definitions = storedDefinitions ?? parseCatalogDefinitions(environment.ICEBERG_CATALOGS_JSON, environment)
  const registry = new CatalogRegistry(
    definitions,
    environment,
    undefined,
    (nextDefinitions) => store.save(nextDefinitions),
  )
  const workers = new WorkerRegistry(parseWorkerDefinitions(environment.ICEBERG_WORKERS_JSON, environment), environment)
  const app = Fastify({
    logger: {
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[REDACTED]',
      },
    },
  })

  registerRoutes(app, registry, environment, workers)
  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await createServer()
  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.API_HOST ?? '127.0.0.1'

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  await app.listen({ port, host })
}
