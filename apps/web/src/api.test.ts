import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCatalog, deleteCatalog, getNamespaces, getTable, getTables } from './api'

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
    expect(fetchMock.mock.calls[0]?.[1]?.body).not.toContain('actual-token-value')
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
})
