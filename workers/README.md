# Worker contract

`openapi.yaml` defines the version 1 HTTP contract. A worker can use Iceberg Go, Iceberg Java, Iceberg Rust, or another implementation. The control plane only depends on the HTTP and JSON contract.

Configure workers in `ICEBERG_WORKERS_JSON`:

```json
[
  {
    "id": "iceberg-go",
    "name": "Iceberg Go",
    "uri": "http://localhost:8090",
    "bearerTokenEnv": "ICEBERG_GO_WORKER_TOKEN"
  }
]
```

The token is optional. If configured, its value stays in the control plane API environment and is sent only to that worker.

Workers implement `GET /v1/health`, `GET /v1/capabilities`, `POST /v1/jobs`, and `GET /v1/jobs/{jobId}`. A worker must advertise each operation before the control plane sends it. Version 1 operations are:

- `catalog.validate`
- `table.inspect`
- `table.sample`, with a row limit from 1 to 100

Job requests contain a catalog ID, not catalog credentials. Each worker maps catalog IDs to its own server-side credentials. Treat `requestId` as an idempotency key so retries do not start duplicate jobs.

The control plane validates worker responses, hides worker URLs and credentials from the browser, and returns generic errors when a worker is unavailable or breaks the contract.
