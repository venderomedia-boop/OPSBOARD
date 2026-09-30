#!/bin/sh
set -eu

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
export RESTIC_PASSWORD_FILE=/run/secrets/restic_password

target="/tmp/vendero-restore-test-$(date +%s)"
cleanup() { rm -rf "$target"; }
trap cleanup EXIT INT TERM

echo "Restoring latest Vendero snapshot into temporary test directory..."
restic restore latest --tag vendero-vps --target "$target"

pg_dump_file="$target/backups/postgres.dump"
sqlite_file="$target/backups/phase1-compliance.sqlite"

if [ ! -s "$pg_dump_file" ]; then
  echo "PostgreSQL backup archive is missing or empty."
  exit 1
fi

pg_restore --list "$pg_dump_file" >/dev/null
echo "PostgreSQL archive validation passed."

if [ -f "$sqlite_file" ]; then
  result="$(sqlite3 "$sqlite_file" 'PRAGMA integrity_check;')"
  if [ "$result" != "ok" ]; then
    echo "SQLite integrity check failed: $result"
    exit 1
  fi
  echo "SQLite integrity validation passed."
else
  echo "SQLite snapshot not present in latest backup."
  exit 1
fi

if [ ! -d "$target/sources/phase1" ] || [ ! -d "$target/sources/dispatchboard" ]; then
  echo "One or more application data volumes are missing from the restored snapshot."
  exit 1
fi

echo "Restore verification passed for the latest Vendero snapshot."
