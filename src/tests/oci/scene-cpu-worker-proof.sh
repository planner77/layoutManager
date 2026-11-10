#!/usr/bin/env bash
# #225: PR-only, throwaway-volume proof using actual OCI cpu-worker image.
# Never run against operations, shared volumes, GHCR tags or real CAD.
set -Eeuo pipefail
if [[ "${1:-}" == --local ]]; then
  [[ "${GITHUB_ACTIONS:-}" != true ]] || { echo "local mode refuses CI context" >&2; exit 2; }
  [[ "${VERIFY_LOCAL_RUN_ID:-}" =~ ^[A-Za-z0-9-]{1,80}$ ]] || { echo "local run ID required" >&2; exit 2; }
  [[ "${VERIFY_LOCAL_SOURCE_FINGERPRINT:-}" =~ ^[a-f0-9]{64}$ ]] || { echo "local fingerprint required" >&2; exit 2; }
  proof_run="$(date -u +%s)$$"
  proof_attempt=1
  proof_sha="$(git rev-parse HEAD)"
  echo "LOCAL_OCI_MODE source_commit=$proof_sha worktree_identity_is_recorded_by_verify_local"
else
  if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_EVENT_NAME:-}" != "pull_request" ]]; then
    echo "::error::OCI proof requires owned PR CI or explicit --local" >&2
    exit 2
  fi
  : "${GITHUB_RUN_ID:?}"
  : "${GITHUB_RUN_ATTEMPT:?}"
  : "${GITHUB_SHA:?}"
  proof_run="$GITHUB_RUN_ID"
  proof_attempt="$GITHUB_RUN_ATTEMPT"
  proof_sha="$GITHUB_SHA"
fi
[[ "$proof_run" =~ ^[0-9]+$ && "$proof_attempt" =~ ^[0-9]+$ ]] || exit 2
[[ "$proof_sha" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ -f src/tests/oci/scene-cpu-proof-fixture.mjs ]] || exit 2
[[ -f src/package.json ]] || exit 2

volume="layoutmanager-ci-oci-${proof_run}-${proof_attempt}"
fixture="$PWD/src/tests/oci/scene-cpu-proof-fixture.mjs"
inspector="$PWD/src/tests/oci/scene-cpu-converter-inspector.mjs"
if [[ "${1:-}" == --local ]]; then
  image_prefix="cad-layout-viewer:vl-${VERIFY_LOCAL_RUN_ID,,}"
  cpu_image="${image_prefix}-worker"
  migrate_image="${image_prefix}-migrator"
  app_image="${image_prefix}-app"
else
  cpu_image="cad-layout-viewer:ci-cpu-worker"
  migrate_image="cad-layout-viewer:ci-migrate"
  app_image="cad-layout-viewer:ci"
fi
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
for pair in "$app_image:app" "$migrate_image:migrator" "$cpu_image:cpu-worker"; do
  image="${pair%:*}"
  role="${pair##*:}"
  test "$(docker image inspect "$image" --format '{{index .Config.Labels "com.planner77.g7.image-role"}}')" = "$role"
  test "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$proof_sha"
  if [[ "${1:-}" == --local ]]; then
    test "$(docker image inspect "$image" --format '{{index .Config.Labels "com.planner77.local.source-fingerprint"}}')" = "$VERIFY_LOCAL_SOURCE_FINGERPRINT"
  fi
  test "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.source"}}')" = 'https://github.com/planner77/layoutManager'
  test "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$(node -p 'require("./src/package.json").version')"
  test -n "$(docker image inspect "$image" --format '{{.Id}}')"
  echo "OCI_IMAGE_LOCAL role=$role id=$(docker image inspect "$image" --format '{{.Id}}') revision=$proof_sha"
done
if [[ "${1:-}" == --local ]]; then
  # Pin subsequent disposable container operations to the inspected image IDs.
  app_image="$(docker image inspect "$app_image" --format '{{.Id}}')"
  migrate_image="$(docker image inspect "$migrate_image" --format '{{.Id}}')"
  cpu_image="$(docker image inspect "$cpu_image" --format '{{.Id}}')"
