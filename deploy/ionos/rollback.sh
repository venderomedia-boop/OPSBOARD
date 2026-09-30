#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ "$#" -ne 1 ]; then
  echo "Usage: ./rollback.sh <git-sha-or-image-tag>"
  exit 1
fi

tag="$1"
if ! [[ "$tag" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid image tag."
  exit 1
fi

if grep -q '^APP_TAG=' .env; then
  sed -i "s/^APP_TAG=.*/APP_TAG=$tag/" .env
else
  printf '\nAPP_TAG=%s\n' "$tag" >> .env
fi

echo "Rolling application containers back to tag: $tag"
docker compose pull opsboard dispatchboard engineer
docker compose up -d --no-deps opsboard dispatchboard engineer
docker compose ps
