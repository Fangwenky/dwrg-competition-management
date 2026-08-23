#!/usr/bin/env bash
set -euo pipefail

project_name="dwrg-e2e"
compose_file="docker-compose.test.yml"
export DATABASE_URL="postgres://dwrg_test:dwrg_test_password@127.0.0.1:55432/dwrg_test"
export APP_URL="http://127.0.0.1:3310"
export BOOTSTRAP_ADMIN_USERNAME="admin"
export BOOTSTRAP_ADMIN_PASSWORD="E2E_Admin_2026!"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the isolated E2E database. Install Docker Desktop, then rerun pnpm test:e2e." >&2
  exit 1
fi

cleanup() {
  docker compose -p "$project_name" -f "$compose_file" down --volumes >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cleanup
docker compose -p "$project_name" -f "$compose_file" up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm exec playwright test "$@"
