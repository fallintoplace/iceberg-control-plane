import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseWorkerDefinitions,
  WorkerProtocolError,
  WorkerRegistry,
  type WorkerClient,
} from './workers.js'

const workerConfig = [{ id: 'rust', name: 'Rust worker', uri: 'https://worker.example.com/prefix' }]

describe('parseWorkerDefinitions', () => {
  it('returns an empty list when no workers are configured', () => {
    expect(parseWorkerDefinitions(undefined)).toEqual([])
    expect(parseWorkerDefinitions('  ')).toEqual([])
  })

  it('rejects malformed config without including the submitted value', () => {
    expect(() => parseWorkerDefinitions('{"token":"private-value"')).toThrow(
      'ICEBERG_WORKERS_JSON must contain valid JSON.',
    )
  })

  it('rejects duplicate worker ids', () => {
    const config = JSON.stringify([
      workerConfig[0],
      { ...workerConfig[0], name: 'Second worker' },
    ])

    expect(() => parseWorkerDefinitions(config)).toThrow('configured more than once')
  })

  it('rejects non-HTTP URLs, embedded credentials, and query parameters', () => {
    const ftp = JSON.stringify([{ ...workerConfig[0], uri: 'ftp://worker.example.com' }])
    const credentials = JSON.stringify([{ ...workerConfig[0], uri: 'https://user:pass@worker.example.com' }])
    const query = JSON.stringify([{ ...workerConfig[0], uri: 'https://worker.example.com?token=private-value' }])

    expect(() => parseWorkerDefinitions(ftp)).toThrow('invalid URI')
    expect(() => parseWorkerDefinitions(credentials)).toThrow('invalid URI')
    expect(() => parseWorkerDefinitions(query)).toThrow('invalid URI')
  })

  it('requires a configured bearer token and returns no worker secrets publicly', () => {
    const config = JSON.stringify([{
      ...workerConfig[0],
      bearerTokenEnv: 'ICEBERG_WORKER_TOKEN',
    }])
    const environment = { ICEBERG_WORKER_TOKEN: 'private-token' }
    const definitions = parseWorkerDefinitions(config, environment)
    const client: WorkerClient = {
      health: vi.fn(),
      capabilities: vi.fn(),
      submitJob: vi.fn(),
      getJob: vi.fn(),
    }
    const registry = new WorkerRegistry(definitions, environment, () => client)

    expect(() => parseWorkerDefinitions(config, {})).toThrow('missing its configured bearer token')
    expect(registry.list()).toEqual([{ id: 'rust', name: 'Rust worker' }])
    expect(JSON.stringify(registry.list())).not.toContain('private-token')
    expect(JSON.stringify(registry.list())).not.toContain('worker.example.com')
  })
})

