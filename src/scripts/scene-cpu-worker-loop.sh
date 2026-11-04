#!/bin/sh
# One child per tick: an unresponsive synchronous parser is forcibly reaped
# by coreutils timeout. A SIGKILL leaves RUNNING, recovered after 180s with
# bounded retry on the next invocation. Never run two loops on the same volume.
set -eu
while :; do
  timeout -k 5s 120s node --import tsx scripts/scene-cpu-worker.ts --once || exit 1
  sleep 3
done
