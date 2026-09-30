#!/bin/sh
set -eu

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${BACKUP_INTERVAL_SECONDS:=21600}"
export RESTIC_PASSWORD_FILE=/run/secrets/restic_password

if ! restic snapshots >/dev/null 2>&1; then
  echo "Initialising encrypted Restic repository..."
  restic init
fi

while true; do
  echo "Starting Vendero backup at $(date -Iseconds)"
  mkdir -p /backups
  pg_dump "$DATABASE_URL" --format=custom --file=/backups/postgres.dump.tmp
  mv /backups/postgres.dump.tmp /backups/postgres.dump

  if [ -f /sources/opsboard/opsboard.sqlite ]; then
    rm -f /backups/opsboard.sqlite.tmp
    sqlite3 /sources/opsboard/opsboard.sqlite ".backup '/backups/opsboard.sqlite.tmp'"
    mv /backups/opsboard.sqlite.tmp /backups/opsboard.sqlite
  fi

  restic backup /sources/opsboard /sources/dispatchboard /backups --tag vendero-vps
  restic forget --keep-daily 30 --keep-weekly 8 --keep-monthly 12 --prune
  restic check --read-data-subset=1/50
  restic snapshots --latest 1 --tag vendero-vps
  date +%s > /backups/last-success-epoch
  echo "Backup complete. Sleeping ${BACKUP_INTERVAL_SECONDS}s."
  sleep "${BACKUP_INTERVAL_SECONDS}"
done
