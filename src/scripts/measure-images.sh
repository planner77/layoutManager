#!/usr/bin/env bash
# Issue #28: compare identical linux/amd64 builds. A docker-save gzip size is
# an approximation, NOT the compressed OCI/GHCR distribution manifest size.
set -euo pipefail
if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "Usage: $0 BASELINE PHASE1 STANDALONE [markdown-report-path]" >&2
  exit 2
fi
images=("$1" "$2" "$3")
report="${4:-}"
declare -a sizes
table='| Image | Platform | Uncompressed image bytes | docker-save gzip bytes (proxy) | Image ID |'
table+=$'\n| --- | --- | ---: | ---: | --- |'
for i in 0 1 2; do
  image="${images[$i]}"
  bytes="$(docker image inspect "$image" --format '{{.Size}}')"
  platform="$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')"
  id="$(docker image inspect "$image" --format '{{.Id}}')"
  if [ "$platform" != "linux/amd64" ]; then
    echo "Unexpected platform: $image = $platform" >&2
    exit 1
  fi
  sizes[$i]="$bytes"
  compressed="$(docker save "$image" | gzip -1 | wc -c | tr -d ' ')"
  table+=$'\n'
  table+="| $image | $platform | $bytes | $compressed | ${id:0:19} |"
  echo "### $image"
  docker history --no-trunc --format '{{.Size}} {{.CreatedBy}}' "$image"
  echo 'Directory footprint (MiB; missing paths omitted):'
  docker run --rm --entrypoint sh "$image" -c 'for p in /app/src/node_modules /app/src/.next /app/src/public /app/src/tests /app/src/scripts /app/src/generated /app/src/server; do if [ -e "$p" ]; then du -sm "$p"; fi; done'
done
saving="$(awk -v b="${sizes[0]}" -v f="${sizes[2]}" 'BEGIN { printf "%.2f", (b-f)*100/b }')"
table+=$'\n'
table+="\nBaseline → standalone uncompressed reduction: $saving% (soft target >=30%; functional tests remain mandatory)."
printf '%b\n' "$table"
docker system df -v
if [ -n "$report" ]; then
  printf '\n## Issue #28 — Docker image measurement\n\n%b\n\n' "$table" >> "$report"
  printf '%s\n' 'Image digest from GHCR requires the published manifest: docker buildx imagetools inspect ghcr.io/planner77/layoutmanager:<version>.' >> "$report"
fi
