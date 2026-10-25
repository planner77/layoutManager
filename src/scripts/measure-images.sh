#!/usr/bin/env bash
# Issues #28/#67: compare same-source linux/amd64 web builds. A docker-save gzip size is
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
table+="\nBaseline → standalone uncompressed reduction: $saving% (historical #28 metric; functional tests remain mandatory)."
printf '%b\n' "$table"
docker system df -v
if [ -n "$report" ]; then
  printf '\n## Issue #28 — Docker image measurement\n\n%b\n\n' "$table" >> "$report"
  printf '%s\n' 'Image digest from GHCR requires the published manifest: docker buildx imagetools inspect ghcr.io/planner77/layoutmanager:<version>.' >> "$report"
fi

# Issue #67: report file-level raw/gzip proxy sizes for required static assets.
# No glyph subsets, fonts, WASM, or dynamically traced modules are deleted.
optimized="${images[2]}"
asset_table='| Public asset | Raw bytes | File gzip-1 proxy bytes (NOT OCI) |'
asset_table+=$'\n| --- | ---: | ---: |'
for asset in \
  fonts/NanumGothic-Regular.ttf \
  fonts/CadKorean.typeface.json \
  libredwg/dist/libredwg-web.js \
  libredwg/wasm/libredwg-web.js \
  libredwg/wasm/libredwg-web.wasm; do
  file="/app/src/public/$asset"
  raw="$(docker run --rm --entrypoint sh "$optimized" -c "test -f '$file' && wc -c < '$file'" | tr -d '[:space:]')"
  compressed="$(docker run --rm --entrypoint cat "$optimized" "$file" | gzip -1 | wc -c | tr -d '[:space:]')"
  asset_table+=$'\n'
  asset_table+="| $asset | $raw | $compressed |"
done
traced="$(docker run --rm --entrypoint sh "$optimized" -c \
  'find /app/src/node_modules /app/src/.next/server -type f -printf "%s %p\n" 2>/dev/null | sort -nr | head -n 20')"
printf '\nIssue #67 static assets:\n%b\n' "$asset_table"
printf '\nIssue #67 traced server files, top 20 by raw bytes:\n%s\n' "$traced"
if [ -n "$report" ]; then
  {
    printf '\n## Issue #67 — Static asset size and traced file candidates\n\n%b\n\n' "$asset_table"
    printf '%s\n' 'Top 20 server-side traced files in node_modules and .next/server (raw bytes, inspect-only candidates):'
    printf '%s\n' "$traced" | sed 's/^/    /'
    printf '\n%s\n' 'Required: full Hangul TTF/typeface; LibreDWG JS/WASM; client .next/static; better-sqlite3 native and generated Prisma. Per-file gzip is only a proxy, not an attributed GHCR OCI layer size.'
  } >> "$report"
fi
