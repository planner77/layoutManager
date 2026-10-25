#!/usr/bin/env bash
# Issue #66. Distinguish local uncompressed image bytes from gzip proxy
# and from OCI registry-compressed layer bytes (measured after GHCR publish).
set -euo pipefail
if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 BASELINE_MIGRATOR OPTIMIZED_MIGRATOR [summary-file]" >&2
  exit 2
fi
baseline="$1"
optimized="$2"
summary="${3:-}"
declare -a sizes
table='| Migrator | Platform | Local image bytes (uncompressed) | docker-save gzip bytes (proxy, NOT OCI) |'
table+=$'\n| --- | --- | ---: | ---: |'
for i in 0 1; do
  if [ "$i" -eq 0 ]; then image="$baseline"; else image="$optimized"; fi
  platform="$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')"
  if [ "$platform" != "linux/amd64" ]; then echo "Invalid platform: $image ($platform)" >&2; exit 1; fi
  sizes[$i]="$(docker image inspect "$image" --format '{{.Size}}')"
  gzip_bytes="$(docker save "$image" | gzip -1 | wc -c | tr -d ' ')"
  table+=$'\n'
  table+="| $image | $platform | ${sizes[$i]} | $gzip_bytes |"
  echo "=== Migrator image history: $image ==="
  docker history --no-trunc "$image"
  echo "=== Migrator directories and largest installed modules (MiB): $image ==="
  docker run --rm --entrypoint sh "$image" -c 'du -sm /app/src/node_modules /app/src/generated /app/src/scripts /app/src/server 2>/dev/null || true; du -sm /app/src/node_modules/* /app/src/node_modules/@*/* 2>/dev/null | sort -nr | head -n 20 || true'
done
reduction="$(awk -v b="${sizes[0]}" -v n="${sizes[1]}" 'BEGIN {if(b==0) exit 1; printf "%.2f", (b-n)*100/b}')"
table+=$'\n'
table+="\nBaseline migrator → optimized migrator uncompressed reduction: $reduction% (>=30% soft target; not a release gate)."
table+="\nBaseline is this PR base Dockerfile migrator at the current source, NOT the pre-#28 2.05 GB web image."
printf '%b\n' "$table"
if [ -n "$summary" ]; then
  printf '\n## Issue #66 — Migrator image comparison (linux/amd64)\n\n%b\n\n' "$table" >> "$summary"
fi
