#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${SOLO_PROCESS_ID:-}" || "${TERM_PROGRAM:-}" == "solo" ]]; then
  echo "Use the Solo postgres and Spoke Elixir processes for local tests."
  exit 1
fi

run_id="${BUILDKITE_JOB_ID:-local-$$}"
postgres_container="wheel-spoke-postgres-$run_id"
node_one_container="wheel-spoke-one-$run_id"
node_two_container="wheel-spoke-two-$run_id"
docker_network="wheel-spoke-$run_id"
elixir_image="hexpm/elixir:1.18.4-erlang-27.3.4.7-debian-bookworm-20260610-slim"
repo_dir="$PWD"

cleanup() {
  docker rm -f "$node_two_container" >/dev/null 2>&1 || true
  docker rm -f "$node_one_container" >/dev/null 2>&1 || true
  docker rm -f "$postgres_container" >/dev/null 2>&1 || true
  docker network rm "$docker_network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p .cache/mix .cache/hex
docker network create "$docker_network" >/dev/null
docker run --rm --detach \
  --name "$postgres_container" \
  --network "$docker_network" \
  --network-alias postgres \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=wheel_sync \
  postgres:17-alpine >/dev/null

postgres_is_ready() {
  docker exec "$postgres_container" sh -c \
    'test "$(cat /proc/1/comm)" = postgres && pg_isready -U postgres -d wheel_sync' \
    >/dev/null 2>&1
}

for _attempt in $(seq 1 60); do
  if postgres_is_ready; then break; fi
  sleep 0.5
done
if ! postgres_is_ready; then
  docker logs "$postgres_container"
  exit 1
fi

database_url="postgres://postgres:postgres@postgres:5432/wheel_sync"

start_node() {
  local container="$1"
  local port="$2"
  local reset="$3"

  docker run --rm --detach \
    --name "$container" \
    --network "$docker_network" \
    --publish "127.0.0.1::$port" \
    --user "$(id -u):$(id -g)" \
    --volume "$repo_dir:/workspace" \
    --workdir /workspace/elixir/spoke \
    --env "DATABASE_URL=$database_url" \
    --env "SPOKE_PORT=$port" \
    --env SPOKE_IP=0.0.0.0 \
    --env "SPOKE_RESET_DATABASE=$reset" \
    --env SPOKE_TEST_CONTROLS=1 \
    --env SPOKE_ALLOWED_ORIGINS=http://127.0.0.1:4907 \
    --env MIX_HOME=/workspace/.cache/mix \
    --env HEX_HOME=/workspace/.cache/hex \
    "$elixir_image" \
    mix run --no-halt >/dev/null
}

wait_for_node() {
  local container="$1"
  local port="$2"
  local address
  local origin

  for _attempt in $(seq 1 120); do
    address="$(docker port "$container" "$port/tcp" 2>/dev/null || true)"
    if [[ -n "$address" ]]; then
      origin="http://127.0.0.1:${address##*:}"
      if curl --fail --silent "$origin/readyz" >/dev/null 2>&1; then
        echo "$origin"
        return 0
      fi
    fi
    sleep 0.5
  done

  docker logs "$container"
  return 1
}

start_node "$node_one_container" 4906 1
node_one_origin="$(wait_for_node "$node_one_container" 4906)"
start_node "$node_two_container" 4908 0
node_two_origin="$(wait_for_node "$node_two_container" 4908)"

SPOKE_BROWSER_SYNC_ORIGIN="$node_one_origin" bun run test:browser:spoke:postgres

SPOKE_BROWSER_SYNC_ORIGIN="$node_one_origin" \
SPOKE_NODE_ONE_ORIGIN="$node_one_origin" \
SPOKE_NODE_TWO_ORIGIN="$node_two_origin" \
bun run test:browser:spoke:multinode
