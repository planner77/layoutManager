#!/usr/bin/env bash
set -euo pipefail
: "${RUNNER_TEMP:?}" "${GITHUB_ENV:?}"
[[ -d "$RUNNER_TEMP" && -f "$GITHUB_ENV" ]]
printf 'CP_PACKET_PATH=%s\n' "$RUNNER_TEMP/issue225-cp-packet.json" >> "$GITHUB_ENV"
printf 'CP_RESULT_PATH=%s\n' "$RUNNER_TEMP/issue225-cp-observations.json" >> "$GITHUB_ENV"