fi
test -f "$inspector"
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
inspector_mount=(
  --mount "type=bind,src=$inspector,dst=/app/src/scripts/ci-scene-converter-inspector.mjs,readonly"
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
  -e "G7_RELEASE_SOURCE_COMMIT=$proof_sha"
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
cid="$(docker create "${security[@]}" "${worker_env[@]}" "$cpu_image")"
docker inspect "$cid" | python3 -c '
import json,sys
x=json.load(sys.stdin)[0]
h=x["HostConfig"]
c=x["Config"]
assert c["User"]=="10001:10001"
assert c["Labels"]["com.planner77.g7.image-role"]=="cpu-worker"
assert c["Entrypoint"]==["sh","scripts/scene-cpu-worker-loop.sh"]
assert h["NetworkMode"]=="none"
assert h["ReadonlyRootfs"] is True
assert h["Privileged"] is False
assert h["Memory"]==768*1024*1024
assert h["NanoCpus"]==1_000_000_000
assert h["PidsLimit"]==64
assert "ALL" in h.get("CapDrop",[])
assert any(str(option).startswith("no-new-privileges") for option in h.get("SecurityOpt",[]))
assert "/tmp" in h.get("Tmpfs",{})
assert not h.get("PortBindings")
assert not any(m.get("Destination")=="/var/run/docker.sock" for m in x["Mounts"])
'
# Exercise the ACTUAL OCI entrypoint/timeout supervisor, not just node --once.
docker start "$cid" >/dev/null
ready=0
for ((poll=0;poll<30;poll++)); do
  if fixture_step verify-ready >/dev/null 2>&1; then
    ready=1
    break
  fi
  if [[ "$(docker inspect -f '{{.State.Running}}' "$cid")" != true ]]; then
    echo "::error::OCI CPU Worker entrypoint terminated before READY" >&2
    docker logs "$cid" 2>&1 | tail -n 30 >&2
    exit 1
  fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  echo "::error::OCI CPU Worker did not reach READY within bounded polling" >&2
  docker logs "$cid" 2>&1 | tail -n 30 >&2
  exit 1
fi
docker logs "$cid" 2>&1 | grep -F '"outcome":"PUBLISHED"' >/dev/null
docker stop --time 15 "$cid" >/dev/null
test "$(docker inspect -f '{{.State.Running}}' "$cid")" = false
# Restart exactly this test-owned OCI, with all security settings unchanged.
docker start "$cid" >/dev/null
sleep 5
test "$(docker inspect -f '{{.State.Running}}' "$cid")" = true
fixture_step verify-ready
docker stop --time 15 "$cid" >/dev/null
docker rm "$cid" >/dev/null
cid=""
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
# A real Docker HOST-initiated SIGKILL after the claim is durably verified.
# The prior self-kill test masked stderr and required an unproven 137 result.
cid="$(docker create "${security[@]}" "${file_mount[@]}" "${worker_env[@]}" \
  --entrypoint node "$cpu_image" --import tsx \
  scripts/ci-scene-proof-fixture.mjs claim-wait)"
docker start "$cid" >/dev/null
claim_ready=false
for ((poll=0;poll<30;poll++)); do
  if fixture_step claim-marker >/dev/null 2>&1; then
    claim_ready=true
    break
  fi
  if [[ "$(docker inspect -f '{{.State.Running}}' "$cid")" != true ]]; then
    echo "::error::OCI owned claim worker exited before durable claim" >&2
    docker logs "$cid" 2>&1 | grep -E 'OCI_CPU_PROOF_FAILED|OCI_CPU_CLAIM_READY' >&2 || true
    exit 1
  fi
  sleep 1
done
if [[ "$claim_ready" != true ]]; then
  echo "::error::OCI owned claim worker failed durable claim assertion" >&2
  docker logs "$cid" 2>&1 | grep -E 'OCI_CPU_PROOF_FAILED|OCI_CPU_CLAIM_READY' >&2 || true
  exit 1
fi
docker kill --signal=KILL "$cid" >/dev/null
kill_rc="$(docker wait "$cid")"
inspected_rc="$(docker inspect -f '{{.State.ExitCode}}' "$cid")"
if [[ "$kill_rc" != 137 || "$inspected_rc" != 137 ]]; then
  echo "::error::OCI owned Worker SIGKILL result invalid: wait=$kill_rc inspect=$inspected_rc" >&2
  exit 1
fi
# On-disk Job RUNNING/attempt 1 plus the durable marker must survive SIGKILL.
fixture_step claim-marker
docker rm "$cid" >/dev/null
cid=""
fixture_step stale
output="$(worker_tick)"
assert_output "$output" '"outcome":"IDLE"'
fixture_step verify-wait
fixture_step due
output="$(worker_tick)"
assert_output "$output" '"outcome":"PUBLISHED"'
fixture_step verify-recovered

# Two new jobs, each paused inside the actual parser after one completed LINE.
# The debugger uses only container loopback; Docker publishes no inspector port.
for fault in kill oom; do
  fixture_step "prepare-converter-$fault"
  cid="$(docker create "${security[@]}" "${inspector_mount[@]}" "${worker_env[@]}" \
    -e "CI_CONVERTER_FAULT_MODE=$fault" --entrypoint node "$cpu_image" \
    --import tsx scripts/ci-scene-converter-inspector.mjs)"
  docker start "$cid" >/dev/null
  observed=false
  for ((poll=0;poll<40;poll++)); do
    if fixture_step "converter-$fault:running" >/dev/null 2>&1; then
      observed=true
      break
    fi
    if [[ "$(docker inspect -f '{{.State.Running}}' "$cid")" != true ]]; then
      break
    fi
    sleep 1
  done
  if [[ "$observed" != true ]] && fixture_step "converter-$fault:running" >/dev/null 2>&1; then
    observed=true
  fi
  if [[ "$observed" != true ]]; then
    echo "::error::Converter $fault frame was not verified within bounded polling" >&2
    docker logs "$cid" 2>&1 | grep -E 'OCI_INSPECTOR_|OCI_CONVERTER_|SCENE_CPU_WORKER_PROCESS_FAILED' >&2 || true
    exit 1
  fi
  if [[ "$fault" == kill ]]; then
    test "$(docker inspect -f '{{.State.Running}}' "$cid")" = true
    docker kill --signal=KILL "$cid" >/dev/null
  fi
  # OOM is only accepted when the exact owned container's cgroup reports it.
  # Polling is bounded; cleanup force-removes the CID on any stalled path.
  stopped=false
  for ((poll=0;poll<30;poll++)); do
    if [[ "$(docker inspect -f '{{.State.Running}}' "$cid")" == false ]]; then
      stopped=true
      break
    fi
    sleep 1
  done
  if [[ "$stopped" != true ]]; then
    echo "::error::Converter $fault container failed to stop" >&2
    exit 1
  fi
  wait_rc="$(docker wait "$cid")"
  inspected_rc="$(docker inspect -f '{{.State.ExitCode}}' "$cid")"
  oom_killed="$(docker inspect -f '{{.State.OOMKilled}}' "$cid")"
  expected_oom=false
  [[ "$fault" == oom ]] && expected_oom=true
  if [[ "$wait_rc" != 137 || "$inspected_rc" != 137 || "$oom_killed" != "$expected_oom" ]]; then
    echo "::error::Converter $fault exit/cgroup mismatch: wait=$wait_rc inspect=$inspected_rc oom=$oom_killed" >&2
    exit 1
  fi
  echo "OCI_CONVERTER_FAULT mode=$fault wait=$wait_rc inspect=$inspected_rc OOMKilled=$oom_killed"
  fixture_step "converter-$fault:running"
  docker rm "$cid" >/dev/null
  cid=""
  fixture_step "converter-$fault:stale"
  output="$(worker_tick)"
  assert_output "$output" '"outcome":"IDLE"'
  fixture_step "converter-$fault:wait"
  fixture_step "converter-$fault:due"
  output="$(worker_tick)"
  assert_output "$output" '"outcome":"PUBLISHED"'
  fixture_step "converter-$fault:ready"
  output="$(worker_tick)"
  assert_output "$output" '"outcome":"IDLE"'
done

# Restore includes both recovered converter jobs and the older control cases.
fixture_step restore

echo "OCI_CPU_PROOF_PASS: test-owned volume; Node CPU Worker and G7 recovery checks succeeded"
