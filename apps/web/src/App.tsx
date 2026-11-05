import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  createCatalog,
  deleteCatalog,
  getCatalogStatus,
  getCatalogs,
  getNamespaces,
  getTable,
  getTables,
  type NamespaceIdentifier,
  type TableIdentifier,
  type TableSummary,
} from './api'
import './App.css'

function namespaceKey(namespace: string[]): string {
  return namespace.join('\u001f')
}

function formatDate(timestampMs: number | undefined): string {
  if (timestampMs === undefined) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestampMs)
}

function Loading({ label }: { label: string }) {
  return <p className="muted" role="status">Loading {label}…</p>
}

function ErrorMessage({ message }: { message: string }) {
  return <p className="error-message" role="alert">{message}</p>
}

function EmptyCatalogs() {
  return (
    <main className="empty-state">
      <div className="empty-icon" aria-hidden="true">◇</div>
      <p className="eyebrow">No catalogs configured</p>
      <h1>Connect a REST catalog to get started</h1>
      <p>Connect a REST catalog to browse its namespaces, tables, and table metadata.</p>
      <Link className="primary-button" to="/settings">Add a catalog</Link>
      <a href="https://iceberg.apache.org/rest-catalog-spec/" target="_blank" rel="noreferrer">Read the Iceberg REST Catalog spec ↗</a>
    </main>
  )
}

interface CatalogForm {
  id: string
  name: string
  uri: string
  warehouse: string
  bearerTokenEnv: string
}

const emptyCatalogForm: CatalogForm = {
  id: '',
  name: '',
  uri: '',
  warehouse: '',
  bearerTokenEnv: '',
}

