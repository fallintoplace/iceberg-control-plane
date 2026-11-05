# Iceberg Control Plane

An open-source control plane for browsing Apache Iceberg REST catalogs.

The current build is a local catalog explorer. It shows namespaces, tables, schemas, partition specs, and recent snapshots. Catalog data stays read only. Connection settings are managed locally, while credentials stay in the API environment.

## Quick start

Requirements: Node.js 22 or newer, pnpm 10, and Docker.

```sh
cp .env.example .env
docker compose up -d iceberg-rest
pnpm install
pnpm seed:fixture
pnpm dev
```

Open <http://localhost:5173>. The seed command adds an `analytics.events` table to the fixture.

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

## API

- `GET /api/health`
- `GET /api/catalogs`
- `POST /api/catalogs`
- `DELETE /api/catalogs/{id}`
- `GET /api/catalogs/{id}/status`
- `GET /api/catalogs/{id}/namespaces`
- `GET /api/catalogs/{id}/tables?namespace=...`
- `GET /api/catalogs/{id}/table?namespace=...&name=...`

Namespace components use repeated `namespace` or `parent` query parameters. Listing routes return Iceberg pagination tokens.

## Development

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The project uses a pnpm workspace with a React/TypeScript UI and a Node/TypeScript API. The API uses the TypeScript Iceberg REST client for catalog operations. A later worker interface can run deeper Iceberg operations through Go, Java, or Rust implementations.

## License

Apache-2.0. See [LICENSE](LICENSE).
