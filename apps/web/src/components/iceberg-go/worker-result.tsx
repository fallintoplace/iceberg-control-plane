import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Collapsible } from '@/components/ui/collapsible'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function displayCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatTimestamp(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestampMs)
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex min-h-[76px] flex-col justify-between rounded-md border-[#e5eeea] bg-[#fbfdfc] p-3 shadow-none">
      <span className="text-[10px] text-[#859195]">{label}</span>
      <strong className="text-sm font-semibold text-[#34504a]">{value}</strong>
    </Card>
  )
}

function LearningCommitResult({ result }: { result: JsonRecord }) {
  if (result.action === 'reset') {
    return (
      <Card className="grid gap-2 border-[#dcebe3] bg-[#f8fcfa] p-4 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#294047]">Starter table restored</h3>
          {typeof result.starterRowCount === 'number' && <Badge variant="success" size="xs">{result.starterRowCount} starter rows</Badge>}
        </div>
        <p className="text-xs leading-relaxed text-muted">{typeof result.message === 'string' ? result.message : 'The learning table was reset.'}</p>
        {isRecord(result.currentSnapshot) && typeof result.currentSnapshot.snapshotId === 'number' && (
          <code className="font-mono text-[10px] text-[#536d67]">Starting snapshot {result.currentSnapshot.snapshotId}</code>
        )}
      </Card>
    )
  }

  if (result.action !== 'append') return null
  const appendedRow = isRecord(result.appendedRow) ? result.appendedRow : undefined
  const beforeSnapshotId = typeof result.beforeSnapshotId === 'number' ? result.beforeSnapshotId : undefined
  const afterSnapshotId = typeof result.afterSnapshotId === 'number' ? result.afterSnapshotId : undefined
  const rowFields = appendedRow ? Object.entries(appendedRow) : []

  return (
    <Card className="grid gap-4 border-[#dcebe3] bg-[#f8fcfa] p-4 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <h3 className="text-xs font-semibold text-[#294047]">A new snapshot committed the row</h3>
          <p className="text-[11px] leading-relaxed text-muted">Iceberg keeps the previous snapshot and points the table at the new one.</p>
        </div>
        {typeof result.snapshotCountAfter === 'number' && <Badge variant="success" size="xs">{result.snapshotCountAfter} snapshots</Badge>}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <Card className="grid gap-1 rounded-md border-[#e5eeea] p-3 shadow-none">
          <span className="text-[9px] font-bold tracking-[.08em] text-[#859195] uppercase">Previous snapshot</span>
          <code className="overflow-hidden font-mono text-[10px] text-[#536d67] text-ellipsis">{beforeSnapshotId ?? 'None'}</code>
          {typeof result.snapshotCountBefore === 'number' && <span className="text-[9px] text-muted">{result.snapshotCountBefore} total</span>}
        </Card>
        <span aria-label="new snapshot follows" className="mx-auto text-brand" role="img">→</span>
        <Card className="grid gap-1 rounded-md border-[#b9d9cb] bg-white p-3 shadow-none">
          <span className="text-[9px] font-bold tracking-[.08em] text-brand uppercase">New current snapshot</span>
          <code className="overflow-hidden font-mono text-[10px] text-[#34504a] text-ellipsis">{afterSnapshotId ?? 'Unknown'}</code>
          {typeof result.snapshotCountAfter === 'number' && <span className="text-[9px] text-muted">{result.snapshotCountAfter} total</span>}
        </Card>
      </div>

      {rowFields.length > 0 && (
        <section className="grid gap-2">
          <h4 className="text-[10px] font-semibold text-[#536d67]">Row added by this commit</h4>
          <div className="overflow-x-auto rounded-md border border-[#edf1f0]">
            <Table>
              <TableHeader><TableRow>{rowFields.map(([name]) => <TableHead className="bg-white px-[10px] py-2" key={name}>{name}</TableHead>)}</TableRow></TableHeader>
              <TableBody><TableRow>{rowFields.map(([name, value]) => <TableCell className="max-w-[260px] overflow-hidden px-[10px] py-2 font-mono text-ellipsis whitespace-nowrap" key={name}>{displayCell(value)}</TableCell>)}</TableRow></TableBody>
            </Table>
          </div>
        </section>
      )}
    </Card>
  )
}

function WorkerSchema({ fields, implementation }: { fields: JsonRecord[]; implementation?: string }) {
  const showsRequired = fields.some((field) => typeof field.required === 'boolean')

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[#294047]">{implementation ? `Schema returned by ${implementation}` : 'Table schema'}</h3>
        <Badge variant="secondary" size="xs">{fields.length} fields</Badge>
      </div>
      <div className="overflow-x-auto rounded-md border border-[#edf1f0]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-[#f7faf8] px-[10px] py-2">Field</TableHead>
              <TableHead className="bg-[#f7faf8] px-[10px] py-2">Type</TableHead>
              {showsRequired && <TableHead className="bg-[#f7faf8] px-[10px] py-2">Required</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow key={`${String(field.id ?? index)}:${String(field.name ?? '')}`}>
                <TableCell className="px-[10px] py-2 font-mono text-[#33474b]">
                  {typeof field.id === 'number' && <span className="mr-2 text-[9px] text-[#9aa6a6]">#{field.id}</span>}
                  {typeof field.name === 'string' ? field.name : 'Field'}
                </TableCell>
                <TableCell className="px-[10px] py-2">
                  <code className="rounded bg-[#f2f6f4] px-1.5 py-1 text-[10px] text-[#536d67]">{typeof field.type === 'string' ? field.type : '—'}</code>
                </TableCell>
                {showsRequired && <TableCell className="px-[10px] py-2">{field.required === true ? 'Yes' : 'No'}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function SampleRows({ fields, rows }: { fields: JsonRecord[]; rows: JsonRecord[] }) {
  const fieldColumns = fields.flatMap((field) => typeof field.name === 'string' ? [field.name] : [])
  const columns = fieldColumns.length > 0 ? fieldColumns : Object.keys(rows[0] ?? {})

  if (rows.length === 0 || columns.length === 0) {
    return (
      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#294047]">Rows read from data files</h3>
          <Badge variant="secondary" size="xs">{rows.length} returned</Badge>
        </div>
        {rows.length === 0 && <p className="text-xs text-muted">The scan returned no rows.</p>}
      </section>
    )
  }

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[#294047]">Rows read from data files</h3>
        <Badge variant="success" size="xs">{rows.length} returned</Badge>
      </div>
      <div className="overflow-x-auto rounded-md border border-[#edf1f0]">
        <Table>
          <TableHeader>
            <TableRow>{columns.map((column) => <TableHead className="bg-[#f7faf8] px-[10px] py-2" key={column}>{column}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => <TableCell className="max-w-[300px] overflow-hidden px-[10px] py-2 text-ellipsis whitespace-nowrap" key={column}>{displayCell(row[column])}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

export function WorkerResult({ result, implementation }: { result: JsonRecord; implementation?: string }) {
  const schema = Array.isArray(result.schema) ? result.schema.filter(isRecord) : []
  const rows = Array.isArray(result.rows) ? result.rows.filter(isRecord) : []
  const hasRows = Array.isArray(result.rows)
  const namespaces = Array.isArray(result.namespaces) ? result.namespaces.filter(Array.isArray) : []
  const hasNamespaces = Array.isArray(result.namespaces)
  const partitionFields = Array.isArray(result.partitionFields) ? result.partitionFields.filter(isRecord) : []
  const snapshot = isRecord(result.currentSnapshot) ? result.currentSnapshot : undefined
  const isLessonResult = result.action === 'append' || result.action === 'reset'
  const metrics = [
    ...(typeof result.formatVersion === 'number' ? [{ label: 'Format version', value: `v${result.formatVersion}` }] : []),
    ...(typeof result.snapshotCount === 'number' ? [{ label: 'Snapshots', value: String(result.snapshotCount) }] : []),
    ...(typeof result.namespaceCount === 'number' ? [{ label: 'Namespaces', value: String(result.namespaceCount) }] : []),
    ...(typeof result.rowCount === 'number' ? [{ label: 'Rows returned', value: String(result.rowCount) }] : []),
  ]
  const hasDetails = metrics.length > 0 || schema.length > 0 || hasRows || hasNamespaces || partitionFields.length > 0 || Boolean(snapshot) || typeof result.location === 'string' || isLessonResult

  return (
    <div className="grid gap-5">
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((metric) => <ResultMetric key={metric.label} {...metric} />)}
        </div>
      )}

      {isLessonResult && <LearningCommitResult result={result} />}

      {(partitionFields.length > 0 || snapshot || typeof result.location === 'string') && (
        <div className="grid gap-3 sm:grid-cols-2">
          {partitionFields.length > 0 && (
            <Card className="grid gap-2 border-[#e5eeea] p-3 shadow-none">
              <h3 className="text-xs font-semibold text-[#294047]">Partition spec</h3>
              <div className="flex flex-wrap gap-1.5">
                {partitionFields.map((field, index) => (
                  <Badge variant="tag" className="font-mono" key={`${String(field.fieldId ?? index)}:${String(field.name ?? '')}`}>
                    {typeof field.name === 'string' ? field.name : 'field'}
                    {typeof field.transform === 'string' && <code className="ml-1 text-[9px] text-brand">{field.transform}</code>}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
          {snapshot && (
            <Card className="grid gap-1 border-[#e5eeea] p-3 shadow-none">
              <h3 className="text-xs font-semibold text-[#294047]">Current snapshot</h3>
              <code className="font-mono text-[11px] text-[#536d67]">{typeof snapshot.snapshotId === 'number' ? snapshot.snapshotId : 'Unknown'}</code>
              {typeof snapshot.timestampMs === 'number' && <span className="text-[10px] text-[#859195]">{formatTimestamp(snapshot.timestampMs)}</span>}
            </Card>
          )}
          {typeof result.location === 'string' && (
            <Card className="grid min-w-0 gap-1 border-[#e5eeea] p-3 shadow-none sm:col-span-2">
              <h3 className="text-xs font-semibold text-[#294047]">Table location</h3>
              <code className="overflow-hidden text-ellipsis break-all font-mono text-[10px] text-[#536d67]">{result.location}</code>
            </Card>
          )}
        </div>
      )}

      {hasNamespaces && (
        <section className="grid gap-2">
          <h3 className="text-xs font-semibold text-[#294047]">{implementation ? `Namespaces returned by ${implementation}` : 'Discovered namespaces'}</h3>
          {namespaces.length > 0
            ? <div className="flex flex-wrap gap-1.5">{namespaces.map((namespace, index) => <Badge variant="tag" className="font-mono" key={index}>{namespace.map(String).join(' / ')}</Badge>)}</div>
            : <p className="text-xs text-muted">The catalog returned no namespaces.</p>}
        </section>
      )}

      {schema.length > 0 && <WorkerSchema fields={schema} implementation={implementation} />}
      {hasRows && <SampleRows fields={schema} rows={rows} />}
      {!hasDetails && <p className="text-xs text-muted">The worker completed this operation without additional result data.</p>}

      <Collapsible summary="View raw JSON" className="text-[10px] text-[#6f7f83]">
        <pre className="max-h-[360px] overflow-auto rounded-md bg-[#1d302f] p-4 font-mono text-[10px] leading-[1.6] text-[#dce9e4]">{JSON.stringify(result, null, 2)}</pre>
      </Collapsible>
    </div>
  )
}
