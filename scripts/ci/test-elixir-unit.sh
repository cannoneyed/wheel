#!/usr/bin/env bash
set -euo pipefail

elixir_image="hexpm/elixir:1.18.4-erlang-27.3.4.7-debian-bookworm-20260610-slim"
repo_dir="$PWD"

mkdir -p .cache/mix .cache/hex

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --volume "$repo_dir:/workspace" \
  --workdir /workspace \
  --env MIX_HOME=/workspace/.cache/mix \
  --env HEX_HOME=/workspace/.cache/hex \
  "$elixir_image" \
  bash -lc '
    mix local.hex --force
    mix local.rebar --force
    cd elixir/wheel_sync
    mix deps.get
    mix format --check-formatted
    mix test --warnings-as-errors
    cd ../tracker
    mix deps.get
    mix format --check-formatted
    mix compile --warnings-as-errors
  '
