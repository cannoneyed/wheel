#!/usr/bin/env bash
set -Eeuo pipefail

trap 'wheel_ci_status=$?; echo "Elixir backend CI failed at line $LINENO with status $wheel_ci_status" >&2' ERR

if [[ -n "${SOLO_PROCESS_ID:-}" || "${TERM_PROGRAM:-}" == "solo" ]]; then
  echo "Use the Solo postgres and Elixir server processes for local tests."
  exit 1
fi

run_id="${BUILDKITE_JOB_ID:-local}"
postgres_container="wheel-elixir-postgres-$run_id"
wire_container="wheel-elixir-wire-$run_id"
tracker_container="wheel-elixir-tracker-$run_id"
elixir_image="hexpm/elixir:1.18.4-erlang-27.3.4.7-debian-bookworm-20260610-slim"
repo_dir="$PWD"

cleanup() {
  docker rm -f "$tracker_container" >/dev/null 2>&1 || true
  docker rm -f "$wire_container" >/dev/null 2>&1 || true
  docker rm -f "$postgres_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p .cache/mix .cache/hex

start_postgres() {
  docker rm -f "$postgres_container" >/dev/null 2>&1 || true
  docker run --rm --detach \
    --name "$postgres_container" \
    --env POSTGRES_PASSWORD=postgres \
    --env POSTGRES_DB=wheel_sync \
    --publish 55432:5432 \
    postgres:17-alpine >/dev/null
}

echo "Starting PostgreSQL for Elixir backend tests"
wheel_postgres_status=0
for wheel_postgres_attempt in 1 2 3; do
  if start_postgres; then
    wheel_postgres_status=0
    break
  else
    wheel_postgres_status=$?
  fi
  echo "PostgreSQL start attempt $wheel_postgres_attempt failed with status $wheel_postgres_status" >&2
  sleep "$wheel_postgres_attempt"
done
if (( wheel_postgres_status != 0 )); then
  exit "$wheel_postgres_status"
fi

for _attempt in $(seq 1 60); do
  if docker exec "$postgres_container" pg_isready -U postgres -d wheel_sync >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

docker exec "$postgres_container" pg_isready -U postgres -d wheel_sync >/dev/null
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55432/wheel_sync"

docker run --rm \
  --network host \
  --user "$(id -u):$(id -g)" \
  --volume "$repo_dir:/workspace" \
  --workdir /workspace \
  --env DATABASE_URL \
  --env MIX_HOME=/workspace/.cache/mix \
  --env HEX_HOME=/workspace/.cache/hex \
  "$elixir_image" \
  bash -lc '
    mix local.hex --force
    mix local.rebar --force
    cd elixir/wheel_sync
    MIX_ENV=test mix deps.get
    MIX_ENV=test mix test --warnings-as-errors --only postgres
    cd ../tracker
    mix deps.get
    mix compile --warnings-as-errors
  '

docker run --rm --detach \
  --name "$wire_container" \
  --network host \
  --user "$(id -u):$(id -g)" \
  --volume "$repo_dir:/workspace" \
  --workdir /workspace/elixir/wheel_sync \
  --env DATABASE_URL \
  --env MIX_ENV=test \
  --env PORT=4801 \
  --env MIX_HOME=/workspace/.cache/mix \
  --env HEX_HOME=/workspace/.cache/hex \
  "$elixir_image" \
  mix run test/support/wire_server.exs >/dev/null

for _attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:4801/readyz >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl --fail --silent http://127.0.0.1:4801/readyz >/dev/null; then
  docker logs "$wire_container"
  exit 1
fi

WHEEL_WIRE_URL=http://127.0.0.1:4801 WHEEL_WIRE_LABEL="Elixir Postgres" bun run test:wire

docker rm -f "$wire_container" >/dev/null

bun run test:browser:tracker:sqlite

docker run --rm --detach \
  --name "$tracker_container" \
  --network host \
  --user "$(id -u):$(id -g)" \
  --volume "$repo_dir:/workspace" \
  --workdir /workspace/elixir/tracker \
  --env DATABASE_URL \
  --env TRACKER_PORT=4799 \
  --env TRACKER_RESET_DATABASE=1 \
  --env MIX_HOME=/workspace/.cache/mix \
  --env HEX_HOME=/workspace/.cache/hex \
  "$elixir_image" \
  mix run --no-halt >/dev/null

for _attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:4799/readyz >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl --fail --silent http://127.0.0.1:4799/readyz >/dev/null; then
  docker logs "$tracker_container"
  exit 1
fi

TRACKER_BROWSER_SYNC_ORIGIN=http://127.0.0.1:4799 bun run test:browser:tracker:postgres
