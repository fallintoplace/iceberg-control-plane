import { IcebergRestCatalog } from 'iceberg-js'

const baseUrl = process.env.ICEBERG_FIXTURE_URI ?? 'http://localhost:8181'
const catalog = new IcebergRestCatalog({ baseUrl })
const namespace = { namespace: ['analytics'] }

await catalog.createNamespaceIfNotExists(namespace, { properties: { owner: 'local-demo' } })
await catalog.createTableIfNotExists(namespace, {
  name: 'events',
  schema: {
    type: 'struct',
    'schema-id': 0,
    fields: [
      { id: 1, name: 'event_id', type: 'long', required: true },
      { id: 2, name: 'event_type', type: 'string', required: true },
      { id: 3, name: 'occurred_at', type: 'timestamptz', required: false },
    ],
  },
  'partition-spec': { 'spec-id': 0, fields: [] },
  'write-order': { 'order-id': 0, fields: [] },
  properties: { 'write.format.default': 'parquet' },
})

process.stdout.write(`Seeded ${baseUrl} with analytics.events.\n`)
