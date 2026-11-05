import { describe, expect, it } from 'vitest'
import { CatalogRegistry, parseCatalogDefinitions } from './catalogs.js'

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
})
