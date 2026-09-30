#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and fill in production values."
  exit 1
fi

for secret in secrets/restic_password secrets/id_ed25519 secrets/known_hosts; do
  if [ ! -s "$secret" ]; then
    echo "Missing or empty required backup secret: $secret"
    exit 1
  fi
done

chmod 600 secrets/restic_password secrets/id_ed25519 secrets/known_hosts

echo "Validating Compose configuration..."
docker compose config >/dev/null

echo "Pulling application images..."
docker compose pull opsboard dispatchboard engineer caddy postgres

echo "Building backup worker..."
docker compose build backup

echo "Starting production stack..."
docker compose up -d --remove-orphans

echo "Waiting for container health..."
for i in $(seq 1 30); do
  unhealthy="$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"unhealthy"' || true)"
  starting="$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"starting"' || true)"
  if [ "$unhealthy" -eq 0 ] && [ "$starting" -eq 0 ]; then
    break
  fi
  sleep 2
done

docker compose ps

if docker compose ps --format json 2>/dev/null | grep -q '"Health":"unhealthy"'; then
  echo "One or more services are unhealthy. Inspect with: docker compose logs --tail=200"
  exit 1
fi

echo
echo "Deployment complete."
