import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogRegistry, parseCatalogDefinitions } from './catalogs.js'
import { registerRoutes } from './routes.js'
import {
  parseWorkerDefinitions,
  WorkerRegistry,
  WorkerRequestError,
  type WorkerClient,
} from './workers.js'

const environment = { ICEBERG_WORKER_TOKEN: 'private-worker-token' }
const workerDefinitions = parseWorkerDefinitions(JSON.stringify([{
  id: 'rust',
  name: 'Rust worker',
  uri: 'http://localhost:8090',
  bearerTokenEnv: 'ICEBERG_WORKER_TOKEN',
}]), environment)
const workerHealth = {
  protocolVersion: 1 as const,
  status: 'ready' as const,
  runtime: { language: 'rust' as const, version: '1.0.0', engine: 'iceberg-rust', engineVersion: '0.5.0' },
}
const workerCapabilities = {
  protocolVersion: 1 as const,
  operations: ['catalog.validate', 'table.inspect', 'table.sample'],
}

function makeApp(overrides: Partial<WorkerClient> = {}) {
  const app = Fastify({ logger: false })
  const worker: WorkerClient = {
    health: vi.fn().mockResolvedValue(workerHealth),
    capabilities: vi.fn().mockResolvedValue(workerCapabilities),
    submitJob: vi.fn().mockResolvedValue({ protocolVersion: 1, jobId: 'job-1', status: 'queued' }),
    getJob: vi.fn().mockResolvedValue({
      protocolVersion: 1,
      jobId: 'job-1',
      status: 'succeeded',
      result: { rows: [{ id: 1 }] },
    }),
    ...overrides,
  }
  const catalogs = new CatalogRegistry(
    parseCatalogDefinitions(JSON.stringify([{ id: 'local', name: 'Local', uri: 'http://localhost:8181' }])),
    {},
  )
  const workers = new WorkerRegistry(workerDefinitions, environment, () => worker)
  registerRoutes(app, catalogs, environment, workers)
  return { app, worker }
}

describe('worker routes', () => {
  const apps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  it('lists worker names without returning URLs or bearer tokens', async () => {
    const { app } = makeApp()
    apps.push(app)

    const response = await app.inject({ url: '/api/workers' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ workers: [{ id: 'rust', name: 'Rust worker' }] })
    expect(response.body).not.toContain('localhost:8090')
    expect(response.body).not.toContain('private-worker-token')
  })

  it('returns worker language, engine, and capabilities', async () => {
    const { app, worker } = makeApp()
    apps.push(app)

    const response = await app.inject({ url: '/api/workers/rust/status' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      worker: { id: 'rust', name: 'Rust worker', health: workerHealth, capabilities: workerCapabilities },
    })
    expect(worker.health).toHaveBeenCalledOnce()
    expect(worker.capabilities).toHaveBeenCalledOnce()
  })

  it('accepts a supported read-only job and supplies an idempotency key', async () => {
    const { app, worker } = makeApp()
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/workers/rust/jobs',
      payload: { protocolVersion: 1, operation: 'table.inspect', catalogId: 'local', table: { namespace: ['analytics'], name: 'events' } },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ protocolVersion: 1, jobId: 'job-1', status: 'queued' })
    expect(worker.submitJob).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'table.inspect',
      catalogId: 'local',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }))
  })

  it('rejects invalid row limits before contacting the worker', async () => {
    const { app, worker } = makeApp()
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/workers/rust/jobs',
      payload: {
        protocolVersion: 1,
        operation: 'table.sample',
        catalogId: 'local',
        table: { namespace: ['analytics'], name: 'events' },
        options: { rowLimit: 101 },
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'Invalid worker job request.' })
    expect(worker.capabilities).not.toHaveBeenCalled()
    expect(worker.submitJob).not.toHaveBeenCalled()
  })

  it('requires a configured catalog before submitting a job', async () => {
    const { app, worker } = makeApp()
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/workers/rust/jobs',
      payload: { protocolVersion: 1, operation: 'catalog.validate', catalogId: 'missing' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'Catalog not found.' })
    expect(worker.capabilities).not.toHaveBeenCalled()
  })

  it('does not send operations the worker did not advertise', async () => {
    const { app, worker } = makeApp({
      capabilities: vi.fn().mockResolvedValue({ protocolVersion: 1, operations: ['catalog.validate'] }),
    })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/workers/rust/jobs',
      payload: { protocolVersion: 1, operation: 'table.inspect', catalogId: 'local', table: { namespace: ['analytics'], name: 'events' } },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({ error: 'Worker does not support this operation.' })
    expect(worker.submitJob).not.toHaveBeenCalled()
  })

  it('returns worker job state', async () => {
    const { app, worker } = makeApp()
    apps.push(app)

    const response = await app.inject({ url: '/api/workers/rust/jobs/job-1' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      job: { protocolVersion: 1, jobId: 'job-1', status: 'succeeded', result: { rows: [{ id: 1 }] } },
    })
    expect(worker.getJob).toHaveBeenCalledWith('job-1')
  })

  it('preserves encoded separators in worker job ids', async () => {
    const { app, worker } = makeApp({
      getJob: vi.fn().mockResolvedValue({
        protocolVersion: 1,
        jobId: 'job/one',
        status: 'running',
      }),
    })
    apps.push(app)

    const response = await app.inject({ url: '/api/workers/rust/jobs/job%2Fone' })

    expect(response.statusCode).toBe(200)
    expect(worker.getJob).toHaveBeenCalledWith('job/one')
  })

  it('maps missing upstream jobs to a safe not-found response', async () => {
    const { app } = makeApp({ getJob: vi.fn().mockRejectedValue(new WorkerRequestError(404)) })
    apps.push(app)

    const response = await app.inject({ url: '/api/workers/rust/jobs/missing' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'Job not found.' })
  })

  it('hides worker failure details from the API response', async () => {
    const { app } = makeApp({ health: vi.fn().mockRejectedValue(new Error('failed with private token')) })
    apps.push(app)

    const response = await app.inject({ url: '/api/workers/rust/status' })

    expect(response.statusCode).toBe(502)
    expect(response.body).not.toContain('private token')
    expect(response.json()).toEqual({ error: 'Worker request failed.' })
  })

  it('returns not found for unconfigured workers', async () => {
    const { app } = makeApp()
    apps.push(app)

    const response = await app.inject({ url: '/api/workers/missing/status' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'Worker not found.' })
  })
})
