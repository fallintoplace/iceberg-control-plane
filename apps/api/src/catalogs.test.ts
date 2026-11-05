import { describe, expect, it, vi } from 'vitest'
import { CatalogRegistry, parseCatalogDefinitions, type CatalogDefinition } from './catalogs.js'

describe('parseCatalogDefinitions', () => {
  it('returns an empty list when no catalogs are configured', () => {
    expect(parseCatalogDefinitions(undefined)).toEqual([])
    expect(parseCatalogDefinitions('   ')).toEqual([])
  })

  it('rejects malformed JSON without including the configuration value in the error', () => {
    expect(() => parseCatalogDefinitions('{"bearer":"private-token"'))
      .toThrow('ICEBERG_CATALOGS_JSON must contain valid JSON.')
  })

  it('rejects duplicate ids', () => {
    const config = JSON.stringify([
      { id: 'catalog', name: 'First', uri: 'http://localhost:8181' },
      { id: 'catalog', name: 'Second', uri: 'http://localhost:8182' },
    ])

    expect(() => parseCatalogDefinitions(config)).toThrow('configured more than once')
  })

  it('requires HTTP or HTTPS catalog URLs without embedded credentials', () => {
    const ftpConfig = JSON.stringify([{ id: 'local', name: 'Local', uri: 'ftp://localhost/catalog' }])
    const userInfoConfig = JSON.stringify([{ id: 'local', name: 'Local', uri: 'https://user:pass@example.com/catalog' }])
    const queryConfig = JSON.stringify([{ id: 'local', name: 'Local', uri: 'https://catalog.example.com?token=secret' }])

    expect(() => parseCatalogDefinitions(ftpConfig)).toThrow('invalid URI')
    expect(() => parseCatalogDefinitions(userInfoConfig)).toThrow('invalid URI')
    expect(() => parseCatalogDefinitions(queryConfig)).toThrow('invalid URI')
  })

  it('requires any referenced bearer token to exist in the server environment', () => {
    const config = JSON.stringify([
      { id: 'secure', name: 'Secure catalog', uri: 'https://catalog.example.com', bearerTokenEnv: 'ICEBERG_TOKEN' },
    ])

    expect(() => parseCatalogDefinitions(config, {})).toThrow('missing its configured bearer token')
    expect(parseCatalogDefinitions(config, { ICEBERG_TOKEN: 'private-token' })).toHaveLength(1)
  })
})

describe('CatalogRegistry', () => {
  it('does not expose catalog credentials in its public list', () => {
    const definitions = parseCatalogDefinitions(JSON.stringify([
      { id: 'secure', name: 'Secure catalog', uri: 'https://catalog.example.com', bearerTokenEnv: 'ICEBERG_TOKEN' },
    ]), { ICEBERG_TOKEN: 'private-token' })
    const registry = new CatalogRegistry(definitions, { ICEBERG_TOKEN: 'private-token' }, () => ({
      loadConfig: async () => ({ defaults: {}, overrides: {} }),
      listNamespaces: async () => ({ namespaces: [] }),
      listTables: async () => ({ identifiers: [] }),
      loadTable: async () => { throw new Error('not used') },
    }))

    expect(JSON.stringify(registry.list())).not.toContain('private-token')
    expect(registry.list()).toEqual([{ id: 'secure', name: 'Secure catalog' }])
  })

  it('serializes concurrent catalog changes before persisting them', async () => {
    const first: CatalogDefinition = { id: 'first', name: 'First', uri: 'https://first.example.com' }
    const second: CatalogDefinition = { id: 'second', name: 'Second', uri: 'https://second.example.com' }
    const persisted: string[][] = []
    const persist = vi.fn(async (definitions: CatalogDefinition[]) => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      persisted.push(definitions.map((definition) => definition.id))
    })
    const registry = new CatalogRegistry([], {}, undefined, persist)

    await Promise.all([registry.add(first), registry.add(second)])

    expect(registry.list()).toEqual([
      { id: 'first', name: 'First' },
      { id: 'second', name: 'Second' },
    ])
    expect(persisted).toEqual([['first'], ['first', 'second']])
  })

  it('does not publish a catalog when persistence fails', async () => {
    const definition: CatalogDefinition = { id: 'failed', name: 'Failed', uri: 'https://failed.example.com' }
    const registry = new CatalogRegistry([], {}, undefined, async () => {
      throw new Error('disk failure')
    })

    await expect(registry.add(definition)).rejects.toThrow('disk failure')
    expect(registry.list()).toEqual([])
  })

  it('persists only one catalog when duplicate adds race', async () => {
    const definition: CatalogDefinition = { id: 'same', name: 'Same', uri: 'https://same.example.com' }
    const persist = vi.fn().mockResolvedValue(undefined)
    const registry = new CatalogRegistry([], {}, undefined, persist)

    const results = await Promise.allSettled([registry.add(definition), registry.add(definition)])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(registry.list()).toEqual([{ id: 'same', name: 'Same' }])
  })

  it('does not remove a catalog when persistence fails', async () => {
    const definition = { id: 'local', name: 'Local', uri: 'https://local.example.com' }
    const registry = new CatalogRegistry([definition], {}, undefined, async () => {
      throw new Error('disk failure')
    })

    await expect(registry.remove('local')).rejects.toThrow('disk failure')
    expect(registry.list()).toEqual([{ id: 'local', name: 'Local' }])
  })
})
