import { IcebergRestCatalog } from 'iceberg-js'
import { z } from 'zod'

const catalogConfigSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  name: z.string().trim().min(1).max(100),
  uri: z.string().url(),
  warehouse: z.string().trim().min(1).optional(),
  bearerTokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
}).strict()

const catalogConfigListSchema = z.array(catalogConfigSchema)

export type CatalogDefinition = z.infer<typeof catalogConfigSchema>

export interface CatalogClient {
  loadConfig: IcebergRestCatalog['loadConfig']
  listNamespaces: IcebergRestCatalog['listNamespaces']
  listTables: IcebergRestCatalog['listTables']
  loadTable: IcebergRestCatalog['loadTable']
}

export interface PublicCatalog {
  id: string
  name: string
}

export type CatalogClientFactory = (
  definition: CatalogDefinition,
  environment: NodeJS.ProcessEnv,
) => CatalogClient

function validateCatalogUrl(uri: string): void {
  const url = new URL(uri)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Catalog URI must use HTTP or HTTPS.')
  }

  if (url.username || url.password || url.hash || url.search) {
    throw new Error('Catalog URI must not contain credentials, a query, or a fragment.')
  }
}

export function parseCatalogDefinitions(
  raw: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): CatalogDefinition[] {
  if (!raw?.trim()) return []

  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    throw new Error('ICEBERG_CATALOGS_JSON must contain valid JSON.')
  }

  const result = catalogConfigListSchema.safeParse(input)
  if (!result.success) {
    throw new Error('ICEBERG_CATALOGS_JSON has an invalid catalog configuration.')
  }

  const seenIds = new Set<string>()
  for (const definition of result.data) {
    if (seenIds.has(definition.id)) {
      throw new Error(`Catalog id "${definition.id}" is configured more than once.`)
    }
    seenIds.add(definition.id)

    try {
      validateCatalogUrl(definition.uri)
    } catch (error) {
      throw new Error(`Catalog "${definition.id}" has an invalid URI.`, { cause: error })
    }

    if (definition.bearerTokenEnv && !environment[definition.bearerTokenEnv]) {
      throw new Error(`Catalog "${definition.id}" is missing its configured bearer token.`)
    }
  }

  return result.data
}

function createIcebergClient(
  definition: CatalogDefinition,
  environment: NodeJS.ProcessEnv,
): CatalogClient {
  const token = definition.bearerTokenEnv
    ? environment[definition.bearerTokenEnv]
    : undefined

  return new IcebergRestCatalog({
    baseUrl: definition.uri,
    ...(definition.warehouse ? { warehouse: definition.warehouse } : {}),
    ...(token ? { auth: { type: 'bearer' as const, token } } : {}),
  })
}

export class CatalogRegistry {
  private readonly definitionsById: Map<string, CatalogDefinition>
  private readonly clientsById = new Map<string, CatalogClient>()

  constructor(
    definitions: CatalogDefinition[],
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly clientFactory: CatalogClientFactory = createIcebergClient,
  ) {
    this.definitionsById = new Map(definitions.map((definition) => [definition.id, definition]))
  }

  list(): PublicCatalog[] {
    return [...this.definitionsById.values()].map(({ id, name }) => ({ id, name }))
  }

  definition(id: string): CatalogDefinition | undefined {
    return this.definitionsById.get(id)
  }

  client(id: string): CatalogClient | undefined {
    const definition = this.definitionsById.get(id)
    if (!definition) return undefined

    let client = this.clientsById.get(id)
    if (!client) {
      client = this.clientFactory(definition, this.environment)
      this.clientsById.set(id, client)
    }

    return client
  }
}
