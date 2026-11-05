# Iceberg Control Plane

An open-source control plane for browsing Apache Iceberg REST catalogs.

The current build is a local catalog explorer. It shows namespaces, tables, schemas, partition specs, and recent snapshots. Catalog data stays read only. Connection settings are managed locally, while credentials stay in the API environment.

## Quick start

Requirements: Node.js 22 or newer, pnpm 10, Docker, and Go 1.26.3 or newer for local worker tests.

```sh
cp .env.example .env
docker compose up -d --build
pnpm install
pnpm seed:fixture
docker compose run --rm --entrypoint /usr/local/bin/seed-fixture iceberg-go-worker
pnpm dev
```

Open <http://localhost:5173>, choose `analytics.events`, and click **Sample rows** in the Go worker panel. The fixture includes three sample events. **Inspect with Go** shows the table schema returned by Apache Iceberg Go.

The API binds to `127.0.0.1` by default. This first build is for one local operator. Do not expose it to a shared network.

## Manage catalogs

Open **Manage catalogs** in the app to add or remove REST catalog connections. The API stores connection definitions in `.local/catalogs.json` with owner-only file permissions. `ICEBERG_CATALOGS_FILE` can set a different path, relative to the repository root or absolute.

When the saved file does not exist, the API bootstraps its first catalog list from `ICEBERG_CATALOGS_JSON` in `.env` or the API environment:

```json
[
  {
    "id": "local",
    "name": "Local catalog",
    "uri": "http://localhost:8181"
  }
]
```

For a catalog that needs a bearer token, put the **environment variable name** in the catalog entry or settings form. Add the token itself to the API process environment and restart the API before saving the connection:

```json
[
  {
    "id": "production",
    "name": "Production",
    "uri": "https://catalog.example.com",
    "warehouse": "analytics",
    "bearerTokenEnv": "ICEBERG_PRODUCTION_TOKEN"
  }
]
```

Supported fields are `id`, `name`, `uri`, and optional `warehouse` and `bearerTokenEnv`. The app supports unauthenticated and bearer-token REST catalogs. It rejects catalog URLs containing embedded credentials.

## Workers

The repository includes a Go worker that uses the current Apache Iceberg Go module. It validates REST catalogs, inspects table metadata, and reads sample rows from Parquet data files. Docker Compose starts the worker at `http://localhost:8090` beside the REST fixture. The shared fixture volume lets the Go worker read the fixture's local table files.

The API can also connect to separate workers written in Java, Rust, TypeScript, or another language. Set `ICEBERG_WORKERS_JSON` in the API environment. Workers implement the versioned HTTP contract in [workers/openapi.yaml](workers/openapi.yaml). They advertise read-only operations and resolve catalog credentials by catalog ID from their own environment.

The control plane supports optional bearer tokens for worker endpoints through `bearerTokenEnv`. It sends that worker token only to its configured worker. Catalog credentials are never forwarded to workers.

On a table page, use **Validate catalog**, **Inspect with Go**, or **Sample rows**. The page polls the job and renders the result. To run the full HTTP flow from a terminal, use `pnpm e2e:iceberg-go`.

## API

- `GET /api/health`
- `GET /api/catalogs`
- `POST /api/catalogs`
- `DELETE /api/catalogs/{id}`
- `GET /api/catalogs/{id}/status`
- `GET /api/catalogs/{id}/namespaces`
- `GET /api/catalogs/{id}/tables?namespace=...`
- `GET /api/catalogs/{id}/table?namespace=...&name=...`
- `GET /api/workers`
- `GET /api/workers/{id}/status`
- `POST /api/workers/{id}/jobs`
- `GET /api/workers/{id}/jobs/{jobId}`

Namespace components use repeated `namespace` or `parent` query parameters. Listing routes return Iceberg pagination tokens.

## Development

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
go -C workers/iceberg-go test ./...
```

The project uses a pnpm workspace with a React/TypeScript UI and a Node/TypeScript API. The API uses the TypeScript Iceberg REST client for catalog browsing. The Go worker uses Apache Iceberg Go for its catalog and table operations.

## License

Apache-2.0. See [LICENSE](LICENSE).
