import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseCatalogDefinitions } from './catalogs.js'
import { FileCatalogStore } from './catalog-store.js'

describe('FileCatalogStore', () => {
  const directories: string[] = []

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  async function makeDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'iceberg-control-plane-'))
    directories.push(directory)
    return directory
  }

  it('returns undefined when the config file does not exist', async () => {
    const directory = await makeDirectory()
    const store = new FileCatalogStore(join(directory, 'catalogs.json'))

    await expect(store.load({})).resolves.toBeUndefined()
  })

  it('creates nested directories and saves config with owner-only permissions', async () => {
    const directory = await makeDirectory()
    const filePath = join(directory, 'nested', 'catalogs.json')
    const store = new FileCatalogStore(filePath)

    await store.save([{ id: 'local', name: 'Local', uri: 'http://localhost:8181' }])

    expect(await store.load({})).toEqual([
      { id: 'local', name: 'Local', uri: 'http://localhost:8181' },
    ])
    expect((await stat(filePath)).mode & 0o777).toBe(0o600)
    expect(await readdir(join(directory, 'nested'))).toEqual(['catalogs.json'])
  })

  it('stores token environment variable names but never the token values', async () => {
    const directory = await makeDirectory()
    const filePath = join(directory, 'catalogs.json')
    const store = new FileCatalogStore(filePath)
    const environment = { ICEBERG_SECRET: 'actual-secret-value' }
    const definitions = parseCatalogDefinitions(JSON.stringify([{
      id: 'secure',
      name: 'Secure',
      uri: 'https://catalog.example.com',
      bearerTokenEnv: 'ICEBERG_SECRET',
    }]), environment)

    await store.save(definitions)
    const contents = await readFile(filePath, 'utf8')

    expect(contents).toContain('ICEBERG_SECRET')
    expect(contents).not.toContain('actual-secret-value')
    expect(await store.load(environment)).toEqual(definitions)
  })

  it('rejects unsafe saved URLs without echoing their query values', async () => {
    const directory = await makeDirectory()
    const filePath = join(directory, 'catalogs.json')
    const store = new FileCatalogStore(filePath)
    await writeFile(filePath, JSON.stringify([{
      id: 'unsafe',
      name: 'Unsafe',
      uri: 'https://catalog.example.com?token=private-value',
    }]))

    await expect(store.load({})).rejects.toThrow('invalid URI')
    await expect(store.load({})).rejects.not.toThrow('private-value')
  })

  it('rejects malformed saved JSON without echoing file contents', async () => {
    const directory = await makeDirectory()
    const filePath = join(directory, 'catalogs.json')
    const store = new FileCatalogStore(filePath)
    await writeFile(filePath, '{"token":"private-value"')

    await expect(store.load({})).rejects.toThrow('Saved catalog file must contain valid JSON.')
    await expect(store.load({})).rejects.not.toThrow('private-value')
  })

  it('treats an explicitly saved empty catalog list as configured', async () => {
    const directory = await makeDirectory()
    const store = new FileCatalogStore(join(directory, 'catalogs.json'))

    await store.save([])

    await expect(store.load({ ICEBERG_CATALOGS_JSON: '[{"invalid":true}]' })).resolves.toEqual([])
  })
})
