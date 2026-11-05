import { getCurrentSchema, type Snapshot, type TableMetadata } from 'iceberg-js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import {
  CatalogAlreadyExistsError,
  CatalogNotFoundError,
  CatalogRegistry,
  parseCatalogDefinition,
  type CatalogClient,
} from './catalogs.js'
import {
  parseWorkerJobSubmission,
  WorkerProtocolError,
  WorkerRegistry,
  WorkerRequestError,
  type WorkerClient,
} from './workers.js'

type QueryValue = string | string[] | undefined

interface RouteParams {
  catalogId: string
}

interface ListQuery {
  namespace?: QueryValue
  parent?: QueryValue
  pageSize?: string
  pageToken?: string
}

interface TableQuery {
  namespace?: QueryValue
  name?: string
}

class RouteError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

function repeated(value: QueryValue): string[] {
  if (value === undefined) return []
  return (Array.isArray(value) ? value : [value]).filter((part) => part.length > 0)
}

function pageOptions(query: ListQuery): { pageSize?: number; pageToken?: string } {
  const options: { pageSize?: number; pageToken?: string } = {}
  if (query.pageToken) options.pageToken = query.pageToken

  if (query.pageSize !== undefined) {
    const pageSize = Number(query.pageSize)
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
      throw new RouteError(400, 'pageSize must be an integer between 1 and 1000.')
    }
    options.pageSize = pageSize
  }

  return options
}

function requireClient(registry: CatalogRegistry, catalogId: string): CatalogClient {
  const client = registry.client(catalogId)
  if (!client) throw new RouteError(404, 'Catalog not found.')
  return client
}

function requireWorker(registry: WorkerRegistry, workerId: string): WorkerClient {
  const client = registry.client(workerId)
  if (!client) throw new RouteError(404, 'Worker not found.')
  return client
}

function safeSnapshot(snapshot: Snapshot) {
  const allowedSummaryKeys = [
    'added-data-files',
    'deleted-data-files',
    'added-records',
    'deleted-records',
    'total-records',
    'total-data-files',
    'total-delete-files',
  ]

  return {
    snapshotId: snapshot['snapshot-id'],
    parentSnapshotId: snapshot['parent-snapshot-id'],
    timestampMs: snapshot['timestamp-ms'],
    operation: snapshot.summary.operation,
    summary: Object.fromEntries(
      allowedSummaryKeys.flatMap((key) =>
        snapshot.summary[key] === undefined ? [] : [[key, snapshot.summary[key]]],
      ),
    ),
  }
}

function tableSummary(metadata: TableMetadata) {
  const snapshots = metadata.snapshots ?? []
  const recentSnapshots = snapshots.slice(-100).reverse()
  const schema = getCurrentSchema(metadata)
  const currentSpec = metadata['partition-specs'].find(
    (spec) => spec['spec-id'] === metadata['default-spec-id'],
  )

  return {
    formatVersion: metadata['format-version'],
    lastUpdatedMs: metadata['last-updated-ms'],
    currentSnapshotId: metadata['current-snapshot-id'] === -1
      ? undefined
      : metadata['current-snapshot-id'],
    snapshotCount: snapshots.length,
    snapshotsTruncated: snapshots.length > recentSnapshots.length,
    snapshots: recentSnapshots.map(safeSnapshot),
    currentSchema: schema
      ? { schemaId: schema['schema-id'], fields: schema.fields }
      : undefined,
    currentPartitionSpec: currentSpec
      ? { specId: currentSpec['spec-id'], fields: currentSpec.fields }
      : undefined,
    refs: metadata.refs ?? {},
  }
}

function statusForCatalogError(error: unknown): number {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : 0

  return status === 404 ? 404 : 502
}

async function handleCatalogRequest<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  catalogId: string,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof RouteError) {
      reply.code(error.statusCode).send({ error: error.message })
      return undefined
    }

    const statusCode = statusForCatalogError(error)
    request.log.warn({ catalogId, statusCode }, 'Iceberg catalog request failed')
    reply.code(statusCode).send({
      error: statusCode === 404 ? 'Catalog resource not found.' : 'Iceberg catalog request failed.',
    })
    return undefined
  }
}