function CatalogSettings() {
  const queryClient = useQueryClient()
  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs })
  const [form, setForm] = useState(emptyCatalogForm)
  const [saved, setSaved] = useState(false)
  const addCatalog = useMutation({
    mutationFn: createCatalog,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      setForm(emptyCatalogForm)
      setSaved(true)
    },
  })
  const removeCatalog = useMutation({
    mutationFn: deleteCatalog,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalogs'] }),
  })

  const updateField = (field: keyof CatalogForm, value: string) => {
    setSaved(false)
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaved(false)
    const input = {
      id: form.id,
      name: form.name,
      uri: form.uri,
      ...(form.warehouse.trim() ? { warehouse: form.warehouse.trim() } : {}),
      ...(form.bearerTokenEnv.trim() ? { bearerTokenEnv: form.bearerTokenEnv.trim() } : {}),
    }
    addCatalog.mutate(input)
  }

  return (
    <div className="settings-page">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Iceberg Control Plane home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>Iceberg <strong>Control Plane</strong></span>
        </Link>
        <Link className="back-button" to="/">Back to explorer</Link>
      </header>
      <main className="settings-content">
        <div className="page-heading">
          <div><p className="eyebrow">Configuration</p><h1>Catalog connections</h1></div>
          <span className="read-only-badge"><span />Catalog data stays read only</span>
        </div>

        <section className="section-card">
          <div className="content-title"><p className="eyebrow">New connection</p><h2>Add an Iceberg REST catalog</h2></div>
          <form className="catalog-form" onSubmit={handleSubmit}>
            <label>
              <span className="field-label">Catalog ID</span>
              <input autoComplete="off" maxLength={64} onChange={(event) => updateField('id', event.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" required value={form.id} />
              <small>Use letters, numbers, hyphens, or underscores.</small>
            </label>
            <label>
              <span className="field-label">Display name</span>
              <input maxLength={100} onChange={(event) => updateField('name', event.target.value)} required value={form.name} />
            </label>
            <label className="form-wide">
              <span className="field-label">REST catalog URL</span>
              <input autoComplete="url" onChange={(event) => updateField('uri', event.target.value)} placeholder="https://catalog.example.com" required type="url" value={form.uri} />
            </label>
            <label>
              <span className="field-label">Warehouse <span className="optional-label">Optional</span></span>
              <input autoComplete="off" onChange={(event) => updateField('warehouse', event.target.value)} value={form.warehouse} />
            </label>
            <label>
              <span className="field-label">Bearer token environment variable <span className="optional-label">Optional</span></span>
              <input autoComplete="off" onChange={(event) => updateField('bearerTokenEnv', event.target.value)} placeholder="ICEBERG_PRODUCTION_TOKEN" value={form.bearerTokenEnv} />
              <small>Add the token to the API environment and restart it before saving. The token itself is never sent to this form.</small>
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={addCatalog.isPending} type="submit">
                {addCatalog.isPending ? 'Saving…' : 'Save catalog'}
              </button>
              {saved && <span className="success-message" role="status">Catalog saved.</span>}
            </div>
            {addCatalog.isError && <ErrorMessage message={addCatalog.error.message} />}
          </form>
        </section>

        <section className="section-card">
          <div className="section-title-row content-title">
            <div><p className="eyebrow">Saved locally</p><h2>Configured catalogs</h2></div>
            <span className="count-pill">{catalogs.data?.length ?? 0}</span>
          </div>
          {catalogs.isPending && <Loading label="catalogs" />}
          {catalogs.isError && <ErrorMessage message="Could not load configured catalogs." />}
          {catalogs.data?.length === 0 && <p className="muted">No catalogs are configured yet.</p>}
          {catalogs.data && catalogs.data.length > 0 && (
            <div className="configured-catalog-list">
              {catalogs.data.map((catalog) => (
                <div className="configured-catalog" key={catalog.id}>
                  <span className="catalog-initial" aria-hidden="true">{catalog.name.slice(0, 1).toUpperCase()}</span>
                  <span className="configured-catalog-name"><strong>{catalog.name}</strong><code>{catalog.id}</code></span>
                  <button
                    className="remove-button"
                    disabled={removeCatalog.isPending}
                    onClick={() => removeCatalog.mutate(catalog.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {removeCatalog.isError && <ErrorMessage message={removeCatalog.error.message} />}
        </section>
        <p className="settings-footnote">Catalog connection settings are stored in a local file on this server. Keep this app on a trusted machine.</p>
      </main>
    </div>
  )
}

function Home() {
  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs })

  if (catalogs.isPending) return <Loading label="catalogs" />
  if (catalogs.isError) return <ErrorMessage message={catalogs.error.message} />
  if (catalogs.data.length === 0) return <EmptyCatalogs />

  return <Navigate to={`/catalog/${encodeURIComponent(catalogs.data[0]!.id)}`} replace />
}

function NamespaceLink({
  namespace,
  selected,
  onSelect,
}: {
  namespace: NamespaceIdentifier
  selected: string[]
  onSelect: (parts: string[]) => void
}) {
  const active = namespaceKey(namespace.namespace) === namespaceKey(selected)
  const name = namespace.namespace.at(-1) ?? namespace.namespace.join('.')

  return (
    <button
      className={`namespace-link${active ? ' is-active' : ''}`}
      onClick={() => onSelect(namespace.namespace)}
      type="button"
      title={namespace.namespace.join('.')}
    >
      <span className="namespace-glyph" aria-hidden="true">▦</span>
      <span>{name}</span>
    </button>
  )
}

function CatalogExplorer() {
  const { catalogId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedNamespace = searchParams.getAll('namespace')
  const selectedTable = searchParams.get('table')

  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs })
  const catalog = catalogs.data?.find((candidate) => candidate.id === catalogId)
  const status = useQuery({
    queryKey: ['catalog-status', catalogId],
    queryFn: () => getCatalogStatus(catalogId),
    enabled: Boolean(catalog),
    staleTime: 30_000,
  })
  const namespaces = useInfiniteQuery({
    queryKey: ['namespaces', catalogId, namespaceKey(selectedNamespace)],
    queryFn: ({ pageParam }) => getNamespaces(catalogId, selectedNamespace, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    enabled: Boolean(catalog),
  })
  const tables = useInfiniteQuery({
    queryKey: ['tables', catalogId, namespaceKey(selectedNamespace)],
    queryFn: ({ pageParam }) => getTables(catalogId, selectedNamespace, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    enabled: Boolean(catalog && selectedNamespace.length > 0),
  })
  const table = useQuery({
    queryKey: ['table', catalogId, namespaceKey(selectedNamespace), selectedTable],
    queryFn: () => getTable(catalogId, selectedNamespace, selectedTable!),
    enabled: Boolean(catalog && selectedTable && selectedNamespace.length > 0),
  })

  const setLocation = (namespace: string[], tableName?: string) => {
    const next = new URLSearchParams()
    namespace.forEach((part) => next.append('namespace', part))
    if (tableName) next.set('table', tableName)
    setSearchParams(next)
  }

  if (catalogs.isPending) return <Loading label="catalogs" />
  if (catalogs.isError) return <ErrorMessage message={catalogs.error.message} />
  if (catalogs.data.length === 0) return <EmptyCatalogs />
  if (!catalog) return <ErrorMessage message="This catalog is not configured on the server." />

  const namespaceItems = namespaces.data?.pages.flatMap((page) => page.namespaces) ?? []
  const tableItems = tables.data?.pages.flatMap((page) => page.tables) ?? []
  const parentNamespace = selectedNamespace.slice(0, -1)

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Iceberg Control Plane home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>Iceberg <strong>Control Plane</strong></span>
        </Link>
        <div className="topbar-right">
          <span className="read-only-badge"><span />Read only</span>
          <Link className="topbar-link" to="/settings">Manage catalogs</Link>
          <span className="topbar-caption">Catalog operations</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-section">
            <label className="field-label" htmlFor="catalog-select">Catalog</label>
            <select
              id="catalog-select"
              value={catalog.id}
              onChange={(event) => navigate(`/catalog/${encodeURIComponent(event.target.value)}`)}
            >
              {catalogs.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <div className={`connection-state ${status.data ? 'connected' : status.isError ? 'disconnected' : ''}`}>
              <span className="connection-dot" />
              {status.isPending ? 'Checking connection' : status.isError ? 'Connection unavailable' : 'Connected'}
            </div>
            {status.isError && <p className="sidebar-error">Check the catalog URI and server credentials.</p>}
          </div>

          <div className="sidebar-section namespace-section">
            <div className="section-title-row">
              <span className="field-label">Namespaces</span>
              <span className="count-pill">{namespaceItems.length}</span>
            </div>
            <button className={`namespace-link${selectedNamespace.length === 0 ? ' is-active' : ''}`} onClick={() => setLocation([])} type="button">
              <span className="namespace-glyph" aria-hidden="true">⌂</span>
              <span>All namespaces</span>
            </button>
            {selectedNamespace.length > 0 && (
              <button className="namespace-link parent-link" onClick={() => setLocation(parentNamespace)} type="button">
                <span className="namespace-glyph" aria-hidden="true">↰</span>
                <span>{parentNamespace.at(-1) ?? 'Root'}</span>
              </button>
            )}
            {namespaces.isPending && <p className="muted compact">Loading…</p>}
            {namespaces.isError && <p className="sidebar-error">Could not load namespaces.</p>}
            <div className="namespace-list">
              {namespaceItems.map((item) => (
                <NamespaceLink
                  key={namespaceKey(item.namespace)}
                  namespace={item}
                  selected={selectedNamespace}
                  onSelect={(parts) => setLocation(parts)}
                />
              ))}
            </div>
            {namespaces.hasNextPage && (
              <button className="load-more" onClick={() => void namespaces.fetchNextPage()} disabled={namespaces.isFetchingNextPage}>
                {namespaces.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
          <div className="sidebar-footnote">Catalog credentials stay on the server.</div>
        </aside>

        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Catalog explorer</p>
              <h1>{selectedTable ?? selectedNamespace.at(-1) ?? catalog.name}</h1>
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <button onClick={() => setLocation([])} type="button">{catalog.name}</button>
                {selectedNamespace.map((part, index) => (
                  <span key={`${part}-${index}`}>
                    <span className="breadcrumb-separator">/</span>
                    <button onClick={() => setLocation(selectedNamespace.slice(0, index + 1))} type="button">{part}</button>
                  </span>
                ))}
                {selectedTable && <span><span className="breadcrumb-separator">/</span>{selectedTable}</span>}
              </nav>
            </div>
            <div className="heading-meta">
              <span className="meta-label">REST endpoint</span>
              <span className="meta-value">{status.data ? `${status.data.endpoints.length} advertised features` : '—'}</span>
            </div>
          </div>

          {selectedTable ? (
            <TableDetails query={table} tableName={selectedTable} onBack={() => setLocation(selectedNamespace)} />
          ) : selectedNamespace.length === 0 ? (
            <section className="section-card">
              <div className="section-title-row content-title">
                <div><p className="eyebrow">Browse</p><h2>Top-level namespaces</h2></div>
                <span className="count-pill">{namespaceItems.length}</span>
              </div>
              {namespaces.isError && <ErrorMessage message="The catalog did not return its namespaces." />}
              {namespaceItems.length === 0 && !namespaces.isPending && <p className="muted">No namespaces were found in this catalog.</p>}
              <div className="namespace-grid">
                {namespaceItems.map((item) => (
                  <button className="namespace-card" key={namespaceKey(item.namespace)} onClick={() => setLocation(item.namespace)} type="button">
                    <span className="namespace-card-icon" aria-hidden="true">▦</span>
                    <span className="namespace-card-name">{item.namespace.join(' / ')}</span>
                    <span className="namespace-card-arrow" aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              {namespaces.hasNextPage && (
                <button className="secondary-button" onClick={() => void namespaces.fetchNextPage()} disabled={namespaces.isFetchingNextPage}>
                  {namespaces.isFetchingNextPage ? 'Loading…' : 'Load more namespaces'}
                </button>
              )}
            </section>
          ) : (
            <section className="section-card">
              <div className="section-title-row content-title">
                <div><p className="eyebrow">Namespace</p><h2>{selectedNamespace.join(' / ')}</h2></div>
                <span className="count-pill">{tableItems.length} tables</span>
              </div>
              {namespaces.isError && <ErrorMessage message="Could not load child namespaces." />}
              {namespaceItems.length > 0 && (
                <div className="child-namespace-list">
                  <p className="field-label">Child namespaces</p>
                  {namespaceItems.map((item) => (
                    <NamespaceLink
                      key={namespaceKey(item.namespace)}
                      namespace={item}
                      selected={selectedNamespace}
                      onSelect={(parts) => setLocation(parts)}
                    />
                  ))}
                  {namespaces.hasNextPage && (
                    <button className="load-more" onClick={() => void namespaces.fetchNextPage()} disabled={namespaces.isFetchingNextPage}>
                      {namespaces.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                  )}
                </div>
              )}
              <div className="table-list-heading"><p className="field-label">Tables</p></div>
              {tables.isPending && <Loading label="tables" />}
              {tables.isError && <ErrorMessage message="The catalog did not return its tables." />}
              {tableItems.length === 0 && !tables.isPending && !tables.isError && <p className="muted">No tables in this namespace.</p>}
              {tableItems.length > 0 && (
                <div className="table-list">
                  {tableItems.map((item: TableIdentifier) => (
                    <button className="table-row" key={`${namespaceKey(item.namespace)}:${item.name}`} onClick={() => setLocation(selectedNamespace, item.name)} type="button">
                      <span className="table-icon" aria-hidden="true">▤</span>
                      <span className="table-name">{item.name}</span>
                      <span className="table-row-hint">Inspect table <span aria-hidden="true">→</span></span>
                    </button>
                  ))}
                </div>
              )}
              {tables.hasNextPage && (
                <button className="secondary-button" onClick={() => void tables.fetchNextPage()} disabled={tables.isFetchingNextPage}>
                  {tables.isFetchingNextPage ? 'Loading…' : 'Load more tables'}
                </button>
              )}
            </section>
          )}
          <footer className="page-footer">Read-only catalog browsing · Iceberg REST API</footer>
        </main>
      </div>
    </div>
  )
}

function TableDetails({
  query,
  tableName,
  onBack,
}: {
  query: UseQueryResult<{ table: TableSummary }, Error>
  tableName: string
  onBack: () => void
}) {
  if (query.isPending) return <Loading label="table metadata" />
  if (query.isError) {
    return (
      <section className="section-card">
        <button className="back-button" onClick={onBack} type="button">← Back to tables</button>
        <ErrorMessage message={`Could not load ${tableName}. Check the catalog connection and table permissions.`} />
      </section>
    )
  }

  const table = query.data.table
  return (
    <div className="details-stack">
      <div className="detail-stats">
        <div className="stat-card"><span>Format version</span><strong>v{table.formatVersion}</strong></div>
        <div className="stat-card"><span>Snapshots</span><strong>{table.snapshotCount}</strong></div>
        <div className="stat-card"><span>Current snapshot</span><strong className="stat-id">{table.currentSnapshotId ?? 'None'}</strong></div>
        <div className="stat-card"><span>Last updated</span><strong className="stat-date">{formatDate(table.lastUpdatedMs)}</strong></div>
      </div>

      <section className="section-card">
        <div className="section-title-row content-title">
          <div><p className="eyebrow">Table metadata</p><h2>Current schema</h2></div>
          <button className="back-button" onClick={onBack} type="button">← Back to tables</button>
        </div>
        {table.currentSchema ? (
          <div className="schema-table-wrap">
            <table className="schema-table">
              <thead><tr><th>Field</th><th>Type</th><th>Required</th></tr></thead>
              <tbody>
                {table.currentSchema.fields.map((field) => (
                  <tr key={field.id}>
                    <td><span className="field-id">#{field.id}</span>{field.name}</td>
                    <td><code>{typeof field.type === 'string' ? field.type : field.type.type}</code></td>
                    <td>{field.required ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No current schema was returned.</p>}
        {table.currentPartitionSpec && (
          <div className="partition-block">
            <p className="field-label">Current partition spec</p>
            {table.currentPartitionSpec.fields.length === 0 ? <span className="muted">Unpartitioned</span> : (
              <div className="tag-list">
                {table.currentPartitionSpec.fields.map((field) => <span className="tag" key={field['field-id']}>{field.name} <code>{field.transform}</code></span>)}
              </div>
            )}
          </div>
        )}
        <div className="partition-block">
          <p className="field-label">Branches and tags</p>
          {Object.keys(table.refs).length === 0 ? <span className="muted">No snapshot references</span> : (
            <div className="tag-list">
              {Object.entries(table.refs).map(([name, ref]) => (
                <span className="tag" key={name}>{name} <code>{ref.type}</code></span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section-card">
        <div className="section-title-row content-title">
          <div><p className="eyebrow">Table history</p><h2>Snapshots</h2></div>
          <span className="count-pill">{table.snapshotCount}</span>
        </div>
        {table.snapshotsTruncated && <p className="muted compact">Showing the 100 most recent snapshots.</p>}
        {table.snapshots.length === 0 ? <p className="muted">No snapshots were returned.</p> : (
          <div className="snapshot-list">
            {table.snapshots.map((snapshot) => (
              <div className="snapshot-row" key={snapshot.snapshotId}>
                <span className={`operation-icon operation-${snapshot.operation}`} aria-hidden="true">{snapshot.operation === 'append' ? '＋' : snapshot.operation === 'delete' ? '−' : '↻'}</span>
                <div className="snapshot-main">
                  <strong>{snapshot.operation}</strong>
                  <span>{formatDate(snapshot.timestampMs)}</span>
                </div>
                <span className="snapshot-id">{snapshot.snapshotId}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<CatalogSettings />} />
        <Route path="/catalog/:catalogId" element={<CatalogExplorer />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
