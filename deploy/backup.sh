#!/usr/bin/env bash
set -euo pipefail

DW_BACKUP_ROOT="/opt/dwrg/backups"
DW_DATA_ROOT="/opt/dwrg/data"
DW_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DW_TARGET="$DW_BACKUP_ROOT/$DW_TIMESTAMP"
mkdir -p "$DW_TARGET"

cd /opt/dwrg/source
docker-compose exec -T db pg_dump -U dwrg -d dwrg -Fc > "$DW_TARGET/database.dump"
tar -C "$DW_DATA_ROOT" -czf "$DW_TARGET/uploads.tar.gz" uploads
find "$DW_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} +
echo "Backup completed: $DW_TARGET"
