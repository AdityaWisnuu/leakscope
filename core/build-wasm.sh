#!/usr/bin/env bash
# Builds the WASM bindings (wallet scanner + tx-facts parser) for Node and the browser.
#
# Needs: rustup target wasm32-unknown-unknown, wasm-bindgen-cli matching Cargo.lock
# (cargo install wasm-bindgen-cli --version <v> --locked), and a clang that can target
# wasm32: secp256k1-sys (pulled in unconditionally by zcash_transparent) compiles C.
# Apple's clang cannot; `brew install llvm` can. wasm-opt (brew install binaryen) is optional.
set -euo pipefail
cd "$(dirname "$0")"
source ~/.cargo/env 2>/dev/null || true

LLVM=${LLVM:-/opt/homebrew/opt/llvm/bin}
export CC_wasm32_unknown_unknown=${CC_wasm32_unknown_unknown:-$LLVM/clang}
export AR_wasm32_unknown_unknown=${AR_wasm32_unknown_unknown:-$LLVM/llvm-ar}
export CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-4}

cargo build --release --lib --target wasm32-unknown-unknown --features wasm
WASM=target/wasm32-unknown-unknown/release/leakscope_core.wasm

for t in nodejs:pkg-node web:pkg-web; do
  target=${t%%:*}; out=${t##*:}
  rm -rf "$out"
  wasm-bindgen --target "$target" --out-dir "$out" "$WASM"
  if command -v wasm-opt >/dev/null; then
    wasm-opt -Oz --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext \
      --enable-mutable-globals --enable-reference-types --enable-multivalue \
      "$out/leakscope_core_bg.wasm" -o "$out/leakscope_core_bg.wasm"
  fi
done
# The Node build is CommonJS; mark it so ESM importers resolve it correctly.
echo '{"type":"commonjs"}' > pkg-node/package.json

for f in pkg-node/leakscope_core_bg.wasm pkg-web/leakscope_core_bg.wasm; do
  raw=$(wc -c < "$f"); gz=$(gzip -9c "$f" | wc -c)
  br=$(command -v brotli >/dev/null && brotli -c -q 11 "$f" | wc -c || echo n/a)
  echo "$f: $raw bytes, gzip $gz, brotli $br"
done