describe('HTTP worker client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('accepts optional tutorial operations from a local learning worker', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      protocolVersion: 1,
      operations: ['catalog.validate', 'table.inspect', 'table.sample', 'tutorial.append', 'tutorial.reset'],
    }), { status: 200 })))
    const client = new WorkerRegistry(parseWorkerDefinitions(JSON.stringify(workerConfig)), {}).client('rust')!

    await expect(client.capabilities()).resolves.toEqual({
      protocolVersion: 1,
      operations: ['catalog.validate', 'table.inspect', 'table.sample', 'tutorial.append', 'tutorial.reset'],
    })
  })

  it('uses the configured path prefix and worker token for health and capabilities', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        protocolVersion: 1,
        status: 'ready',
        runtime: { language: 'rust', version: '1.0.0', engine: 'iceberg-rust', engineVersion: '0.5.0' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        protocolVersion: 1,
        operations: ['catalog.validate', 'table.sample'],
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const environment = { ICEBERG_WORKER_TOKEN: 'private-token' }
    const definitions = parseWorkerDefinitions(JSON.stringify([{
      ...workerConfig[0],
      bearerTokenEnv: 'ICEBERG_WORKER_TOKEN',
    }]), environment)
    const client = new WorkerRegistry(definitions, environment).client('rust')!
    const [health, capabilities] = await Promise.all([client.health(), client.capabilities()])

    expect(health.runtime.language).toBe('rust')
    expect(capabilities.operations).toEqual(['catalog.validate', 'table.sample'])
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://worker.example.com/prefix/v1/health')
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('https://worker.example.com/prefix/v1/capabilities')
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const requestHeaders = requestInit.headers as Headers
    expect(requestHeaders.get('authorization')).toBe('Bearer private-token')
    expect(requestInit.redirect).toBe('error')
  })

  it('sends read-only job requests without catalog credentials and encodes job ids', async () => {
    const accepted = { protocolVersion: 1, jobId: 'job-1', status: 'queued' }
    const status = { protocolVersion: 1, jobId: 'job/one', status: 'succeeded', result: { rows: [] } }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(accepted), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(status), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new WorkerRegistry(parseWorkerDefinitions(JSON.stringify(workerConfig)), {}).client('rust')!

    const response = await client.submitJob({
      protocolVersion: 1,
      requestId: 'b56b146b-5dbf-46a7-ad5a-407768ec90d3',
      operation: 'table.sample',
      catalogId: 'local',
      table: { namespace: ['analytics'], name: 'events' },
      options: { rowLimit: 10 },
    })
    const job = await client.getJob('job/one')

    expect(response).toEqual(accepted)
    expect(job).toEqual(status)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://worker.example.com/prefix/v1/jobs')
    const jobRequest = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as Record<string, unknown>
    expect(jobRequest).toMatchObject({
      catalogId: 'local',
      operation: 'table.sample',
      options: { rowLimit: 10 },
    })
    expect(jobRequest).not.toHaveProperty('catalogCredentials')
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('https://worker.example.com/prefix/v1/jobs/job%2Fone')
  })

  it('rejects incompatible or malformed worker protocol responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      protocolVersion: 2,
      status: 'ready',
      runtime: { language: 'rust', version: '1.0.0', engine: 'iceberg-rust', engineVersion: '0.5.0' },
    }), { status: 200 })))
    const client = new WorkerRegistry(parseWorkerDefinitions(JSON.stringify(workerConfig)), {}).client('rust')!

    await expect(client.health()).rejects.toBeInstanceOf(WorkerProtocolError)
    await expect(client.health()).rejects.toThrow('Worker returned an invalid protocol response.')
  })

  it('rejects duplicated capabilities and failed jobs without error details', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        protocolVersion: 1,
        operations: ['table.inspect', 'table.inspect'],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        protocolVersion: 1,
        jobId: 'job-1',
        status: 'failed',
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new WorkerRegistry(parseWorkerDefinitions(JSON.stringify(workerConfig)), {}).client('rust')!

    await expect(client.capabilities()).rejects.toBeInstanceOf(WorkerProtocolError)
    await expect(client.getJob('job-1')).rejects.toBeInstanceOf(WorkerProtocolError)
  })

  it('hides worker error details from callers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('request used private-token')))
    const client = new WorkerRegistry(parseWorkerDefinitions(JSON.stringify(workerConfig)), {}).client('rust')!

    await expect(client.health()).rejects.toThrow('Worker request failed.')
  })

  it('redacts its bearer token from worker job errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      protocolVersion: 1,
      jobId: 'job-1',
      status: 'failed',
      error: { code: 'private-token-invalid', message: 'Request used private-token.', retryable: false },
    }), { status: 200 })))
    const environment = { ICEBERG_WORKER_TOKEN: 'private-token' }
    const definition = parseWorkerDefinitions(JSON.stringify([{
      ...workerConfig[0],
      bearerTokenEnv: 'ICEBERG_WORKER_TOKEN',
    }]), environment)
    const client = new WorkerRegistry(definition, environment).client('rust')!

    const job = await client.getJob('job-1')

    expect(job.error).toEqual({
      code: '[REDACTED]-invalid',
      message: 'Request used [REDACTED].',
      retryable: false,
    })
  })
})
