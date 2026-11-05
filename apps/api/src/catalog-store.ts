import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseCatalogDefinitions, type CatalogDefinition } from './catalogs.js'

export class FileCatalogStore {
  constructor(private readonly filePath: string) {}

  async load(environment: NodeJS.ProcessEnv): Promise<CatalogDefinition[] | undefined> {
    let contents: string
    try {
      contents = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return undefined
      }
      throw error
    }

    return parseCatalogDefinitions(contents, environment, 'Saved catalog file')
  }

  async save(definitions: CatalogDefinition[]): Promise<void> {
    const directory = dirname(this.filePath)
    await mkdir(directory, { recursive: true })

    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(definitions, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      })
      await rename(temporaryPath, this.filePath)
    } finally {
      try {
        await unlink(temporaryPath)
      } catch (error) {
        if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ENOENT') {
          throw error
        }
      }
    }
  }
}
