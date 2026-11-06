const api = 'http://127.0.0.1:3001'

async function request(path, init) {
  const response = await fetch(`${api}${path}`, init)
  const body = await response.json()
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${body.error ?? 'unknown error'}`)
  return body
}

async function runJob(operation, extra = {}) {
  const accepted = await request('/api/workers/iceberg-go/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      protocolVersion: 1,
      requestId: crypto.randomUUID(),
      operation,
      catalogId: 'local',
      ...extra,
    }),
  })

  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const response = await request(`/api/workers/iceberg-go/jobs/${encodeURIComponent(accepted.jobId)}`)
    if (response.job.status === 'succeeded') return response.job.result
    if (response.job.status === 'failed') {
      throw new Error(`${operation} failed: ${response.job.error?.message ?? 'unknown error'}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`${operation} timed out`)
}

const status = await request('/api/workers/iceberg-go/status')
if (status.worker.health.runtime.language !== 'go' || status.worker.health.runtime.engine !== 'apache/iceberg-go') {
  throw new Error('The configured worker is not using Apache Iceberg Go.')
}

const lessonBaseline = await runJob('tutorial.reset')
if (lessonBaseline.action !== 'reset' || lessonBaseline.starterRowCount !== 3) {
  throw new Error('The Go worker did not restore the three starter lesson rows.')
}
let report
try {
  const validation = await runJob('catalog.validate')
  if (!Array.isArray(validation.namespaces) || !validation.namespaces.some((namespace) => namespace.join('.') === 'analytics')) {
    throw new Error('The Go worker did not find the seeded analytics namespace.')
  }

  const inspection = await runJob('table.inspect', { table: { namespace: ['analytics'], name: 'events' } })
  if (!Array.isArray(inspection.schema) || !inspection.schema.some((field) => field.name === 'event_id')) {
    throw new Error('The Go worker did not return the seeded table schema.')
  }

  const sample = await runJob('table.sample', {
    table: { namespace: ['analytics'], name: 'events' },
    options: { rowLimit: 10 },
  })
  if (!Array.isArray(sample.rows) || sample.rows.length !== 3 || sample.rows[0].event_id !== 1) {
    throw new Error('The Go worker did not read the three starter rows from the table data files.')
  }

  const before = await runJob('table.inspect', { table: { namespace: ['analytics'], name: 'events' } })
  const appended = await runJob('tutorial.append')
  if (
    appended.action !== 'append' ||
    appended.beforeSnapshotId !== before.currentSnapshot.snapshotId ||
    appended.afterSnapshotId === appended.beforeSnapshotId ||
    appended.snapshotCountAfter !== appended.snapshotCountBefore + 1 ||
    appended.appendedRow?.event_type !== 'iceberg_learning_lab'
  ) {
    throw new Error('The Go worker did not create a new snapshot for the lesson append.')
  }

  const after = await runJob('table.sample', {
    table: { namespace: ['analytics'], name: 'events' },
    options: { rowLimit: 10 },
  })
  if (!Array.isArray(after.rows) || after.rows.length !== 4 || !after.rows.some((row) => row.event_id === appended.appendedRow.event_id)) {
    throw new Error('The Go worker did not read the appended lesson event.')
  }

  report = {
    worker: status.worker.health.runtime,
    catalogNamespaces: validation.namespaceCount,
    table: `${inspection.namespace.join('.')}.${inspection.name}`,
    formatVersion: inspection.formatVersion,
    starterRows: sample.rows,
    commit: {
      beforeSnapshotId: appended.beforeSnapshotId,
      afterSnapshotId: appended.afterSnapshotId,
      appendedRow: appended.appendedRow,
      rowsAfterAppend: after.rows.length,
    },
  }
} finally {
  await runJob('tutorial.reset')
}

console.log(JSON.stringify(report, null, 2))
