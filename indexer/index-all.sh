#!/usr/bin/env bash
# Indexes mainnet from Ironwood (NU6.3) activation to the current tip in 10k-block chunks.
set -euo pipefail
cd "$(dirname "$0")"
FROM=${FROM:-3428143}
STEP=10000
h=$FROM
while :; do
  end=$((h + STEP - 1))
  if [ -n "${TO:-}" ] && [ "$end" -gt "$TO" ]; then end=$TO; fi
  if ls ../data/txs_${h}_*.jsonl >/dev/null 2>&1; then echo "skip $h"; else
    node build-dataset.mjs --from "$h" --to "$end" --concurrency "${CONC:-32}" 2>&1 | grep -v "full txs:" || { echo "chunk $h failed"; exit 1; }
  fi
  [ -n "${TO:-}" ] && [ "$end" -ge "$TO" ] && break
  h=$((end + 1))
done
