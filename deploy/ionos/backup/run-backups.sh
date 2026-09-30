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
  pg_dump --format=custom --file=/backups/postgres.dump.tmp
  mv /backups/postgres.dump.tmp /backups/postgres.dump

  if [ -f /sources/phase1/phase1-compliance.sqlite ]; then
    rm -f /backups/phase1-compliance.sqlite.tmp
    sqlite3 /sources/phase1/phase1-compliance.sqlite ".backup '/backups/phase1-compliance.sqlite.tmp'"
    mv /backups/phase1-compliance.sqlite.tmp /backups/phase1-compliance.sqlite
  fi

  restic backup /sources/phase1 /sources/dispatchboard /backups --tag vendero-vps
  restic forget --keep-daily 30 --keep-weekly 8 --keep-monthly 12 --prune
  restic check --read-data-subset=1/50
  restic snapshots --latest 1 --tag vendero-vps
  date +%s > /backups/last-success-epoch
  echo "Backup complete. Sleeping ${BACKUP_INTERVAL_SECONDS}s."
  sleep "${BACKUP_INTERVAL_SECONDS}"
done
