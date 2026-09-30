#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and fill in production values."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

required_vars=(
  APP_DOMAIN ENGINEER_DOMAIN TLS_EMAIL
  OPSBOARD_TAG DISPATCHBOARD_TAG ENGINEER_TAG
  POSTGRES_PASSWORD AUTH_TOKEN_SECRET
  BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
  RESTIC_REPOSITORY
)

echo "Validating production environment..."
for key in "${required_vars[@]}"; do
  value="${!key:-}"
  if [ -z "$value" ]; then
    echo "Missing required production setting: $key"
    exit 1
  fi
  if [[ "$value" == *"replace-with"* ]] || [[ "$value" == *"example.co.uk"* ]]; then
    echo "Production setting still contains a placeholder: $key"
    exit 1
  fi
done

for key in OPSBOARD_TAG DISPATCHBOARD_TAG ENGINEER_TAG; do
  if [ "${!key}" = "latest" ]; then
    echo "$key must be pinned to a tested image tag, not latest."
    exit 1
  fi
done

if [ "${#AUTH_TOKEN_SECRET}" -lt 32 ]; then
  echo "AUTH_TOKEN_SECRET must be at least 32 characters."
  exit 1
fi

if [ "${#POSTGRES_PASSWORD}" -lt 20 ]; then
  echo "POSTGRES_PASSWORD must be at least 20 characters."
  exit 1
fi

if [ "${#BOOTSTRAP_ADMIN_PASSWORD}" -lt 12 ]; then
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
