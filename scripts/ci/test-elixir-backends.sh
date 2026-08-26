#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${SOLO_PROCESS_ID:-}" || "${TERM_PROGRAM:-}" == "solo" ]]; then
  echo "Use the Solo postgres and Elixir server processes for local tests."
  exit 1
fi

container_name="wheel-elixir-${BUILDKITE_JOB_ID:-local}"
wire_pid=""

cleanup() {
  if [[ -n "$wire_pid" ]]; then
    kill "$wire_pid" 2>/dev/null || true
    wait "$wire_pid" 2>/dev/null || true
  fi
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=wheel_sync \
  --publish 55432:5432 \
  postgres:17-alpine >/dev/null

for _attempt in $(seq 1 60); do
  if docker exec "$container_name" pg_isready -U postgres -d wheel_sync >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

docker exec "$container_name" pg_isready -U postgres -d wheel_sync >/dev/null
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55432/wheel_sync"

(cd elixir/wheel_sync && mix deps.get)
(cd elixir/tracker && mix deps.get)
(cd elixir/wheel_sync && mix test --warnings-as-errors)

(
  cd elixir/wheel_sync
  MIX_ENV=test PORT=4801 mix run test/support/wire_server.exs
) &
wire_pid="$!"

for _attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:4801/readyz >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

curl --fail --silent http://127.0.0.1:4801/readyz >/dev/null
WHEEL_WIRE_URL=http://127.0.0.1:4801 WHEEL_WIRE_LABEL="Elixir Postgres" bun run test:wire

kill "$wire_pid"
wait "$wire_pid" 2>/dev/null || true
wire_pid=""

bun run test:browser:tracker:all
