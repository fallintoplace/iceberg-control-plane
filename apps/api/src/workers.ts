import { z } from 'zod'

const workerDefinitionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  name: z.string().trim().min(1).max(100),
  uri: z.string().url(),
  bearerTokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
}).strict()

const workerHealthSchema = z.object({
  protocolVersion: z.literal(1),
  status: z.enum(['ready', 'degraded']),
  runtime: z.object({
    language: z.enum(['go', 'java', 'rust', 'typescript', 'other']),
    version: z.string().min(1),
    engine: z.string().min(1),
    engineVersion: z.string().min(1),
  }).strict(),
}).strict()

const workerCapabilitiesSchema = z.object({
  protocolVersion: z.literal(1),
  operations: z.array(z.enum(['catalog.validate', 'table.inspect', 'table.sample'])).max(3),
}).strict().superRefine((capabilities, context) => {
  if (new Set(capabilities.operations).size !== capabilities.operations.length) {
    context.addIssue({ code: 'custom', message: 'Worker operations must be unique.' })
  }
})

const tableIdentifierSchema = z.object({
  namespace: z.array(z.string().min(1)).min(1).max(50),
  name: z.string().trim().min(1).max(255),
}).strict()

const jobBaseSchema = z.object({
  protocolVersion: z.literal(1),
  requestId: z.string().uuid().optional(),
  catalogId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
})

export const workerJobSubmissionSchema = z.discriminatedUnion('operation', [
  jobBaseSchema.extend({ operation: z.literal('catalog.validate') }).strict(),
  jobBaseSchema.extend({
    operation: z.literal('table.inspect'),
    table: tableIdentifierSchema,
  }).strict(),
  jobBaseSchema.extend({
    operation: z.literal('table.sample'),
    table: tableIdentifierSchema,
    options: z.object({ rowLimit: z.number().int().min(1).max(100) }).strict(),
  }).strict(),
])

const workerJobAcceptedSchema = z.object({
  protocolVersion: z.literal(1),
  jobId: z.string().min(1),
  status: z.enum(['queued', 'running']),
}).strict()

const workerJobStatusSchema = z.object({
  protocolVersion: z.literal(1),
  jobId: z.string().min(1),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  progress: z.number().min(0).max(1).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.object({
    code: z.string().min(1).max(100),
    message: z.string().max(500),
    retryable: z.boolean(),
  }).strict().optional(),
}).strict().superRefine((job, context) => {
  if (job.status === 'succeeded' && !job.result) {
    context.addIssue({ code: 'custom', message: 'Succeeded jobs must include a result.' })
  }
  if (job.status === 'failed' && !job.error) {
    context.addIssue({ code: 'custom', message: 'Failed jobs must include an error.' })
  }
})

const workerListSchema = z.array(workerDefinitionSchema).max(100)

export type WorkerDefinition = z.infer<typeof workerDefinitionSchema>
export type WorkerHealth = z.infer<typeof workerHealthSchema>
export type WorkerCapabilities = z.infer<typeof workerCapabilitiesSchema>
export type WorkerJobSubmission = z.infer<typeof workerJobSubmissionSchema>
export type WorkerJobAccepted = z.infer<typeof workerJobAcceptedSchema>
export type WorkerJobStatus = z.infer<typeof workerJobStatusSchema>

export interface PublicWorker {
  id: string
  name: string
}

export interface WorkerClient {
  health(): Promise<WorkerHealth>
  capabilities(): Promise<WorkerCapabilities>
  submitJob(job: WorkerJobSubmission & { requestId: string }): Promise<WorkerJobAccepted>
  getJob(jobId: string): Promise<WorkerJobStatus>
}

export type WorkerClientFactory = (
  definition: WorkerDefinition,
  environment: NodeJS.ProcessEnv,
) => WorkerClient

export class WorkerRequestError extends Error {
  constructor(readonly statusCode?: number) {
    super('Worker request failed.')
  }
}

export class WorkerProtocolError extends Error {
  constructor() {
    super('Worker returned an invalid protocol response.')
  }
}

function validateWorkerUrl(uri: string): void {
  const url = new URL(uri)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Worker URI must use HTTP or HTTPS.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Worker URI must not contain credentials, a query, or a fragment.')
  }
}

