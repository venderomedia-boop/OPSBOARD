#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and fill in production values."
  exit 1
fi

read_env() {
  local key="$1"
  local line value
  line="$(grep -E "^${key}=" .env | tail -n 1 || true)"
  value="${line#*=}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

required_vars=(
  APP_DOMAIN ENGINEER_DOMAIN TLS_EMAIL
  PHASE1_API_TAG DISPATCHBOARD_TAG ENGINEER_TAG
  POSTGRES_PASSWORD AUTH_TOKEN_SECRET
  BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
  RESTIC_REPOSITORY
)

echo "Validating production environment..."
for key in "${required_vars[@]}"; do
  value="$(read_env "$key")"
  if [ -z "$value" ]; then
    echo "Missing required production setting: $key"
    exit 1
  fi
  if [[ "$value" == *"replace-with"* ]] || [[ "$value" == *"example.co.uk"* ]]; then
    echo "Production setting still contains a placeholder: $key"
    exit 1
  fi
done

for key in PHASE1_API_TAG DISPATCHBOARD_TAG ENGINEER_TAG; do
  value="$(read_env "$key")"
  if [ "$value" = "latest" ]; then
    echo "$key must be pinned to a tested image tag, not latest."
    exit 1
  fi
done

auth_secret="$(read_env AUTH_TOKEN_SECRET)"
postgres_password="$(read_env POSTGRES_PASSWORD)"
admin_password="$(read_env BOOTSTRAP_ADMIN_PASSWORD)"

if [ "${#auth_secret}" -lt 32 ]; then
  echo "AUTH_TOKEN_SECRET must be at least 32 characters."
  exit 1
fi

if [ "${#postgres_password}" -lt 20 ]; then
  echo "POSTGRES_PASSWORD must be at least 20 characters."
  exit 1
fi

if [ "${#admin_password}" -lt 12 ]; then
  echo "BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters."
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
docker compose pull phase1-api dispatchboard engineer caddy postgres

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

echo "Checking required service state..."
for service in postgres phase1-api dispatchboard engineer caddy backup; do
  container_id="$(docker compose ps -q "$service")"
  if [ -z "$container_id" ]; then
    echo "Required service has no container: $service"
    exit 1
  fi
  running="$(docker inspect -f '{{.State.Running}}' "$container_id")"
  if [ "$running" != "true" ]; then
    echo "Required service is not running: $service"
    docker compose logs --tail=100 "$service" || true
    exit 1
  fi
done

for service in postgres phase1-api dispatchboard engineer; do
  container_id="$(docker compose ps -q "$service")"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
  if [ "$health" != "healthy" ]; then
    echo "Required service is not healthy: $service (status: $health)"
    docker compose logs --tail=100 "$service" || true
    exit 1
  fi
done

echo
echo "Deployment complete. Backup health may remain 'starting' until the first encrypted snapshot finishes."
