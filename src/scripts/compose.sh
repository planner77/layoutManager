#!/usr/bin/env bash
# Issue #28: normalize tagged/tagless Docker image pairs before invoking Compose.
# Reads ONLY the image reference keys from the env file (never sources secrets).
# Example: bash src/scripts/compose.sh .env up -d
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo 'Usage: bash src/scripts/compose.sh ENV_FILE [--print-images | compose-args...]' >&2
  exit 2
fi
env_file="$1"
shift
if [ ! -r "$env_file" ]; then
  echo 'Docker Compose environment file is not readable' >&2
  exit 2
fi

read_image_key() {
  local key="$1" line value=''
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^[[:space:]]*${key}[[:space:]]*=(.*)$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
  done < "$env_file"
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then value="${value:1:${#value}-2}"; fi
  if [[ "$value" == \'*\' && "$value" == *\' ]]; then value="${value:1:${#value}-2}"; fi
  printf '%s' "$value"
}

app_image="${GHCR_IMAGE:-$(read_image_key GHCR_IMAGE)}"
app_image="${app_image:-cad-layout-viewer:local}"
migration_image="${GHCR_MIGRATION_IMAGE:-$(read_image_key GHCR_MIGRATION_IMAGE)}"

if [[ "$app_image" == *@* ]]; then
  if [ -z "$migration_image" ]; then
    echo 'Digest-pinned GHCR_IMAGE requires GHCR_MIGRATION_IMAGE explicitly' >&2
    exit 2
  fi
else
  # Docker defaults tagless image names to :latest. Registry host ports are
  # ignored by checking the final image-name component only.
  if [[ "${app_image##*/}" != *:* ]]; then
    app_image="${app_image}:latest"
  fi
  if [ -z "$migration_image" ]; then
    migration_image="${app_image}-migrate"
  fi
fi

# Print only image references for isolated unit/CI tests (no registry/network).
if [ "${1:-}" = '--print-images' ]; then
  printf 'app=%s\nmigrate=%s\n' "$app_image" "$migration_image"
  exit 0
fi

export GHCR_IMAGE="$app_image" GHCR_MIGRATION_IMAGE="$migration_image"
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec docker compose --env-file "$env_file" -f "$project_root/src/docker-compose.yml" "$@"
