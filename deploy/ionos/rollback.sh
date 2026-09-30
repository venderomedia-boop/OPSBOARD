#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ "$#" -ne 2 ]; then
  echo "Usage: bash rollback.sh <opsboard|dispatchboard|engineer> <image-tag>"
  exit 1
fi

service="$1"
tag="$2"

if ! [[ "$tag" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid image tag."
  exit 1
fi

case "$service" in
  opsboard)
    key="OPSBOARD_TAG"
    compose_service="opsboard"
    ;;
  dispatchboard)
    key="DISPATCHBOARD_TAG"
    compose_service="dispatchboard"
    ;;
  engineer)
    key="ENGINEER_TAG"
    compose_service="engineer"
    ;;
  *)
    echo "Unknown service: $service"
    echo "Use: opsboard, dispatchboard, or engineer"
    exit 1
    ;;
esac

if grep -q "^${key}=" .env; then
  sed -i "s/^${key}=.*/${key}=${tag}/" .env
else
  printf '\n%s=%s\n' "$key" "$tag" >> .env
fi

echo "Rolling ${compose_service} back to image tag: ${tag}"
docker compose pull "$compose_service"
docker compose up -d --no-deps "$compose_service"
docker compose ps "$compose_service"
