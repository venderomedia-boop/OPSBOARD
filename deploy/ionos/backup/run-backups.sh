#!/bin/sh
set -eu

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${BACKUP_INTERVAL_SECONDS:=21600}"
export RESTIC_PASSWORD_FILE=/run/secrets/restic_password

chmod 600 /root/.ssh/id_ed25519
chmod 600 /root/.ssh/known_hosts

if ! restic snapshots >/dev/null 2>&1; then
  echo "Initialising encrypted Restic repository..."
  restic init
fi

while true; do
  echo "Starting Vendero backup at $(date -Iseconds)"
  mkdir -p /backups
  pg_dump --format=custom --file=/backups/postgres.dump.tmp
  mv /backups/postgres.dump.tmp /backups/postgres.dump
  restic backup /sources/opsboard /sources/dispatchboard /backups/postgres.dump --tag vendero-vps
  restic forget --keep-daily 30 --keep-weekly 8 --keep-monthly 12 --prune
  restic check --read-data-subset=1/50
  echo "Backup complete. Sleeping ${BACKUP_INTERVAL_SECONDS}s."
  sleep "${BACKUP_INTERVAL_SECONDS}"
done
