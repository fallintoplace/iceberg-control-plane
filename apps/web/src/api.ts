export interface Catalog {
  id: string
  name: string
}

export interface CatalogConnectionInput {
  id: string
  name: string
  uri: string
  warehouse?: string
  bearerTokenEnv?: string
}

export interface Worker {
  id: string
  name: string
}

export interface WorkerHealth {
  protocolVersion: 1
  status: 'ready' | 'degraded'
  runtime: {
    language: 'go' | 'java' | 'rust' | 'typescript' | 'other'
    version: string
    engine: string
    engineVersion: string
  }
}

export interface WorkerCapabilities {
  protocolVersion: 1
  operations: string[]
}

export interface WorkerStatus {
  worker: Worker & { health: WorkerHealth; capabilities: WorkerCapabilities }
}

export type WorkerJobSubmission =
  | { protocolVersion: 1; requestId?: string; operation: 'catalog.validate'; catalogId: string }
  | { protocolVersion: 1; requestId?: string; operation: 'table.inspect'; catalogId: string; table: TableIdentifier }
  | {
      protocolVersion: 1
      requestId?: string
      operation: 'table.sample'
      catalogId: string
      table: TableIdentifier
      options: { rowLimit: number }
    }
  | { protocolVersion: 1; requestId?: string; operation: 'tutorial.append'; catalogId: string }
  | { protocolVersion: 1; requestId?: string; operation: 'tutorial.reset'; catalogId: string }

export interface WorkerJobAccepted {
  protocolVersion: 1
  jobId: string
  status: 'queued' | 'running'
}

export interface WorkerJob {
  protocolVersion: 1
  jobId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  progress?: number
  result?: Record<string, unknown>
  error?: { code: string; message: string; retryable: boolean }
}

export interface NamespaceIdentifier {
  namespace: string[]
}

export interface TableIdentifier {
  namespace: string[]
  name: string
}

export interface CatalogStatus {
  status: 'connected'
  endpoints: string[]
}

export interface SnapshotSummary {
  snapshotId: number
  parentSnapshotId?: number
  timestampMs: number
  operation: string
  summary: Record<string, string>
}

export interface TableSummary {
  formatVersion: number
  lastUpdatedMs?: number
  currentSnapshotId?: number
  snapshotCount: number
  snapshotsTruncated: boolean
  snapshots: SnapshotSummary[]
  currentSchema?: {
    schemaId?: number
    fields: Array<{
      id: number
      name: string
      type: string | { type: string }
      required: boolean
    }>
  }
  currentPartitionSpec?: {
    specId?: number
    fields: Array<{ 'field-id'?: number; name: string; transform: string }>
  }
  refs: Record<string, { type: 'tag' | 'branch'; 'snapshot-id': number }>
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = Object.fromEntries(new Headers(init.headers).entries())
  headers.accept = 'application/json'
  const response = await fetch(path, {
    ...init,
    headers,
  })
  if (!response.ok) {
    let message = `Request failed (${response.status}).`
    try {
      const body = await response.json() as { error?: string }
      if (body.error) message = body.error
    } catch {
      // Keep the generic status message when the server does not return JSON.
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export async function getCatalogs(): Promise<Catalog[]> {
  const response = await request<{ catalogs: Catalog[] }>('/api/catalogs')
  return response.catalogs
}

export async function createCatalog(input: CatalogConnectionInput): Promise<Catalog> {
  const response = await request<{ catalog: Catalog }>('/api/catalogs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return response.catalog
}

export async function deleteCatalog(catalogId: string): Promise<void> {
  await request<{ deleted: true }>(`/api/catalogs/${encodeURIComponent(catalogId)}`, {
    method: 'DELETE',
  })
}

export async function getWorkers(): Promise<Worker[]> {
  const response = await request<{ workers: Worker[] }>('/api/workers')
  return response.workers
}

export function getWorkerStatus(workerId: string): Promise<WorkerStatus> {
  return request(`/api/workers/${encodeURIComponent(workerId)}/status`)
}

export function submitWorkerJob(workerId: string, job: WorkerJobSubmission): Promise<WorkerJobAccepted> {
  return request(`/api/workers/${encodeURIComponent(workerId)}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(job),
  })
}

export function getWorkerJob(workerId: string, jobId: string): Promise<{ job: WorkerJob }> {
  return request(`/api/workers/${encodeURIComponent(workerId)}/jobs/${encodeURIComponent(jobId)}`)
}

export function getCatalogStatus(catalogId: string): Promise<CatalogStatus> {
  return request(`/api/catalogs/${encodeURIComponent(catalogId)}/status`)
}

export function getNamespaces(
  catalogId: string,
  parent: string[],
  pageToken?: string,
): Promise<{ namespaces: NamespaceIdentifier[]; nextPageToken?: string }> {
  const query = new URLSearchParams()
  parent.forEach((part) => query.append('parent', part))
  if (pageToken) query.set('pageToken', pageToken)
  query.set('pageSize', '100')
  return request(`/api/catalogs/${encodeURIComponent(catalogId)}/namespaces?${query}`)
}

export function getTables(
  catalogId: string,
  namespace: string[],
  pageToken?: string,
): Promise<{ tables: TableIdentifier[]; nextPageToken?: string }> {
  const query = new URLSearchParams()
  namespace.forEach((part) => query.append('namespace', part))
  if (pageToken) query.set('pageToken', pageToken)
  query.set('pageSize', '100')
  return request(`/api/catalogs/${encodeURIComponent(catalogId)}/tables?${query}`)
}

export function getTable(
  catalogId: string,
  namespace: string[],
  name: string,
): Promise<{ table: TableSummary }> {
  const query = new URLSearchParams()
  namespace.forEach((part) => query.append('namespace', part))
  query.set('name', name)
  return request(`/api/catalogs/${encodeURIComponent(catalogId)}/table?${query}`)
}
