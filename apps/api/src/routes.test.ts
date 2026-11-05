import Fastify from 'fastify'
import type { TableMetadata } from 'iceberg-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogClient } from './catalogs.js'
import { CatalogRegistry } from './catalogs.js'
import { registerRoutes } from './routes.js'

const definitions = [{ id: 'local', name: 'Local catalog', uri: 'http://localhost:8181' }]

function tableMetadata(): TableMetadata {
  return {
    'format-version': 2,
    'table-uuid': 'table-uuid',
    location: 's3://private-bucket/table',
    'metadata-location': 's3://private-bucket/table/metadata/v3.metadata.json',
    'current-schema-id': 0,
    schemas: [{
      type: 'struct',
      'schema-id': 0,
      fields: [{ id: 1, name: 'event_id', type: 'long', required: true }],
    }],
    'partition-specs': [{ 'spec-id': 0, fields: [] }],
    'default-spec-id': 0,
    'sort-orders': [{ 'order-id': 0, fields: [] }],
    properties: {},
    'current-snapshot-id': 12,
    'last-updated-ms': 1_700_000_000_000,
    snapshots: [{
      'snapshot-id': 12,
      'timestamp-ms': 1_700_000_000_000,
      'manifest-list': 's3://private-bucket/table/metadata/snap-12.avro',
      summary: {
        operation: 'append',
        'added-data-files': '1',
        'private-note': 'must not be returned',
      },
    }],
    refs: { main: { type: 'branch', 'snapshot-id': 12 } },
  }
}

function makeClient(overrides: Partial<CatalogClient> = {}): CatalogClient {
  return {
    loadConfig: vi.fn().mockResolvedValue({
      defaults: {},
      overrides: {},
      endpoints: ['/v1/config', '/v1/namespaces', '/v1/tables'],
    }),
    listNamespaces: vi.fn().mockResolvedValue({ namespaces: [{ namespace: ['analytics'] }] }),
    listTables: vi.fn().mockResolvedValue({ identifiers: [{ namespace: ['analytics'], name: 'events' }] }),
    loadTable: vi.fn().mockResolvedValue(tableMetadata()),
    ...overrides,
  }
}

function makeApp(client: CatalogClient | null = makeClient()) {
  const app = Fastify({ logger: false })
  const registry = new CatalogRegistry(
    client ? definitions : [],
    {},
    () => client as CatalogClient,
  )
  registerRoutes(app, registry)
  return app
}

describe('catalog routes', () => {
  const apps: ReturnType<typeof makeApp>[] = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  it('returns catalog names without endpoint credentials', async () => {
    const client = makeClient()
    const app = makeApp(client)
    apps.push(app)

    const response = await app.inject({ url: '/api/catalogs' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ catalogs: [{ id: 'local', name: 'Local catalog' }] })
    expect(response.body).not.toContain('localhost:8181')
  })

  it('passes a nested namespace and paging options to the catalog client', async () => {
    const client = makeClient()
    const app = makeApp(client)
    apps.push(app)

    const response = await app.inject({
      url: '/api/catalogs/local/namespaces?parent=analytics&parent=events&pageSize=50&pageToken=next-page',
    })

    expect(response.statusCode).toBe(200)
    expect(client.listNamespaces).toHaveBeenCalledWith({
      pageSize: 50,
      pageToken: 'next-page',
      parent: { namespace: ['analytics', 'events'] },
    })
  })

  it('rejects invalid page sizes', async () => {
    const app = makeApp()
    apps.push(app)

    const response = await app.inject({ url: '/api/catalogs/local/namespaces?pageSize=5000' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'pageSize must be an integer between 1 and 1000.' })
  })

  it('requires a namespace before listing tables', async () => {
    const client = makeClient()
    const app = makeApp(client)
    apps.push(app)

    const response = await app.inject({ url: '/api/catalogs/local/tables' })

    expect(response.statusCode).toBe(400)
    expect(client.listTables).not.toHaveBeenCalled()
  })

  it('returns only safe table and snapshot metadata', async () => {
    const client = makeClient()
    const app = makeApp(client)
    apps.push(app)

    const response = await app.inject({
      url: '/api/catalogs/local/table?namespace=analytics&name=events',
    })

    expect(response.statusCode).toBe(200)
    expect(client.loadTable).toHaveBeenCalledWith(
      { namespace: ['analytics'], name: 'events' },
      { snapshots: 'all' },
    )
    expect(response.body).not.toContain('private-bucket')
    expect(response.body).not.toContain('private-note')
    expect(response.json().table).toMatchObject({
      formatVersion: 2,
      snapshotCount: 1,
      currentSnapshotId: 12,
      snapshots: [{
        snapshotId: 12,
        operation: 'append',
        summary: { 'added-data-files': '1' },
      }],
      refs: { main: { type: 'branch', 'snapshot-id': 12 } },
    })
  })

  it('treats the Iceberg -1 snapshot sentinel as no current snapshot', async () => {
    const metadata = tableMetadata()
    const client = makeClient({
      loadTable: vi.fn().mockResolvedValue({ ...metadata, 'current-snapshot-id': -1, snapshots: [] }),
    })
    const app = makeApp(client)
    apps.push(app)

    const response = await app.inject({
      url: '/api/catalogs/local/table?namespace=analytics&name=empty',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().table.currentSnapshotId).toBeUndefined()
    expect(response.json().table.snapshotCount).toBe(0)
  })

  it('does not return upstream error text or credentials', async () => {
    const client = makeClient({
      listNamespaces: vi.fn().mockRejectedValue(new Error('request failed with bearer private-token')),
    })
    const app = makeApp(client)
    apps.push(app)

    const response = await app.inject({ url: '/api/catalogs/local/namespaces' })

    expect(response.statusCode).toBe(502)
    expect(response.body).not.toContain('private-token')
    expect(response.json()).toEqual({ error: 'Iceberg catalog request failed.' })
  })

  it('returns 404 for catalogs that are not configured', async () => {
    const app = makeApp(null)
    apps.push(app)

    const response = await app.inject({ url: '/api/catalogs/missing/namespaces' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'Catalog not found.' })
  })

  it('returns advertised catalog capabilities without exposing raw config', async () => {
    const client = makeClient({
      loadConfig: vi.fn().mockResolvedValue({
        defaults: { 'client.secret': 'do-not-return' },
        overrides: { prefix: 'warehouse' },
        endpoints: ['/v1/config'],
      }),
    })
    const app = makeApp(client)
    apps.push(app)

    const response = await app.inject({ url: '/api/catalogs/local/status' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'connected', endpoints: ['/v1/config'] })
    expect(response.body).not.toContain('do-not-return')
  })
})
