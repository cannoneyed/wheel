#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${SOLO_PROCESS_ID:-}" || "${TERM_PROGRAM:-}" == "solo" ]]; then
  echo "Use the Solo postgres and Elixir server processes for local tests."
  exit 1
fi

run_id="${BUILDKITE_JOB_ID:-local-$$}"
postgres_container="wheel-elixir-postgres-$run_id"
wire_container="wheel-elixir-wire-$run_id"
tracker_container="wheel-elixir-tracker-$run_id"
docker_network="wheel-elixir-$run_id"
elixir_image="hexpm/elixir:1.18.4-erlang-27.3.4.7-debian-bookworm-20260610-slim"
repo_dir="$PWD"

cleanup() {
  docker rm -f "$tracker_container" >/dev/null 2>&1 || true
  docker rm -f "$wire_container" >/dev/null 2>&1 || true
  docker rm -f "$postgres_container" >/dev/null 2>&1 || true
  docker network rm "$docker_network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p .cache/mix .cache/hex
# Keep database traffic inside this job. Host networking and fixed host ports
# make independent Buildkite jobs depend on shared runner state.
docker network create "$docker_network" >/dev/null

docker run --rm --detach \
  --name "$postgres_container" \
  --network "$docker_network" \
  --network-alias postgres \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=wheel_sync \
  postgres:17-alpine >/dev/null

# The official image starts a temporary Postgres server while it creates the
# requested database, stops it, then replaces PID 1 with the final server.
# pg_isready alone can observe that temporary server and race its shutdown.
postgres_is_ready() {
  docker exec "$postgres_container" sh -c \
    'test "$(cat /proc/1/comm)" = postgres && pg_isready -U postgres -d wheel_sync' \
    >/dev/null 2>&1
}

for _attempt in $(seq 1 60); do
  if postgres_is_ready; then
    break
  fi
  sleep 0.5
done

if ! postgres_is_ready; then
  docker logs "$postgres_container"
  exit 1
fi
database_url="postgres://postgres:postgres@postgres:5432/wheel_sync"

docker run --rm \
  --network "$docker_network" \
  --user "$(id -u):$(id -g)" \
  --volume "$repo_dir:/workspace" \
  --workdir /workspace \
  --env "DATABASE_URL=$database_url" \
  --env MIX_HOME=/workspace/.cache/mix \
  --env HEX_HOME=/workspace/.cache/hex \
  "$elixir_image" \
  bash -lc '
    set -euo pipefail
    mix local.hex --force
    mix local.rebar --force
    cd elixir/wheel_sync
    MIX_ENV=test mix deps.get
    mix format --check-formatted
    MIX_ENV=test mix test --warnings-as-errors
    MIX_ENV=test mix hex.build --output _build/wheel_sync.tar
    cd ../tracker
    mix deps.get
    mix format --check-formatted
    mix compile --warnings-as-errors
    cd ../spoke
    mix deps.get
    mix format --check-formatted
    mix compile --warnings-as-errors
  '

docker run --rm --detach \
  --name "$wire_container" \
  --network "$docker_network" \
  --publish 127.0.0.1::4801 \
  --user "$(id -u):$(id -g)" \
  --volume "$repo_dir:/workspace" \
  --workdir /workspace/elixir/wheel_sync \
  --env "DATABASE_URL=$database_url" \
  --env MIX_ENV=test \
  --env PORT=4801 \
  --env WHEEL_SYNC_IP=0.0.0.0 \
  --env MIX_HOME=/workspace/.cache/mix \
  --env HEX_HOME=/workspace/.cache/hex \
  "$elixir_image" \
  mix run test/support/wire_server.exs >/dev/null

wire_address="$(docker port "$wire_container" 4801/tcp)"
wire_host_port="${wire_address##*:}"
wire_url="http://127.0.0.1:$wire_host_port"

for _attempt in $(seq 1 60); do
  if curl --fail --silent "$wire_url/readyz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl --fail --silent "$wire_url/readyz" >/dev/null; then
  docker logs "$wire_container"
  exit 1
fi

WHEEL_WIRE_URL="$wire_url" WHEEL_WIRE_LABEL="Elixir Postgres" bun run test:wire

docker rm -f "$wire_container" >/dev/null

docker run --rm --detach \
  --name "$tracker_container" \
  --network "$docker_network" \
  --publish 127.0.0.1::4799 \
  --user "$(id -u):$(id -g)" \
  --volume "$repo_dir:/workspace" \
  --workdir /workspace/elixir/tracker \
  --env "DATABASE_URL=$database_url" \
  --env TRACKER_PORT=4799 \
  --env TRACKER_IP=0.0.0.0 \
  --env TRACKER_RESET_DATABASE=1 \
  --env MIX_HOME=/workspace/.cache/mix \
  --env HEX_HOME=/workspace/.cache/hex \
  "$elixir_image" \
  mix run --no-halt >/dev/null

tracker_address="$(docker port "$tracker_container" 4799/tcp)"
tracker_host_port="${tracker_address##*:}"
tracker_url="http://127.0.0.1:$tracker_host_port"

for _attempt in $(seq 1 60); do
  if curl --fail --silent "$tracker_url/readyz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl --fail --silent "$tracker_url/readyz" >/dev/null; then
  docker logs "$tracker_container"
  exit 1
fi

TRACKER_BROWSER_SYNC_ORIGIN="$tracker_url" bun run test:browser:tracker:postgres
