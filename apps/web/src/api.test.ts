import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCatalog,
  deleteCatalog,
  getNamespaces,
  getTable,
  getTables,
  getWorkerJob,
  getWorkerStatus,
  getWorkers,
  submitWorkerJob,
} from './api'

describe('catalog API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('preserves each namespace component and cursor when listing namespaces', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ namespaces: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await getNamespaces('local', ['sales & marketing', 'raw/events'], 'next page')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalogs/local/namespaces?parent=sales+%26+marketing&parent=raw%2Fevents&pageToken=next+page&pageSize=100',
      { headers: { accept: 'application/json' } },
    )
  })

  it('preserves namespace components when listing tables and loading a table', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ tables: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ table: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await getTables('local', ['a.b', 'child'])
    await getTable('local', ['a.b', 'child'], 'table/name')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/catalogs/local/tables?namespace=a.b&namespace=child&pageSize=100')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/catalogs/local/table?namespace=a.b&namespace=child&name=table%2Fname')
  })

  it('shows safe server error messages and falls back to the HTTP status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Catalog request failed.' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getTables('local', ['analytics'])).rejects.toThrow('Catalog request failed.')
  })

  it('sends catalog connection fields without sending bearer token values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      catalog: { id: 'secure', name: 'Secure catalog' },
    }), { status: 201, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await createCatalog({
      id: 'secure',
      name: 'Secure catalog',
      uri: 'https://catalog.example.com',
      bearerTokenEnv: 'ICEBERG_TOKEN',
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/catalogs', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'secure',
        name: 'Secure catalog',
        uri: 'https://catalog.example.com',
        bearerTokenEnv: 'ICEBERG_TOKEN',
      }),
    })
  })

  it('encodes catalog ids when removing connections', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await deleteCatalog('local/catalog')

    expect(fetchMock).toHaveBeenCalledWith('/api/catalogs/local%2Fcatalog', {
      method: 'DELETE',
      headers: { accept: 'application/json' },
    })
  })

  it('loads worker status without exposing worker connection details', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ workers: [{ id: 'iceberg-go', name: 'Iceberg Go' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        worker: {
          id: 'iceberg-go',
          name: 'Iceberg Go',
          health: {
            protocolVersion: 1,
            status: 'ready',
            runtime: { language: 'go', version: '1.0.0', engine: 'iceberg-go', engineVersion: '0.1.0' },
          },
          capabilities: { protocolVersion: 1, operations: ['table.inspect'] },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const workers = await getWorkers()
    const response = await getWorkerStatus('iceberg/go')

    expect(workers).toEqual([{ id: 'iceberg-go', name: 'Iceberg Go' }])
    expect(response.worker.health.runtime.language).toBe('go')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/workers/iceberg%2Fgo/status')
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      headers: { accept: 'application/json' },
    })
  })

  it('submits and polls worker jobs using encoded path components', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ protocolVersion: 1, jobId: 'job-1', status: 'queued' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        job: { protocolVersion: 1, jobId: 'job/1', status: 'running', progress: 0.5 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await submitWorkerJob('iceberg/go', {
      protocolVersion: 1,
      operation: 'table.sample',
      catalogId: 'local',
      table: { namespace: ['analytics'], name: 'events' },
      options: { rowLimit: 10 },
    })
    const response = await getWorkerJob('iceberg/go', 'job/1')
    const submissionCall = fetchMock.mock.calls[0]
    if (!submissionCall) throw new Error('Worker submission request was not sent.')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/workers/iceberg%2Fgo/jobs')
    expect(JSON.parse((submissionCall[1] as RequestInit).body as string)).toMatchObject({
      operation: 'table.sample',
      options: { rowLimit: 10 },
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/workers/iceberg%2Fgo/jobs/job%2F1')
    expect(response.job.progress).toBe(0.5)
  })
})