export function registerRoutes(
  app: FastifyInstance,
  registry: CatalogRegistry,
  environment: NodeJS.ProcessEnv = process.env,
  workers: WorkerRegistry = new WorkerRegistry([], environment),
): void {
  app.get('/api/health', async () => ({ status: 'ok' }))

  app.get('/api/catalogs', async () => ({ catalogs: registry.list() }))

  app.post('/api/catalogs', async (request, reply) => {
    let definition
    try {
      definition = parseCatalogDefinition(request.body, environment)
    } catch {
      return reply.code(400).send({ error: 'Invalid catalog configuration.' })
    }

    try {
      const catalog = await registry.add(definition)
      return reply.code(201).send({ catalog })
    } catch (error) {
      if (error instanceof CatalogAlreadyExistsError) {
        return reply.code(409).send({ error: 'A catalog with this id already exists.' })
      }
      request.log.error({ err: error }, 'Failed to save catalog configuration')
      return reply.code(500).send({ error: 'Could not save catalog configuration.' })
    }
  })

  app.delete<{ Params: RouteParams }>('/api/catalogs/:catalogId', async (request, reply) => {
    try {
      await registry.remove(request.params.catalogId)
      return { deleted: true }
    } catch (error) {
      if (error instanceof CatalogNotFoundError) {
        return reply.code(404).send({ error: 'Catalog not found.' })
      }
      request.log.error({ err: error }, 'Failed to save catalog configuration')
      return reply.code(500).send({ error: 'Could not save catalog configuration.' })
    }
  })

  app.get('/api/workers', async () => ({ workers: workers.list() }))

  app.get<{ Params: { workerId: string } }>('/api/workers/:workerId/status', async (request, reply) => {
    const { workerId } = request.params
    try {
      const definition = workers.definition(workerId)
      if (!definition) throw new RouteError(404, 'Worker not found.')
      const worker = requireWorker(workers, workerId)
      const [health, capabilities] = await Promise.all([worker.health(), worker.capabilities()])
      return {
        worker: {
          id: workerId,
          name: definition.name,
          health,
          capabilities,
        },
      }
    } catch (error) {
      if (error instanceof RouteError) return reply.code(error.statusCode).send({ error: error.message })
      request.log.warn({ workerId }, 'Worker status request failed')
      return reply.code(502).send({ error: 'Worker request failed.' })
    }
  })

  app.post<{ Params: { workerId: string } }>('/api/workers/:workerId/jobs', async (request, reply) => {
    let job
    try {
      job = parseWorkerJobSubmission(request.body)
    } catch {
      return reply.code(400).send({ error: 'Invalid worker job request.' })
    }

    if (!registry.definition(job.catalogId)) {
      return reply.code(404).send({ error: 'Catalog not found.' })
    }

    const { workerId } = request.params
    try {
      const worker = requireWorker(workers, workerId)
      const capabilities = await worker.capabilities()
      if (!capabilities.operations.includes(job.operation)) {
        return reply.code(422).send({ error: 'Worker does not support this operation.' })
      }

      const accepted = await worker.submitJob({ ...job, requestId: job.requestId ?? randomUUID() })
      return reply.code(202).send(accepted)
    } catch (error) {
      if (error instanceof RouteError) return reply.code(error.statusCode).send({ error: error.message })
      request.log.warn({ workerId }, 'Worker job submission failed')
      return reply.code(502).send({ error: 'Worker request failed.' })
    }
  })

  app.get<{ Params: { workerId: string; jobId: string } }>(
    '/api/workers/:workerId/jobs/:jobId',
    async (request, reply) => {
      const { workerId, jobId } = request.params
      try {
        const job = await requireWorker(workers, workerId).getJob(jobId)
        if (job.jobId !== jobId) throw new WorkerProtocolError()
        return { job }
      } catch (error) {
        if (error instanceof RouteError) return reply.code(error.statusCode).send({ error: error.message })
        if (error instanceof WorkerRequestError && error.statusCode === 404) {
          return reply.code(404).send({ error: 'Job not found.' })
        }
        request.log.warn({ workerId }, 'Worker job request failed')
        return reply.code(502).send({ error: 'Worker request failed.' })
      }
    },
  )

  app.get<{ Params: RouteParams }>('/api/catalogs/:catalogId/status', async (request, reply) => {
    const { catalogId } = request.params
    return handleCatalogRequest(request, reply, catalogId, async () => {
      const client = requireClient(registry, catalogId)
      const config = await client.loadConfig()
      return {
        status: 'connected',
        endpoints: config.endpoints ?? [],
      }
    })
  })

  app.get<{ Params: RouteParams; Querystring: ListQuery }>(
    '/api/catalogs/:catalogId/namespaces',
    async (request, reply) => {
      const { catalogId } = request.params
      const query = request.query
      const parent = repeated(query.parent)

      return handleCatalogRequest(request, reply, catalogId, async () => {
        const client = requireClient(registry, catalogId)
        const options = pageOptions(query)
        const response = await client.listNamespaces({
          ...options,
          ...(parent.length > 0 ? { parent: { namespace: parent } } : {}),
        })
        return { namespaces: response.namespaces, nextPageToken: response.nextPageToken }
      })
    },
  )

  app.get<{ Params: RouteParams; Querystring: ListQuery }>(
    '/api/catalogs/:catalogId/tables',
    async (request, reply) => {
      const { catalogId } = request.params
      const namespace = repeated(request.query.namespace)
      if (namespace.length === 0) {
        return reply.code(400).send({ error: 'At least one namespace component is required.' })
      }

      return handleCatalogRequest(request, reply, catalogId, async () => {
        const client = requireClient(registry, catalogId)
        const options = pageOptions(request.query)
        const response = await client.listTables({ namespace }, options)
        return { tables: response.identifiers, nextPageToken: response.nextPageToken }
      })
    },
  )

  app.get<{ Params: RouteParams; Querystring: TableQuery }>(
    '/api/catalogs/:catalogId/table',
    async (request, reply) => {
      const { catalogId } = request.params
      const namespace = repeated(request.query.namespace)
      const name = request.query.name?.trim()
      if (namespace.length === 0 || !name) {
        return reply.code(400).send({ error: 'Namespace and table name are required.' })
      }

      return handleCatalogRequest(request, reply, catalogId, async () => {
        const client = requireClient(registry, catalogId)
        const metadata = await client.loadTable({ namespace, name }, { snapshots: 'all' })
        if (!metadata) throw new RouteError(404, 'Table not found.')
        return { table: tableSummary(metadata) }
      })
    },
  )
}
