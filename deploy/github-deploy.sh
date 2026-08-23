#!/usr/bin/env bash
set -Eeuo pipefail

commit_sha="${1:-}"
deploy_root="/opt/dwrg"
incoming_root="$deploy_root/incoming"
source_root="$deploy_root/source"
rollback_root="$deploy_root/rollbacks"
compose_project="source"

if [[ ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full 40-character Git commit SHA is required." >&2
  exit 2
fi

incoming_dir="$incoming_root/$commit_sha"
rollback_dir="$rollback_root/$commit_sha"
rollback_image="dwrg-app-rollback:$commit_sha"

for required in "$incoming_dir/Dockerfile" "$incoming_dir/docker-compose.yml" "$incoming_dir/package.json" "$source_root/.env"; do
  if [[ ! -f "$required" ]]; then
    echo "Required deployment file is missing: $required" >&2
    exit 2
  fi
done

install -d -m 0750 "$rollback_root"
exec 9>"/var/lock/dwrg-deploy.lock"
if ! flock -n 9; then
  echo "Another DWRG deployment is already running." >&2
  exit 3
fi

rm -rf -- "$rollback_dir"
install -d -m 0750 "$rollback_dir/source"
rsync -a --delete --exclude '.env' --exclude '.git' "$source_root/" "$rollback_dir/source/"
install -m 0600 "$source_root/.env" "$rollback_dir/source/.env"

had_previous_image=false
if docker image inspect source_app:latest >/dev/null 2>&1; then
  docker tag source_app:latest "$rollback_image"
  had_previous_image=true
fi

source_updated=false
service_replaced=false

rollback() {
  local status="$1"
  trap - ERR
  set +e
  echo "Deployment failed; restoring the previous release." >&2
  if [[ "$source_updated" == "true" ]]; then
    rsync -a --delete --exclude '.env' --exclude '.git' "$rollback_dir/source/" "$source_root/"
    install -m 0600 "$rollback_dir/source/.env" "$source_root/.env"
  fi
  if [[ "$had_previous_image" == "true" ]]; then
    docker tag "$rollback_image" source_app:latest
  fi
  if [[ "$service_replaced" == "true" ]]; then
    cd "$source_root"
    docker-compose -p "$compose_project" rm -sf app
    docker-compose -p "$compose_project" up -d --no-deps app
  fi
  exit "$status"
}
trap 'rollback $?' ERR

"$source_root/deploy/backup.sh"
install -m 0600 "$source_root/.env" "$incoming_dir/.env"

cd "$incoming_dir"
docker-compose -p "$compose_project" build app

source_updated=true
rsync -a --delete --exclude '.env' --exclude '.git' "$incoming_dir/" "$source_root/"
install -m 0600 "$incoming_dir/.env" "$source_root/.env"
printf '%s\n' "$commit_sha" > "$source_root/.deployed-commit"

cd "$source_root"
docker-compose -p "$compose_project" rm -sf app
service_replaced=true
docker-compose -p "$compose_project" up -d --no-deps app

healthy=false
for _ in $(seq 1 36); do
  if curl -fsS http://127.0.0.1:3300/api/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 5
done
if [[ "$healthy" != "true" ]]; then
  echo "Application health check did not recover in time." >&2
  false
fi

docker image rm "$rollback_image" >/dev/null 2>&1 || true
rm -rf -- "$incoming_dir"
find "$rollback_root" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +
trap - ERR
echo "DWRG deployment complete: $commit_sha"
