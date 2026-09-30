#!/bin/sh
set -eu

: "${BACKUP_INTERVAL_SECONDS:=21600}"
: "${BACKUP_STALE_GRACE_SECONDS:=3600}"

stamp_file=/backups/last-success-epoch
if [ ! -s "$stamp_file" ]; then
  echo "No successful backup heartbeat yet."
  exit 1
fi

last="$(cat "$stamp_file")"
now="$(date +%s)"
max_age="$((BACKUP_INTERVAL_SECONDS + BACKUP_STALE_GRACE_SECONDS))"
age="$((now - last))"

if [ "$age" -gt "$max_age" ]; then
  echo "Latest successful backup is stale: ${age}s old (limit ${max_age}s)."
  exit 1
fi

echo "Backup heartbeat healthy: ${age}s old."
