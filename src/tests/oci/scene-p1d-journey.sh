#!/usr/bin/env bash
# Issue #225 P1-D: genuine HTTP App + independent Docker CPU Worker + Chromium.
# Owns ONLY a new run/attempt-scoped Docker volume and app container; no GHCR.
set -Eeuo pipefail
if [[ "${GITHUB_ACTIONS:-}" != true || "${GITHUB_EVENT_NAME:-}" != pull_request ||
      "${GITHUB_REPOSITORY:-}" != planner77/layoutManager ]]; then
  echo "::error::P1D Docker test is PR CI only" >&2
  exit 2
fi
: "${GITHUB_RUN_ID:?}"
: "${GITHUB_RUN_ATTEMPT:?}"
: "${GITHUB_SHA:?}"
[[ "${GITHUB_RUN_ID}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT}" =~ ^[0-9]+$ ]] || exit 2
[[ "${GITHUB_SHA}" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ -f src/tests/oci/scene-p1d-probe.mjs ]] || exit 2
volume="layoutmanager-ci-p1d-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
app="layoutmanager-ci-p1d-app-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
runtime_image=cad-layout-viewer:ci
migrator_image=cad-layout-viewer:ci-migrate
worker_image=cad-layout-viewer:ci-cpu-worker
owned=false
app_owned=false
cleanup(){
  local rc=$?
  trap - EXIT
  unset G7_P1D_SETUP_CODE
  if [[ "$app_owned" == true ]]; then
    docker rm -f "$app" >/dev/null 2>&1 || rc=1
  fi
  if [[ "$owned" == true ]]; then
    docker volume rm "$volume" >/dev/null || {
      echo "::error::P1D owned volume cleanup failed" >&2
      rc=1
    }
  fi
  exit "$rc"
}
trap cleanup EXIT

if docker volume inspect "$volume" >/dev/null 2>&1 ||
   docker container inspect "$app" >/dev/null 2>&1; then
  echo "::error::P1D refuses existing Docker resources" >&2
  exit 1
fi
for image in "$runtime_image" "$migrator_image" "$worker_image"; do
  test "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$GITHUB_SHA"
done
test "$(docker image inspect "$runtime_image" --format '{{index .Config.Labels "com.planner77.g7.image-role"}}')" = app
test "$(docker image inspect "$migrator_image" --format '{{index .Config.Labels "com.planner77.g7.image-role"}}')" = migrator
test "$(docker image inspect "$worker_image" --format '{{index .Config.Labels "com.planner77.g7.image-role"}}')" = cpu-worker
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
[[ "$port" =~ ^[0-9]{4,5}$ ]] || exit 2
origin="http://127.0.0.1:$port"

docker volume create --label com.planner77.purpose=ci-scene-p1d "$volume" >/dev/null
owned=true
shared=(
  --mount "type=volume,source=$volume,target=/data"
  -e G7_GREENFIELD_MODE=true
  -e G7_GREENFIELD_AUTOMATED=true
  -e DATABASE_URL=file:/data/db/cad.sqlite
  -e CAD_STORAGE_PATH=/data/cad
  -e CAD_STORAGE_BACKEND=local
  -e G7_DEPLOY_APP_IMAGE=cad-layout-viewer:local
  -e G7_DEPLOY_MIGRATOR_IMAGE=cad-layout-viewer:local-migrate
  -e "G7_RELEASE_SOURCE_COMMIT=$GITHUB_SHA"
)
docker run --rm --network none --user 10001:10001 "${shared[@]}" \
  -e G7_AUTH_ENABLED=false -e G7_CAD_WRITE_CUTOVER_ENABLED=false \
  -e G7_GREENFIELD_INSTALL_ACK=CREATE_EMPTY_G7_DATABASE \
  --entrypoint node "$migrator_image" --import tsx scripts/g7-greenfield.ts auto

# The ownership marker is a separate, purpose-specific file outside the DB/CAD
# directories. A probe must refuse any volume without this exact marker.
docker run --rm --network none --user 10001:10001 \
  --mount "type=volume,source=$volume,target=/data" \
  --entrypoint sh "$migrator_image" -c \
  'test ! -e /data/ci-scene-p1d-ownership && printf "P1D_CI_ONLY\n" > /data/ci-scene-p1d-ownership'
G7_P1D_SETUP_CODE="$(docker run --rm --network none --user 10001:10001 \
  --mount "type=volume,source=$volume,target=/data" \
  --entrypoint cat "$migrator_image" /data/db/first-admin.code)"
[[ "$G7_P1D_SETUP_CODE" =~ ^[A-Za-z0-9_-]{43}$ ]] || {
  echo "::error::P1D owned G7 setup code invalid" >&2
  exit 1
}
export G7_P1D_SETUP_CODE

docker run -d --name "$app" --user 10001:10001 \
  --publish "127.0.0.1:$port:3000" \
  --cap-drop ALL --security-opt no-new-privileges \
  "${shared[@]}" \
  -e NODE_ENV=production \
  -e G7_AUTH_ENABLED=true -e G7_CAD_WRITE_CUTOVER_ENABLED=true \
  -e "G7_RUNTIME_ORIGIN=$origin" -e G7_RUNTIME_ALLOW_HTTP=true \
  -e SCENE_AUTO_BUILD_ENABLED=true -e SCENE_CPU_WORKER_ENABLED=true \
  "$runtime_image" >/dev/null
app_owned=true

ready=false
for ((i=0;i<60;i++)); do
  if curl --silent --fail --max-time 2 "$origin/api/health" >/dev/null; then
    ready=true
    break
  fi
  if [[ "$(docker inspect -f '{{.State.Running}}' "$app")" != true ]]; then
    echo "::error::P1D owned App container terminated before HTTP health" >&2
    exit 1
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  echo "::error::P1D owned App HTTP health not ready" >&2
  exit 1
fi

export G7_P1D_ORIGIN="$origin"
export G7_P1D_VOLUME="$volume"
export G7_P1D_PROBE="$PWD/src/tests/oci/scene-p1d-probe.mjs"
export G7_P1D_SOURCE_SHA="$GITHUB_SHA"
npx playwright test --config playwright.scene-p1d.config.ts --reporter=line

# The proof was allowed only in a closed test volume. No PROD settings changed.
echo "P1D_HTTP_OCI_VIEWER_PROOF_PASS: isolated signed upload, worker and new-session viewer"
