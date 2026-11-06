#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

mkdir -p .local
api_log=".local/iceberg-go-e2e-$$.log"
catalog_file=".local/iceberg-go-e2e-$$.json"
api_pid=""

cleanup() {
  if [[ -n "$api_pid" ]]; then
    kill "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
  fi
  rm -f "$api_log" "$catalog_file"
}
trap cleanup EXIT

docker compose up -d --build iceberg-rest iceberg-go-worker
ICEBERG_FIXTURE_URI=http://localhost:8181 pnpm seed:fixture
docker compose run --rm --no-deps --entrypoint /usr/local/bin/seed-fixture iceberg-go-worker

ICEBERG_CATALOGS_JSON='[{"id":"local","name":"Local catalog","uri":"http://localhost:8181"}]' \
ICEBERG_CATALOGS_FILE="$catalog_file" \
ICEBERG_WORKERS_JSON='[{"id":"iceberg-go","name":"Iceberg Go","uri":"http://localhost:8090"}]' \
PORT=3001 API_HOST=127.0.0.1 \
pnpm --filter @iceberg-control-plane/api exec tsx src/server.ts >"$api_log" 2>&1 &
api_pid=$!

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then
    break
  fi
  if [[ "$attempt" == 30 ]]; then
    cat "$api_log"
    echo "API did not start for the Iceberg Go end-to-end run." >&2
    exit 1
  fi
  sleep 1
done

node scripts/e2e-iceberg-go.mjs
