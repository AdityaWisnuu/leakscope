#!/usr/bin/env bash
# down.sh — stop every zebrad/zainod started by up.sh from this workspace.
#   ./down.sh           stop, keep chain + wallets (next ./up.sh resumes)
#   ./down.sh --clean   stop and delete .data/ (all profiles: chains, wallets, keys)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for pidfile in "$ROOT"/.data/*/zainod.pid "$ROOT"/.data/*/zebrad.pid; do
  [ -f "$pidfile" ] || continue
  pid=$(cat "$pidfile")
  if kill -0 "$pid" 2>/dev/null; then
    echo "[down] stopping $(basename "$pidfile" .pid) pid $pid ($(basename "$(dirname "$pidfile")"))"
    kill -TERM "$pid" 2>/dev/null
    for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    kill -0 "$pid" 2>/dev/null && { echo "[down] force-killing $pid"; kill -9 "$pid"; }
  fi
  rm -f "$pidfile"
done
# stragglers (e.g. pid file lost)
pkill -f "zebrad -c $ROOT/.data/" 2>/dev/null && echo "[down] killed stray zebrad"
pkill -f "zainod start -c $ROOT/.data/" 2>/dev/null && echo "[down] killed stray zainod"

if [ "${1:-}" = "--clean" ]; then
  echo "[down] deleting $ROOT/.data"
  rm -rf "$ROOT/.data"
fi
echo "[down] done"