export function parseWorkerDefinitions(
  raw: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): WorkerDefinition[] {
  if (!raw?.trim()) return []

  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    throw new Error('ICEBERG_WORKERS_JSON must contain valid JSON.')
  }

  const result = workerListSchema.safeParse(input)
  if (!result.success) throw new Error('ICEBERG_WORKERS_JSON has an invalid worker configuration.')

  const seenIds = new Set<string>()
  for (const worker of result.data) {
    if (seenIds.has(worker.id)) throw new Error(`Worker id "${worker.id}" is configured more than once.`)
    seenIds.add(worker.id)

    try {
      validateWorkerUrl(worker.uri)
    } catch (error) {
      throw new Error(`Worker "${worker.id}" has an invalid URI.`, { cause: error })
    }

    if (worker.bearerTokenEnv && !environment[worker.bearerTokenEnv]) {
      throw new Error(`Worker "${worker.id}" is missing its configured bearer token.`)
    }
  }

  return result.data
}

class HttpWorkerClient implements WorkerClient {
  private readonly baseUrl: string
  private readonly bearerToken: string | undefined

  constructor(
    definition: WorkerDefinition,
    environment: NodeJS.ProcessEnv,
    private readonly timeoutMs = 5000,
  ) {
    this.baseUrl = definition.uri.endsWith('/') ? definition.uri : `${definition.uri}/`
    this.bearerToken = definition.bearerTokenEnv
      ? environment[definition.bearerTokenEnv]
      : undefined
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
    expectedStatus = 200,
  ): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('accept', 'application/json')
    if (this.bearerToken) headers.set('authorization', `Bearer ${this.bearerToken}`)

    let response: Response
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        ...init,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      throw new WorkerRequestError()
    }

    if (!response.ok) throw new WorkerRequestError(response.status)
    if (response.status !== expectedStatus) throw new WorkerProtocolError()

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new WorkerProtocolError()
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new WorkerProtocolError()
    return parsed.data
  }

  health(): Promise<WorkerHealth> {
    return this.request('v1/health', workerHealthSchema)
  }

  capabilities(): Promise<WorkerCapabilities> {
    return this.request('v1/capabilities', workerCapabilitiesSchema)
  }

  submitJob(job: WorkerJobSubmission & { requestId: string }): Promise<WorkerJobAccepted> {
    return this.request('v1/jobs', workerJobAcceptedSchema, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(job),
    }, 202)
  }

  async getJob(jobId: string): Promise<WorkerJobStatus> {
    const job = await this.request(`v1/jobs/${encodeURIComponent(jobId)}`, workerJobStatusSchema)
    const bearerToken = this.bearerToken
    if (!job.error || !bearerToken) return job

    const redact = (value: string) => value.split(bearerToken).join('[REDACTED]')
    return { ...job, error: { ...job.error, code: redact(job.error.code), message: redact(job.error.message) } }
  }
}

function createHttpWorkerClient(
  definition: WorkerDefinition,
  environment: NodeJS.ProcessEnv,
): WorkerClient {
  return new HttpWorkerClient(definition, environment)
}

export class WorkerRegistry {
  private readonly definitionsById: Map<string, WorkerDefinition>
  private readonly clientsById = new Map<string, WorkerClient>()

  constructor(
    definitions: WorkerDefinition[],
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly clientFactory: WorkerClientFactory = createHttpWorkerClient,
  ) {
    this.definitionsById = new Map(definitions.map((definition) => [definition.id, definition]))
  }

  list(): PublicWorker[] {
    return [...this.definitionsById.values()].map(({ id, name }) => ({ id, name }))
  }

  definition(id: string): WorkerDefinition | undefined {
    return this.definitionsById.get(id)
  }

  client(id: string): WorkerClient | undefined {
    const definition = this.definition(id)
    if (!definition) return undefined

    let client = this.clientsById.get(id)
    if (!client) {
      client = this.clientFactory(definition, this.environment)
      this.clientsById.set(id, client)
    }

    return client
  }
}

export function parseWorkerJobSubmission(input: unknown): WorkerJobSubmission {
  return workerJobSubmissionSchema.parse(input)
}

export function parseWorkerJobAccepted(input: unknown): WorkerJobAccepted {
  return workerJobAcceptedSchema.parse(input)
}

export function parseWorkerJobStatus(input: unknown): WorkerJobStatus {
  return workerJobStatusSchema.parse(input)
}
