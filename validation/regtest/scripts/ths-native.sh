#!/usr/bin/env bash
# ths-native.sh — run "Thus Spoke Zakura" (zcashlabs/thus-spoke-zakura) WITHOUT Docker.
#
# Upstream `ths` = docker containers: zakurad (Zebra fork) + Go lightwalletd + ths-server (Rust, axum,
# zakura-* wallet crates) + a React dashboard. Natively we swap in:
#   zakurad      -> zebrad 6.4.2 (accepts the same zakurad.toml after 3 path/addr edits)
#   lightwalletd -> zebrad's built-in CompactTxStreamer gRPC (rpc.lightwalletd_listen_addr)
#   ths-server   -> built from source (cargo, ~5 min), dashboard -> `npm run build` (~1 min)
#
#   scripts/ths-native.sh          # start (fresh chain every time, like upstream)
#   scripts/ths-native.sh stop
# Dashboard: http://127.0.0.1:8080   API: /api/v1/{status,accounts,faucet,send,mine,...}
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T="$ROOT/.data/ths"
SRC="$ROOT/src/thus-spoke-zakura"
THS="$ROOT/target-ths/release/ths-server"
ZEBRAD="$ROOT/.tools/bin/zebrad"
THS_REV=d80bd851afcc54f4bc5cc24fcd225d378cac94e0

stop() {
  for p in ths zebrad; do if [ -f "$T/$p.pid" ]; then kill "$(cat "$T/$p.pid")" 2>/dev/null || true; rm -f "$T/$p.pid"; fi; done
  pkill -f "zebrad -c $T/" 2>/dev/null || true
}
if [ "${1:-}" = stop ]; then stop; echo "[ths] stopped"; exit 0; fi

[ -x "$ZEBRAD" ] || { echo "run ./up.sh once first (builds zebrad)"; exit 1; }
if [ ! -d "$SRC" ]; then git clone -q https://github.com/zcashlabs/thus-spoke-zakura "$SRC"; git -C "$SRC" checkout -q "$THS_REV"; fi
if [ ! -x "$THS" ]; then
  echo "[ths] building ths-server (first run, ~5 min; rustup fetches the pinned 1.98 toolchain)"
  (cd "$SRC" && CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-4} CARGO_TARGET_DIR="$ROOT/target-ths" cargo build --release --locked -p ths-server)
fi
[ -f "$SRC/web/dist/index.html" ] || (cd "$SRC/web" && npm ci && npm run build)

stop; rm -rf "$T"; mkdir -p "$T/logs"
"$THS" init --data-dir "$T/app" --config-dir "$T/config" > "$T/dev-secrets.txt"   # disposable keys
# adapt the generated zakurad.toml for a native zebrad
sed -e 's|0.0.0.0:18233"|127.0.0.1:18233"\ncache_dir = false|' \
    -e 's|listen_addr = "0.0.0.0:18232"|listen_addr = "127.0.0.1:18232"\nlightwalletd_listen_addr = "127.0.0.1:9067"|' \
    -e "s|cache_dir = \"/data\"|cache_dir = \"$T/zebra\"|" "$T/config/zakurad.toml" > "$T/zebrad.toml"
nohup "$ZEBRAD" -c "$T/zebrad.toml" start > "$T/logs/zebrad.log" 2>&1 < /dev/null & echo $! > "$T/zebrad.pid"
for _ in $(seq 1 60); do nc -z 127.0.0.1 9067 2>/dev/null && break; sleep 0.5; done
(cd "$T" && exec env THS_LISTEN=127.0.0.1:8080 THS_ZAKURA_RPC=http://127.0.0.1:18232 THS_LIGHTWALLETD=http://127.0.0.1:9067 \
  THS_PUBLIC_ZAKURA_RPC=http://127.0.0.1:18232 THS_PUBLIC_LIGHTWALLETD=http://127.0.0.1:9067 THS_PUBLIC_P2P=127.0.0.1:18233 \
  THS_WEB_DIR="$SRC/web/dist" "$THS" serve --data-dir "$T/app") > "$T/logs/ths.log" 2>&1 < /dev/null &
echo $! > "$T/ths.pid"
for _ in $(seq 1 120); do curl -s -m 2 127.0.0.1:8080/api/v1/status >/dev/null && break; sleep 1; done
echo "[ths] dashboard http://127.0.0.1:8080  (accounts: curl 127.0.0.1:8080/api/v1/accounts; disposable keys in $T/dev-secrets.txt)"
