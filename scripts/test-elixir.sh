#!/usr/bin/env bash
set -euo pipefail

if [[ "${WHEEL_ELIXIR_DOCKER:-}" == "1" ]]; then
  exec bash scripts/ci/test-elixir-unit.sh
fi

(
  cd elixir/wheel_sync
  mix deps.get
  mix format --check-formatted
  mix test --warnings-as-errors
)

(
  cd elixir/tracker
  mix deps.get
  mix format --check-formatted
  mix compile --warnings-as-errors
)
