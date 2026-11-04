#!/usr/bin/env bash
# #225: PR-only, throwaway-volume proof using actual OCI cpu-worker image.
# Never run against operations, shared volumes, GHCR tags or real CAD.
set -Eeuo pipefail
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_EVENT_NAME:-}" != "pull_request" ]]; then
  echo "::error::OCI proof is restricted to owned GitHub PR CI" >&2
  exit 2
fi
: "${GITHUB_RUN_ID:?}"
: "${GITHUB_RUN_ATTEMPT:?}"
: "${GITHUB_SHA:?}"
[[ "${GITHUB_RUN_ID}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT}" =~ ^[0-9]+$ ]] || exit 2
[[ "${GITHUB_SHA}" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ -f src/tests/oci/scene-cpu-proof-fixture.mjs ]] || exit 2
[[ -f src/package.json ]] || exit 2

volume="layoutmanager-ci-oci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
fixture="$PWD/src/tests/oci/scene-cpu-proof-fixture.mjs"
cpu_image="cad-layout-viewer:ci-cpu-worker"
migrate_image="cad-layout-viewer:ci-migrate"
owned=false
cid=""
cleanup(){
  rc=$?
  trap - EXIT
  if [[ -n "$cid" ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || rc=1
  fi
  if [[ "$owned" == true ]]; then
    docker volume rm "$volume" >/dev/null || {
      echo "::error::OCI proof test volume cleanup failed" >&2
      rc=1
    }
  fi
  exit "$rc"
}
trap cleanup EXIT
if docker volume inspect "$volume" >/dev/null 2>&1; then
  echo "::error::OCI proof refuses an existing volume" >&2
  exit 1
fi
test "$(docker image inspect "$cpu_image" --format '{{index .Config.Labels "com.planner77.g7.image-role"}}')" = cpu-worker
test "$(docker image inspect "$migrate_image" --format '{{index .Config.Labels "com.planner77.g7.image-role"}}')" = migrator
test "$(docker image inspect "$cpu_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$GITHUB_SHA"
docker volume create --label com.planner77.purpose=ci-scene-oci-proof "$volume" >/dev/null
owned=true

# This exact mount is new for THIS run. There is no Compose default volume,
# host Docker socket, host production path, network or operational env file.
security=(
  --network none --read-only --user 10001:10001
  --cap-drop ALL --security-opt no-new-privileges
  --pids-limit 64 --memory 768m --cpus 1.0
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001
  --mount "type=volume,source=$volume,target=/data"
)
file_mount=(
  --mount "type=bind,src=$fixture,dst=/app/src/scripts/ci-scene-proof-fixture.mjs,readonly"
)
g7_env=(
  -e NODE_ENV=production
  -e G7_GREENFIELD_MODE=true
  -e G7_GREENFIELD_AUTOMATED=true
  -e DATABASE_URL=file:/data/db/cad.sqlite
  -e CAD_STORAGE_PATH=/data/cad
  -e CAD_STORAGE_BACKEND=local
  -e G7_DEPLOY_APP_IMAGE=cad-layout-viewer:local
  -e G7_DEPLOY_MIGRATOR_IMAGE=cad-layout-viewer:local-migrate
  -e "G7_RELEASE_SOURCE_COMMIT=$GITHUB_SHA"
  -e G7_RUNTIME_ORIGIN=http://localhost:3000
  -e G7_RUNTIME_ALLOW_HTTP=true
)

# Unlike production, only this CI-owned volume gets an initialized new G7 DB.
docker run --rm "${security[@]}" "${g7_env[@]}" \
  -e G7_AUTH_ENABLED=false -e G7_CAD_WRITE_CUTOVER_ENABLED=false \
  -e G7_GREENFIELD_INSTALL_ACK=CREATE_EMPTY_G7_DATABASE \
  --entrypoint node "$migrate_image" --import tsx scripts/g7-greenfield.ts auto

worker_env=(
  "${g7_env[@]}"
  -e G7_AUTH_ENABLED=true
  -e G7_CAD_WRITE_CUTOVER_ENABLED=true
  -e SCENE_AUTO_BUILD_ENABLED=true
  -e SCENE_CPU_WORKER_ENABLED=true
)
fixture_step(){
  docker run --rm "${security[@]}" "${file_mount[@]}" "${worker_env[@]}" \
    --entrypoint node "$cpu_image" --import tsx \
    scripts/ci-scene-proof-fixture.mjs "$1"
}
worker_tick(){
  docker run --rm "${security[@]}" "${worker_env[@]}" \
    --entrypoint node "$cpu_image" --import tsx scripts/scene-cpu-worker.ts --once
}
assert_output(){
  local output="$1" expected="$2"
  if [[ "$output" != *"$expected"* ]]; then
    echo "::error::OCI Worker result did not match expected safe code $expected" >&2
    exit 1
  fi
}

fixture_step setup

# Inspect the actual Docker HostConfig, not merely a Compose YAML string.
cid="$(docker create "${security[@]}" "${worker_env[@]}" \
  --entrypoint node "$cpu_image" --import tsx scripts/scene-cpu-worker.ts --once)"
docker inspect "$cid" | python3 -c '
import json,sys
x=json.load(sys.stdin)[0]
h=x["HostConfig"]
c=x["Config"]
assert c["User"]=="10001:10001"
assert c["Labels"]["com.planner77.g7.image-role"]=="cpu-worker"
assert h["NetworkMode"]=="none"
assert h["ReadonlyRootfs"] is True
assert h["Privileged"] is False
assert h["Memory"]==768*1024*1024
assert h["NanoCpus"]==1_000_000_000
assert h["PidsLimit"]==64
assert "ALL" in h.get("CapDrop",[])
assert "no-new-privileges" in h.get("SecurityOpt",[])
assert "/tmp" in h.get("Tmpfs",{})
assert not h.get("PortBindings")
assert not any(m.get("Destination")=="/var/run/docker.sock" for m in x["Mounts"])
'
output="$(docker start -a "$cid")"
assert_output "$output" '"outcome":"PUBLISHED"'
test "$(docker inspect -f '{{.State.ExitCode}}' "$cid")" = 0
docker rm "$cid" >/dev/null
cid=""
fixture_step verify-ready
output="$(worker_tick)"
assert_output "$output" '"outcome":"IDLE"'

fixture_step revoke
output="$(worker_tick)"
assert_output "$output" '"code":"SCENE_AUTH_REVOKED"'
fixture_step verify-revoked

fixture_step tamper
output="$(worker_tick)"
assert_output "$output" '"code":"SCENE_SOURCE_DIGEST_MISMATCH"'
fixture_step verify-tamper

fixture_step prepare-crash
# Real SIGKILL of a separate, owned OCI process after an atomic claim.
# Unlike an OOM/in-parser crash, this only exercises stale-claim recovery.
set +e
fixture_step claim-kill > /dev/null 2>&1
kill_rc=$?
set -e
if [[ "$kill_rc" -ne 137 ]]; then
  echo "::error::Expected disposable Worker SIGKILL exit 137, got $kill_rc" >&2
  exit 1
fi
fixture_step stale
output="$(worker_tick)"
assert_output "$output" '"outcome":"IDLE"'
fixture_step verify-wait
fixture_step due
output="$(worker_tick)"
assert_output "$output" '"outcome":"PUBLISHED"'
fixture_step verify-recovered
fixture_step restore

echo "OCI_CPU_PROOF_PASS: test-owned volume; Node CPU Worker and G7 recovery checks succeeded"
